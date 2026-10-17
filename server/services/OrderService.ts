import "server-only";
import { randomUUID } from "node:crypto";
import { formatSLE } from "@/lib/money";
import type { Payment } from "@/server/db/schema";
import type { EmailService } from "@/server/integrations/email";
import { libraryLinksTemplate, orderReceiptTemplate } from "@/server/integrations/email/templates";
import type { MonimeClient } from "@/server/integrations/monime";
import { decryptField, encryptField, randomToken, sha256, signToken } from "@/server/lib/crypto";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { OrderRepository } from "@/server/repositories/OrderRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { Actor, RequestContext } from "./actor";
import { openCheckout } from "./checkout";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import type { ProductService } from "./ProductService";
import type { Fulfilment } from "./SettlementService";
import { runInTransaction, type Tx } from "./transaction";

export const DOWNLOAD_TOKEN_TTL_SECONDS = 60;

type OrderRepos = {
  orders: OrderRepository;
  payments: PaymentRepository;
  products: ProductRepository;
  wallets: CreatorWalletRepository;
};

export type OrderServiceDeps = {
  repos: OrderRepos;
  products: Pick<ProductService, "getPublic">;
  monime: MonimeClient;
  email: EmailService;
  settings: Pick<PlatformSettingsService, "get">;
  platformAccountId: () => string;
  appBaseUrl: string;
  downloadSecret: string;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
  transaction?: typeof runInTransaction;
};

export type LibraryDTO = {
  orderRef: string;
  productTitle: string;
  status: "active" | "processing" | "expired" | "revoked" | "limit_reached";
  downloadsUsed: number;
  downloadLimit: number;
  expiresAt: Date | null;
  files: { id: string; filename: string; sizeBytes: number }[];
};

/** Short, non-identifying order reference shown to buyers (used in the PDF watermark too). */
export const orderRef = (orderId: string) => orderId.replace(/-/g, "").slice(0, 8).toUpperCase();

/**
 * Product orders (implementation.md Phase 5): purchase start, entitlement on success, receipt,
 * library access and recovery. Buyers are guests: their email is stored encrypted, looked up by
 * a peppered hash, and the library link is a 256-bit token (only its hash is used for lookup).
 */
export class OrderService implements Fulfilment {
  private readonly repos: OrderRepos;
  private readonly deps: OrderServiceDeps;
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void>;
  private readonly transaction: typeof runInTransaction;

  constructor(deps: OrderServiceDeps) {
    this.deps = deps;
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
    this.transaction = deps.transaction ?? runInTransaction;
  }

  /**
   * Start a purchase. Returns the checkout URL and a claim value for an httpOnly cookie that lets
   * this browser open its downloads straight from the success page.
   */
  async start(
    input: { productId: string; email: string; buyerName: string | null },
    ctx: RequestContext,
  ): Promise<{ paymentId: string; redirectUrl: string; claim: string }> {
    const product = await this.deps.products.getPublic(input.productId);
    if (!product) throw new NotFoundError("This product isn't available.");
    const row = (await this.repos.products.findById(product.id))!;
    const wallet = await this.repos.wallets.findByUserId(row.creatorId);
    if (wallet?.status !== "active") throw new ConflictError("This product can't be bought right now.");

    await this.rateLimit("checkout:ip", ctx.ip);
    await this.rateLimit("checkout:creator", row.creatorId);

    const settings = await this.deps.settings.get();
    const accessToken = randomToken();
    const claimSecret = randomToken();
    const payment = await this.transaction(async (tx) => {
      const created = await this.repos.payments.insertPayment(
        {
          kind: "order",
          creatorId: row.creatorId,
          grossMinor: row.priceMinor,
          platformFeeBps: settings.productFeeBps,
          idempotencyKey: randomUUID(),
          ipHash: ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null,
        },
        tx,
      );
      await this.repos.orders.insert(
        created.id,
        {
          productId: row.id,
          creatorId: row.creatorId,
          buyerEmailEnc: encryptField(input.email),
          buyerEmailHash: pepperedHash("buyer-email", input.email),
          buyerName: input.buyerName,
          priceMinor: row.priceMinor,
          accessTokenHash: sha256(accessToken),
          accessTokenEnc: encryptField(accessToken),
          claimHash: sha256(claimSecret),
        },
        tx,
      );
      return created;
    });

    const back = `${this.base()}/p/${row.id}/purchase`;
    const redirectUrl = await openCheckout(
      { monime: this.deps.monime, payments: this.repos.payments, platformAccountId: this.deps.platformAccountId },
      payment,
      {
        name: product.title,
        lineItemName: product.title,
        description: `${product.title} by @${product.creator.handle}`,
        successUrl: `${back}/success?p=${payment.id}`,
        cancelUrl: `${back}/cancel?p=${payment.id}`,
        metadata: { kind: "order", creatorId: row.creatorId, productId: row.id },
      },
    );
    return { paymentId: payment.id, redirectUrl, claim: `${payment.id}.${claimSecret}` };
  }

