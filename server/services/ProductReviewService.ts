import "server-only";
import type { ProductStatus } from "@/server/db/schema";
import { decodeCursor, toPage } from "@/server/lib/cursor";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import { assertPermission, type AdminActor } from "./actor";
import { noAudit, type AuditLogger } from "./compliance";
import type { ProductChange } from "./ProductService";
import { runInTransaction } from "./transaction";

/**
 * Staff review of products (the MVP "scan": magic-byte checks at upload + a human look before
 * anything is sold; no malware vendor yet, implementation.md Appendix F). Approving marks every
 * uploaded file clean and publishes. Phase 8 folds this into the full admin dashboard and audit log.
 */
export class ProductReviewService {
  constructor(
    private readonly products: ProductRepository,
    private readonly profiles: CreatorProfileRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly audit: AuditLogger = noAudit,
    private readonly transaction: typeof runInTransaction = runInTransaction,
  ) {}

  async listPending(actor: AdminActor) {
    assertPermission(actor, "products.view");
    const rows = await this.products.listByStatus("pending_review");
    return Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        creatorId: p.creatorId,
        title: p.title,
        description: p.description,
        priceMinor: p.priceMinor,
        submittedAt: p.updatedAt,
        /** The exact version shown, posted back on approve. */
        version: p.updatedAt.toISOString(),
        files: (await this.products.listAssets(p.id, "file"))
          .filter((a) => a.scanStatus === "pending" || a.scanStatus === "clean")
          .map((a) => ({ filename: a.originalFilename, sizeBytes: a.sizeBytes, mimeType: a.mimeType, sha256: a.sha256 })),
      })),
    );
  }

  /** Live or taken-down products, most recently changed first (staff lists). */
  async listByStatus(actor: AdminActor, status: Extract<ProductStatus, "published" | "suspended" | "unpublished">, cursor: unknown) {
    assertPermission(actor, "products.view");
    const limit = 30;
    return toPage(await this.products.listByStatusNewest(status, limit + 1, undefined, decodeCursor(cursor)), limit, (p) => p.updatedAt);
  }

  /**
   * `reviewedVersion` is the product's `updatedAt` as the reviewer saw it. Edits and file changes
   * bump it, so anything the creator changed after the page loaded is never published unseen.
   */
  async approve(actor: AdminActor, productId: string, reviewedVersion?: Date): Promise<ProductChange> {
    assertPermission(actor, "products.review");
    const published = await this.transaction(async (tx) => {
      // The product lock serialises this with reject, unpublish, edits and file changes.
      const product = await this.products.lockById(productId, tx);
      if (!product) throw new NotFoundError();
      if (product.status !== "pending_review") throw new ConflictError("This product is no longer waiting for review.");
      if (reviewedVersion && product.updatedAt.getTime() !== reviewedVersion.getTime()) {
        throw new ConflictError("The creator changed this product since you opened it. Reload and review it again.");
      }
      const files = (await this.products.listAssets(productId, "file", tx)).filter((a) => a.scanStatus === "pending" || a.scanStatus === "clean");
      if (!files.length) throw new ConflictError("This product has no files to approve.");
      await this.products.setScanStatus(productId, files.map((f) => f.id), "pending", "clean", tx);
      return this.products.setStatus(productId, ["pending_review"], "published", { publishedAt: product.publishedAt ?? this.now(), reviewNote: null }, tx);
    });
    if (!published) throw new ConflictError("This product is no longer waiting for review.");
    logger.info("product approved", { productId, reviewerId: actor.adminId });
    await this.audit.log({ actor, action: "product.approve", targetType: "product", targetId: productId, before: { status: "pending_review" }, after: { status: "published" } });
    return this.change(published.creatorId, productId);
  }

  async reject(actor: AdminActor, productId: string, note: string): Promise<ProductChange> {
    assertPermission(actor, "products.review");
    const rejected = await this.products.setStatus(productId, ["pending_review"], "draft", { reviewNote: note.slice(0, 500) });
    if (!rejected) throw new ConflictError("This product is no longer waiting for review.");
    logger.info("product sent back to draft", { productId, reviewerId: actor.adminId });
    await this.audit.log({ actor, action: "product.reject", targetType: "product", targetId: productId, after: { note } });
    return this.change(rejected.creatorId, productId);
  }

  private async change(creatorId: string, productId: string): Promise<ProductChange> {
    const profile = await this.profiles.findByUserId(creatorId);
    return { productId, profileId: profile?.id ?? null };
  }
}
