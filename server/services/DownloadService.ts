import "server-only";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { ProductAsset } from "@/server/db/schema";
import type { ObjectStorage } from "@/server/integrations/r2/storage";
import { verifySignedToken } from "@/server/lib/crypto";
import { pepperedHash } from "@/server/lib/hash";
import { logger } from "@/server/lib/logger";
import type { OrderRepository } from "@/server/repositories/OrderRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { RequestContext } from "./actor";
import { orderRef } from "./OrderService";

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
/** PDFs above this are served unstamped: stamping loads the whole file into memory. */
const WATERMARK_MAX_BYTES = 50 * 1024 * 1024;

export type DownloadResult =
  | { ok: true; url: string }
  | { ok: false; reason: "invalid" | "expired" | "limit" | "unavailable" };

/**
 * Redeems a 60-second download token (implementation.md Phase 5). Every check runs here, at
 * the moment of download: signature and expiry, payment still succeeded, entitlement not
 * revoked or expired, and an atomic count against the download limit. The file itself is
 * served from a 5-minute presigned R2 URL that forces a download; bucket objects are private.
 */
export class DownloadService {
  constructor(
    private readonly repos: { orders: OrderRepository; products: ProductRepository },
    private readonly storage: ObjectStorage | null,
    private readonly productsBucket: string,
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async redeem(token: string, ctx: RequestContext): Promise<DownloadResult> {
    const payload = verifySignedToken(token, this.secret);
    const [entitlementId, assetId, expText] = payload?.split("|") ?? [];
    if (!entitlementId || !assetId || !/^\d+$/.test(expText ?? "")) return { ok: false, reason: "invalid" };
    if (Number(expText) * 1000 < this.now().getTime()) return { ok: false, reason: "expired" };
    if (!this.storage) return { ok: false, reason: "unavailable" };

    const row = await this.repos.orders.findEntitlementForDownload(entitlementId);
    const asset = await this.repos.products.findAsset(assetId);
    if (
      !row ||
      row.paymentStatus !== "succeeded" ||
      !asset ||
      asset.productId !== row.entitlement.productId ||
      asset.kind !== "file" ||
      asset.scanStatus !== "clean"
    ) {
      return { ok: false, reason: "unavailable" };
    }

    const counted = await this.repos.orders.useDownload(entitlementId, this.now());
    if (!counted) {
      const e = row.entitlement;
      return { ok: false, reason: e.downloadsUsed >= e.downloadLimit ? "limit" : "unavailable" };
    }
    await this.repos.orders.recordDownload({
      entitlementId,
      assetId,
      ipHash: ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null,
      userAgent: ctx.userAgent,
    });

    const key = asset.watermarkable ? await this.watermarked(row.order.id, asset) : asset.r2Key;
    const url = await this.storage.presignGet({
      bucket: this.productsBucket,
      key,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      filename: asset.originalFilename,
      contentType: asset.mimeType,
    });
    return { ok: true, url };
  }

  /**
   * Per-order PDF copy with a footer naming the order (never the buyer: PRD privacy note),
   * created on first download and reused after. Falls back to the original if the PDF can't be
   * stamped (encrypted, malformed or too large).
   */
  private async watermarked(orderId: string, asset: ProductAsset): Promise<string> {
    const storage = this.storage!;
    const key = `watermarked/${orderId}/${asset.id}.pdf`;
    try {
      if (await storage.headObject(this.productsBucket, key)) return key;
      if (asset.sizeBytes > WATERMARK_MAX_BYTES) return asset.r2Key;
      const original = await storage.getObject(this.productsBucket, asset.r2Key, WATERMARK_MAX_BYTES);
      if (!original) return asset.r2Key;
      const stamped = await stampPdf(original.body, `Licensed to order #${orderRef(orderId)} - DuMeGud`);
      await storage.putObject({ bucket: this.productsBucket, key, body: stamped, contentType: "application/pdf" });
      return key;
    } catch (err) {
      logger.warn("pdf watermark failed; serving the original", { assetId: asset.id, err });
      return asset.r2Key;
    }
  }
}

export async function stampPdf(bytes: Uint8Array, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    page.drawText(text, { x: 24, y: 12, size: 7, font, color: rgb(0.45, 0.45, 0.45) });
  }
  return pdf.save();
}