  // ── Fulfilment (called by SettlementService) ─────────────────────────────────

  /** Inside the succeeded transition: exactly one entitlement per order. */
  async onSucceeded(payment: Payment, tx: Tx): Promise<void> {
    const order = await this.repos.orders.findByPaymentId(payment.id, tx);
    if (!order) throw new Error(`order missing for payment ${payment.id}`);
    const product = await this.repos.products.findById(order.productId, tx);
    const from = payment.settledAt ?? this.now();
    await this.repos.orders.grantEntitlement(
      {
        orderId: order.id,
        productId: order.productId,
        downloadLimit: product!.downloadLimit,
        expiresAt: new Date(from.getTime() + product!.accessDays * 86_400_000),
      },
      tx,
    );
  }

  /** After commit, on every delivery: send the receipt once. */
  async afterSucceeded(payment: Payment): Promise<void> {
    const order = await this.repos.orders.findByPaymentId(payment.id);
    if (!order || !(await this.repos.orders.claimReceipt(order.id, this.now()))) return;
    try {
      const [product, entitlement] = await Promise.all([
        this.repos.products.findById(order.productId),
        this.repos.orders.findEntitlementByOrder(order.id),
      ]);
      await this.deps.email.send({
        to: decryptField(order.buyerEmailEnc),
        ...orderReceiptTemplate({
          productTitle: product?.title ?? "your purchase",
          orderRef: orderRef(order.id),
          libraryUrl: this.libraryUrl(decryptField(order.accessTokenEnc)),
          downloadLimit: entitlement?.downloadLimit ?? 0,
          accessDays: product?.accessDays ?? 0,
        }),
      });
    } catch (err) {
      await this.repos.orders.releaseReceipt(order.id); // let a redelivery retry it
      throw err;
    }
  }

  // ── Buyer access ──────────────────────────────────────────────────────────────

  /** Library link for the success page, only for the browser holding the purchase's claim cookie. */
  async libraryUrlForClaim(paymentId: string, claimCookie: string | undefined): Promise<string | null> {
    if (!claimCookie) return null;
    const [cookiePaymentId, secret] = claimCookie.split(".");
    if (cookiePaymentId !== paymentId || !secret) return null;
    const order = await this.repos.orders.findByPaymentId(paymentId);
    if (!order?.claimHash || order.claimHash !== sha256(secret)) return null;
    const payment = await this.repos.payments.findById(paymentId);
    if (payment?.status !== "succeeded") return null;
    return this.libraryUrl(decryptField(order.accessTokenEnc));
  }

  async getLibrary(accessToken: string): Promise<LibraryDTO | null> {
    const resolved = await this.resolve(accessToken);
    if (!resolved) return null;
    const { order, product, entitlement, paymentStatus } = resolved;
    const files = (await this.repos.products.listAssets(order.productId, "file")).filter((a) => a.scanStatus === "clean");
    return {
      orderRef: orderRef(order.id),
      productTitle: product.title,
      status: this.libraryStatus(entitlement, paymentStatus),
      downloadsUsed: entitlement?.downloadsUsed ?? 0,
      downloadLimit: entitlement?.downloadLimit ?? product.downloadLimit,
      expiresAt: entitlement?.expiresAt ?? null,
      files: files.map((f) => ({ id: f.id, filename: f.originalFilename, sizeBytes: f.sizeBytes })),
    };
  }

