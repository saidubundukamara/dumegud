import "server-only";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import { isStaff, type Actor } from "./actor";
import { noAudit, type AuditLogger } from "./compliance";
import type { ProductChange } from "./ProductService";

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
  ) {}

  async listPending(actor: Actor) {
    this.assertStaff(actor);
    const rows = await this.products.listByStatus("pending_review");
    return Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        priceMinor: p.priceMinor,
        submittedAt: p.updatedAt,
        files: (await this.products.listAssets(p.id, "file"))
          .filter((a) => a.scanStatus === "pending" || a.scanStatus === "clean")
          .map((a) => ({ filename: a.originalFilename, sizeBytes: a.sizeBytes, mimeType: a.mimeType, sha256: a.sha256 })),
      })),
    );
  }

  async approve(actor: Actor, productId: string): Promise<ProductChange> {
    this.assertStaff(actor);
    const product = await this.products.findById(productId);
    if (!product) throw new NotFoundError();
    const files = (await this.products.listAssets(productId, "file")).filter((a) => a.scanStatus === "pending" || a.scanStatus === "clean");
    if (!files.length) throw new ConflictError("This product has no files to approve.");
    await this.products.setScanStatus(productId, "pending", "clean");
    const published = await this.products.setStatus(productId, ["pending_review"], "published", {
      publishedAt: product.publishedAt ?? this.now(),
      reviewNote: null,
    });
    if (!published) throw new ConflictError("This product is no longer waiting for review.");
    logger.info("product approved", { productId, reviewerId: actor.userId });
    await this.audit.log({ actor, action: "product.approve", targetType: "product", targetId: productId, before: { status: "pending_review" }, after: { status: "published" } });
    return this.change(published.creatorId, productId);
  }

  async reject(actor: Actor, productId: string, note: string): Promise<ProductChange> {
    this.assertStaff(actor);
    const rejected = await this.products.setStatus(productId, ["pending_review"], "draft", { reviewNote: note.slice(0, 500) });
    if (!rejected) throw new ConflictError("This product is no longer waiting for review.");
    logger.info("product sent back to draft", { productId, reviewerId: actor.userId });
    await this.audit.log({ actor, action: "product.reject", targetType: "product", targetId: productId, after: { note } });
    return this.change(rejected.creatorId, productId);
  }

  private assertStaff(actor: Actor) {
    if (!isStaff(actor.role)) throw new ForbiddenError();
  }

  private async change(creatorId: string, productId: string): Promise<ProductChange> {
    const profile = await this.profiles.findByUserId(creatorId);
    return { productId, profileId: profile?.id ?? null };
  }
}