  /** A 60-second signed download token for one file of this library. */
  async mintDownloadToken(accessToken: string, assetId: string): Promise<string> {
    const resolved = await this.resolve(accessToken);
    if (!resolved?.entitlement) throw new NotFoundError("This download isn't available.");
    const status = this.libraryStatus(resolved.entitlement, resolved.paymentStatus);
    if (status === "limit_reached") throw new ConflictError("You've used all your downloads for this purchase.");
    if (status !== "active") throw new ConflictError("Your access to this download has ended.");
    const asset = await this.repos.products.findAsset(assetId);
    if (!asset || asset.productId !== resolved.order.productId || asset.kind !== "file" || asset.scanStatus !== "clean") {
      throw new NotFoundError("This download isn't available.");
    }
    const exp = Math.floor(this.now().getTime() / 1000) + DOWNLOAD_TOKEN_TTL_SECONDS;
    return signToken(`${resolved.entitlement.id}|${asset.id}|${exp}`, this.deps.downloadSecret);
  }

  /** "Lost your link?": always succeeds silently; emails links only to the address on file. */
  async sendLibraryLinks(email: string): Promise<void> {
    const rows = await this.repos.orders.listSucceededByEmailHash(pepperedHash("buyer-email", email));
    if (!rows.length) return;
    await this.deps.email.send({
      to: email,
      ...libraryLinksTemplate({
        items: rows.map((r) => ({ title: r.productTitle, url: this.libraryUrl(decryptField(r.order.accessTokenEnc)) })),
        recoverUrl: `${this.base()}/library`,
      }),
    });
  }

  // ── Creator ───────────────────────────────────────────────────────────────────

  async listForCreator(actor: Actor) {
    const rows = await this.repos.orders.listForCreator(actor.userId);
    return rows.map(({ order, payment, productTitle }) => ({
      orderRef: orderRef(order.id),
      productTitle,
      buyerName: order.buyerName,
      priceMinor: order.priceMinor,
      status: payment.status === "succeeded" ? ("paid" as const) : payment.status === "pending" || payment.status === "created" || payment.status === "under_review" ? ("processing" as const) : ("unpaid" as const),
      creatorNetMinor: payment.creatorNetMinor,
      platformFeeMinor: payment.platformFeeMinor,
      monimeFeeMinor: payment.monimeFeeMinor,
      feeEstimated: payment.monimeFeeSource === "estimated",
      at: payment.settledAt ?? order.createdAt,
      priceLabel: formatSLE(order.priceMinor),
    }));
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async resolve(accessToken: string) {
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(accessToken)) return null;
    const order = await this.repos.orders.findByAccessTokenHash(sha256(accessToken));
    if (!order) return null;
    const [product, entitlement, payment] = await Promise.all([
      this.repos.products.findById(order.productId),
      this.repos.orders.findEntitlementByOrder(order.id),
      this.repos.payments.findById(order.paymentId),
    ]);
    if (!product || !payment) return null;
    return { order, product, entitlement, paymentStatus: payment.status };
  }

  private libraryStatus(
    entitlement: { downloadsUsed: number; downloadLimit: number; expiresAt: Date; revokedAt: Date | null } | null,
    paymentStatus: Payment["status"],
  ): LibraryDTO["status"] {
    if (!entitlement) return paymentStatus === "failed" || paymentStatus === "canceled" || paymentStatus === "expired" ? "revoked" : "processing";
    if (entitlement.revokedAt || paymentStatus !== "succeeded") return "revoked";
    if (entitlement.expiresAt <= this.now()) return "expired";
    if (entitlement.downloadsUsed >= entitlement.downloadLimit) return "limit_reached";
    return "active";
  }

  private libraryUrl(accessToken: string) {
    return `${this.base()}/library/${accessToken}`;
  }

  private base() {
    return this.deps.appBaseUrl.replace(/\/$/, "");
  }
}

