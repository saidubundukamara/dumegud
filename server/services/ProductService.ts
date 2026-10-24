import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { LICENSE_SUMMARIES, type License } from "@/lib/license";
import { formatSLE } from "@/lib/money";
import type { Product, ProductAsset, ProductStatus } from "@/server/db/schema";
import { ObjectTooLargeError, type ObjectStorage } from "@/server/integrations/r2/storage";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import { extensionOf, safeFilename, SNIFF_BYTES, sniffMatches, UPLOAD_TYPES } from "@/server/lib/uploads";
import type { CategoryRepository } from "@/server/repositories/CategoryRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import type { ProductInput } from "@/server/validation/product";
import type { Actor } from "./actor";
import { noRestrictions, type RestrictionGuard } from "./compliance";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import { runInTransaction, type Tx } from "./transaction";

const MAX_FILES = 10;
const MAX_PREVIEWS = 4;
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 10 * 60;

export type ProductBuckets = { products: string; uploads: string; public: string };

export type AssetDTO = {
  id: string;
  kind: ProductAsset["kind"];
  filename: string;
  sizeBytes: number;
  status: ProductAsset["scanStatus"];
  /** Public URL (previews only). */
  url: string | null;
};

export type ReadinessItem = { key: "email" | "terms" | "file"; label: string; done: boolean };

const REVIEW_BLOCKERS: Record<ReadinessItem["key"], string> = {
  email: "confirm your email",
  terms: "accept the creator terms",
  file: "upload at least one file",
};

export type OwnProductDTO = {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  priceMinor: number;
  licenseType: License;
  licenseText: string;
  status: ProductStatus;
  reviewNote: string | null;
  ownershipDeclared: boolean;
  /** Files can be removed only before the product was ever published (buyers rely on them). */
  filesLocked: boolean;
  assets: AssetDTO[];
};

export type PublicProductDTO = {
  id: string;
  title: string;
  description: string;
  priceMinor: number;
  license: { type: License; label: string; summary: string; extra: string };
  downloadLimit: number;
  accessDays: number;
  files: { format: string; sizeBytes: number }[];
  previews: string[];
  watermarked: boolean;
  creator: { profileId: string; handle: string; displayName: string };
};

/** Cache tags for a product change (ids only). */
export type ProductChange = { productId: string; profileId: string | null };

type ProductRepos = {
  products: ProductRepository;
  categories: CategoryRepository;
  profiles: CreatorProfileRepository;
  users: UserRepository;
};

export type ProductServiceDeps = {
  repos: ProductRepos;
  settings: Pick<PlatformSettingsService, "get">;
  /** Null while R2 isn't configured: uploads are unavailable. */
  storage: ObjectStorage | null;
  buckets: ProductBuckets;
  publicAssetUrl: (key: string) => string | null;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
  restrictions?: RestrictionGuard;
  /** While an account deletion is scheduled, nothing new goes on sale. */
  deletions?: { hasOpenRequest(userId: string, tx?: Tx): Promise<boolean> };
  transaction?: typeof runInTransaction;
};

/**
 * Creator-side products (implementation.md Phase 5): drafts, uploads straight to R2 with
 * magic-byte verification, review submission. Every method is owner-scoped.
 *
 * Lifecycle: draft → pending_review → published → unpublished. Editing a published product,
 * or adding a file to it, sends it back to review; staff publish (ProductReviewService).
 */
export class ProductService {
  private readonly repos: ProductRepos;
  private readonly settings: ProductServiceDeps["settings"];
  private readonly storage: ObjectStorage | null;
  private readonly buckets: ProductBuckets;
  private readonly publicAssetUrl: ProductServiceDeps["publicAssetUrl"];
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void>;
  private readonly restrictions: RestrictionGuard;
  private readonly deletions: ProductServiceDeps["deletions"];
  private readonly transaction: typeof runInTransaction;

  constructor(deps: ProductServiceDeps) {
    this.transaction = deps.transaction ?? runInTransaction;
    this.deletions = deps.deletions;
    this.restrictions = deps.restrictions ?? noRestrictions;
    this.repos = deps.repos;
    this.settings = deps.settings;
    this.storage = deps.storage;
    this.buckets = deps.buckets;
    this.publicAssetUrl = deps.publicAssetUrl;
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
  }

  get uploadsEnabled(): boolean {
    return this.storage !== null;
  }

  // ── Owner ─────────────────────────────────────────────────────────────────────

  async listOwn(actor: Actor) {
    const rows = await this.repos.products.listOwned(actor.userId);
    return rows.map((p) => ({ id: p.id, title: p.title, priceMinor: p.priceMinor, status: p.status, updatedAt: p.updatedAt }));
  }

  async getOwn(actor: Actor, productId: string): Promise<OwnProductDTO> {
    const product = await this.owned(actor, productId);
    const assets = await this.repos.products.listAssets(product.id);
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      categoryId: product.categoryId,
      priceMinor: product.priceMinor,
      licenseType: product.licenseType,
      licenseText: product.licenseText,
      status: product.status,
      reviewNote: product.reviewNote,
      ownershipDeclared: product.ownershipDeclaredAt !== null,
      filesLocked: product.publishedAt !== null,
      assets: assets.map((a) => this.assetDTO(a)),
    };
  }

  async create(actor: Actor, input: ProductInput): Promise<ProductChange> {
    const profile = await this.repos.profiles.findByUserId(actor.userId);
    if (!profile) throw new ConflictError("Set up your page before adding products.");
    if (profile.status === "suspended") throw new ConflictError("Your page is suspended. Contact support.");
    const settings = await this.checkInput(input);
    const product = await this.repos.products.insert(actor.userId, {
      ...this.write(input),
      downloadLimit: settings.defaultDownloadLimit,
      accessDays: settings.defaultAccessDays,
    });
    return { productId: product.id, profileId: profile.id };
  }

  async update(actor: Actor, productId: string, input: ProductInput): Promise<ProductChange> {
    const product = await this.owned(actor, productId);
    await this.checkInput(input);
    // Changes to something buyers can see go back through review.
    const status: ProductStatus = product.status === "published" ? "pending_review" : product.status;
    // Guarded by the status read above: a review decision or unpublish in between wins.
    const updated = await this.repos.products.updateOwned(actor.userId, productId, { ...this.write(input), status }, product.status);
    if (!updated) throw new ConflictError("This product changed while saving. Reload it and try again.");
    return this.change(updated);
  }

  async submitForReview(actor: Actor, productId: string, ownershipDeclared: boolean): Promise<ProductChange> {
    const product = await this.owned(actor, productId);
    if (!["draft", "unpublished"].includes(product.status)) throw new ConflictError("This product is already in review or live.");
    await this.restrictions.assertAllowed(actor.userId, "publish", "Publishing isn't available on your account right now. Contact support.");
    if (await this.deletions?.hasOpenRequest(actor.userId)) {
      throw new ConflictError("Your account is scheduled for deletion. Keep your account first, then put products on sale.");
    }
    const missing = (await this.readinessOf(actor, productId)).filter((i) => !i.done).map((i) => REVIEW_BLOCKERS[i.key]);
    if (!ownershipDeclared) missing.push("confirm you own the rights to sell it");
    if (missing.length) throw new ConflictError(`Before submitting: ${missing.join("; ")}.`);

    // The user row lock serialises this with a deletion request (which takes it too): a deletion
    // committed since the check above is seen here, and nothing new goes on sale.
    const updated = await this.transaction(async (tx) => {
      await this.repos.users.lockById(actor.userId, tx);
      if (await this.deletions?.hasOpenRequest(actor.userId, tx)) {
        throw new ConflictError("Your account is scheduled for deletion. Keep your account first, then put products on sale.");
      }
      return this.repos.products.setStatus(productId, ["draft", "unpublished"], "pending_review", { ownershipDeclaredAt: this.now(), reviewNote: null }, tx);
    });
    if (!updated) throw new ConflictError("This product changed while submitting. Please try again.");
    return this.change(updated);
  }

  /** What still stands between this product and review (the ownership declaration is asked on submit). */
  async readiness(actor: Actor, productId: string): Promise<ReadinessItem[]> {
    await this.owned(actor, productId);
    return this.readinessOf(actor, productId);
  }

  private async readinessOf(actor: Actor, productId: string): Promise<ReadinessItem[]> {
    const [profile, files] = await Promise.all([
      this.repos.profiles.findByUserId(actor.userId),
      this.repos.products.listAssets(productId, "file"),
    ]);
    return [
      { key: "email", label: "Confirm your email", done: actor.emailVerified },
      { key: "terms", label: "Accept the creator terms", done: Boolean(profile?.creatorTermsAcceptedAt) },
      { key: "file", label: "Upload the file buyers get", done: files.some((a) => a.scanStatus === "pending" || a.scanStatus === "clean") },
    ];
  }

  async unpublish(actor: Actor, productId: string): Promise<ProductChange> {
    await this.owned(actor, productId);
    const updated = await this.repos.products.setStatus(productId, ["published", "pending_review"], "unpublished");
    if (!updated) throw new ConflictError("Only live or in-review products can be unpublished.");
    return this.change(updated);
  }

  // ── Uploads ───────────────────────────────────────────────────────────────────

  /** Step 1: record the asset and return a presigned PUT bound to its type and exact size. */
  async requestUpload(actor: Actor, input: { productId: string; kind: ProductAsset["kind"]; filename: string; size: number }) {
    const storage = this.requireStorage();
    await this.rateLimit("upload:user", actor.userId);
    await this.restrictions.assertAllowed(actor.userId, "upload", "Uploads aren't available on your account right now. Contact support.");
    const product = await this.owned(actor, input.productId);

    const settings = await this.settings.get();
    const ext = extensionOf(input.filename);
    const type = ext ? UPLOAD_TYPES[ext] : undefined;
    const allowed = ext !== null && type !== undefined && (input.kind === "preview_image" ? type.previewImage : settings.allowedUploadTypes.includes(ext === "jpeg" ? "jpg" : ext));
    if (!allowed) {
      const list = input.kind === "preview_image" ? "JPG, PNG or WebP" : settings.allowedUploadTypes.join(", ").toUpperCase();
      throw new ValidationError(`That file type isn't allowed. Use ${list}.`);
    }
    const maxBytes = input.kind === "preview_image" ? MAX_PREVIEW_BYTES : settings.maxUploadBytes;
    if (input.size > maxBytes) throw new ValidationError(`That file is too large. The limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`);

    // Random keys: nothing about the filename or buyer leaks into storage.
    const key =
      input.kind === "file"
        ? `products/${actor.userId}/${product.id}/${randomUUID()}`
        : `staging/previews/${actor.userId}/${randomUUID()}`;
    // Count and insert under the product lock, so parallel requests can't go over the limit.
    const asset = await this.transaction(async (tx) => {
      await this.repos.products.lockById(product.id, tx);
      const existing = (await this.repos.products.listAssets(product.id, input.kind, tx)).filter((a) => a.scanStatus !== "rejected");
      if (existing.length >= (input.kind === "file" ? MAX_FILES : MAX_PREVIEWS)) {
        throw new ValidationError(input.kind === "file" ? `A product can have at most ${MAX_FILES} files.` : `Add at most ${MAX_PREVIEWS} preview images.`);
      }
      return this.repos.products.insertAsset(
        {
          productId: product.id,
          kind: input.kind,
          r2Key: key,
          originalFilename: safeFilename(input.filename),
          mimeType: type!.mime,
          sizeBytes: input.size,
          scanStatus: "uploading",
          watermarkable: input.kind === "file" && Boolean(type!.watermarkable),
        },
        tx,
      );
    });
    const url = await storage.presignPut({
      bucket: input.kind === "file" ? this.buckets.products : this.buckets.uploads,
      key,
      contentType: type!.mime,
      contentLength: input.size,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return { assetId: asset.id, url, contentType: type!.mime };
  }

  /**
   * Step 2: verify what actually arrived. The size must match and the first bytes must really be
   * the declared type (a renamed executable is rejected). Files then wait for staff review;
   * preview images are re-encoded (stripping metadata) and published to the public bucket.
   */
  async confirmUpload(actor: Actor, assetId: string): Promise<ProductChange> {
    const storage = this.requireStorage();
    const asset = await this.repos.products.findAsset(assetId);
    if (!asset) throw new NotFoundError("That upload couldn't be found.");
    const product = await this.owned(actor, asset.productId);
    if (asset.scanStatus !== "uploading") return this.change(product);

    const bucket = asset.kind === "file" ? this.buckets.products : this.buckets.uploads;
    const head = await storage.headObject(bucket, asset.r2Key);
    if (!head) throw new ValidationError("The upload didn't arrive. Please try again.");
    const ext = extensionOf(asset.originalFilename)!;
    const sample = await storage.getRange(bucket, asset.r2Key, 0, SNIFF_BYTES - 1);
    if (head.size !== asset.sizeBytes || !sample || !(await sniffMatches(ext, sample))) {
      if (await this.reject(asset, bucket, head.size !== asset.sizeBytes ? "size mismatch" : "content does not match its type")) {
        throw new ValidationError(`That file isn't a real .${ext} file, so it was removed.`);
      }
    } else if (asset.kind === "preview_image") {
      await this.publishPreview(storage, asset);
    } else if (await this.repos.products.finishUpload(asset.id, asset.r2Key, { scanStatus: "pending" })) {
      // New downloadable content on a live product needs review again. Both writes are guarded on
      // the current state, not on the status read above (an approval may have landed meanwhile).
      await this.repos.products.setStatus(product.id, ["published"], "pending_review");
      await this.repos.products.touch(product.id);
    }
    return this.change((await this.repos.products.findById(product.id)) ?? product);
  }

  /** SHA-256 of an uploaded file, streamed (run after the response; large files). */
  async hashAsset(assetId: string): Promise<void> {
    const asset = await this.repos.products.findAsset(assetId);
    if (!asset || asset.kind !== "file" || asset.sha256 || !this.storage) return;
    const stream = await this.storage.streamObject(this.buckets.products, asset.r2Key);
    if (!stream) return;
    const hash = createHash("sha256");
    for await (const chunk of stream) hash.update(chunk);
    await this.repos.products.updateAsset(asset.id, { sha256: hash.digest("hex") });
  }

  async deleteAsset(actor: Actor, assetId: string): Promise<ProductChange> {
    const storage = this.requireStorage();
    const asset = await this.repos.products.findAsset(assetId);
    if (!asset) throw new NotFoundError("That file couldn't be found.");
    const product = await this.owned(actor, asset.productId);
    // Re-checked under the product lock: an approval in between puts these files on sale.
    await this.transaction(async (tx) => {
      const locked = await this.repos.products.lockById(product.id, tx);
      if (asset.kind === "file" && (product.publishedAt || locked?.publishedAt)) {
        throw new ConflictError("Files of a product that has been on sale can't be removed: buyers rely on them.");
      }
      await this.repos.products.deleteAsset(asset.id, tx);
      await this.repos.products.touch(product.id, tx);
    });
    const bucket = asset.kind === "file" ? this.buckets.products : asset.scanStatus === "clean" ? this.buckets.public : this.buckets.uploads;
    await storage.deleteObject(bucket, asset.r2Key).catch((err) => logger.warn("asset object delete failed", { err }));
    return this.change(product);
  }

  // ── Public ────────────────────────────────────────────────────────────────────

  /** Product page data: published product of a published, active creator. Null otherwise. */
  /** Product pages that can be bought right now, for the sitemap. */
  async listForSitemap(limit = 45_000): Promise<{ id: string; updatedAt: Date }[]> {
    return this.repos.products.listPublicForSitemap(limit);
  }

  async getPublic(productId: string): Promise<PublicProductDTO | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) return null;
    const product = await this.repos.products.findById(productId);
    if (!product || product.status !== "published") return null;
    const [profile, owner, assets] = await Promise.all([
      this.repos.profiles.findByUserId(product.creatorId),
      this.repos.users.findAuthState(product.creatorId),
      this.repos.products.listAssets(product.id),
    ]);
    if (!profile || profile.status !== "published" || owner?.status !== "active") return null;
    const files = assets.filter((a) => a.kind === "file" && a.scanStatus === "clean");
    if (!files.length) return null;
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      priceMinor: product.priceMinor,
      license: { type: product.licenseType, ...LICENSE_SUMMARIES[product.licenseType], extra: product.licenseText },
      downloadLimit: product.downloadLimit,
      accessDays: product.accessDays,
      files: files.map((f) => ({ format: (extensionOf(f.originalFilename) ?? "file").toUpperCase(), sizeBytes: f.sizeBytes })),
      previews: assets
        .filter((a) => a.kind === "preview_image" && a.scanStatus === "clean")
        .map((a) => this.publicAssetUrl(a.r2Key))
        .filter((u): u is string => Boolean(u)),
      watermarked: files.some((f) => f.watermarkable),
      creator: { profileId: profile.id, handle: profile.handle, displayName: profile.displayName },
    };
  }

  /** Shop grid on a creator page. */
  async listPublicForCreator(creatorUserId: string) {
    const rows = await this.repos.products.listPublishedForCreator(creatorUserId);
    return rows.map((p) => ({ id: p.id, title: p.title, priceMinor: p.priceMinor }));
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async owned(actor: Actor, productId: string): Promise<Product> {
    const product = /^[0-9a-f-]{36}$/i.test(productId) ? await this.repos.products.findOwned(actor.userId, productId) : null;
    if (!product) throw new NotFoundError("We couldn't find that product.");
    if (product.status === "suspended") throw new ConflictError("This product is suspended. Contact support.");
    return product;
  }

  private async checkInput(input: ProductInput) {
    const settings = await this.settings.get();
    if (input.price < settings.minProductPriceMinor || input.price > settings.maxProductPriceMinor) {
      throw new ValidationError(undefined, {
        price: [`Set a price between ${formatSLE(settings.minProductPriceMinor)} and ${formatSLE(settings.maxProductPriceMinor)}.`],
      });
    }
    if (input.categoryId && !(await this.repos.categories.isActive(input.categoryId))) {
      throw new ValidationError(undefined, { categoryId: ["Choose a category from the list."] });
    }
    return settings;
  }

  private write(input: ProductInput) {
    return {
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      priceMinor: input.price,
      licenseType: input.licenseType,
      licenseText: input.licenseText,
    };
  }

  private async publishPreview(storage: ObjectStorage, asset: ProductAsset) {
    let webp: Buffer | null = null;
    try {
      const object = await storage.getObject(this.buckets.uploads, asset.r2Key, MAX_PREVIEW_BYTES);
      if (object) {
        webp = await sharp(object.body, { limitInputPixels: 40_000_000, failOn: "error" })
          .rotate()
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      }
    } catch (err) {
      if (!(err instanceof ObjectTooLargeError)) logger.warn("preview re-encode failed", { err });
    }
    if (!webp) {
      if (!(await this.reject(asset, this.buckets.uploads, "unreadable image"))) return;
      throw new ValidationError("That image couldn't be read. Use a JPG, PNG or WebP.");
    }
    const publicKey = `previews/${asset.productId}/${randomUUID()}.webp`;
    await storage.putObject({
      bucket: this.buckets.public,
      key: publicKey,
      body: new Uint8Array(webp),
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    const finished = await this.repos.products.finishUpload(asset.id, asset.r2Key, {
      r2Key: publicKey,
      mimeType: "image/webp",
      sizeBytes: webp.byteLength,
      scanStatus: "clean",
    });
    if (!finished) {
      // A concurrent confirm already finished this upload: drop our copy, keep theirs.
      await storage.deleteObject(this.buckets.public, publicKey).catch(() => {});
      return;
    }
    await this.repos.products.touch(asset.productId);
    await storage.deleteObject(this.buckets.uploads, asset.r2Key).catch(() => {});
  }

  /** Returns false when a concurrent confirm already finished the upload (nothing is changed then). */
  private async reject(asset: ProductAsset, bucket: string, detail: string): Promise<boolean> {
    if (!(await this.repos.products.finishUpload(asset.id, asset.r2Key, { scanStatus: "rejected", scanDetail: detail }))) return false;
    await this.storage?.deleteObject(bucket, asset.r2Key).catch(() => {});
    logger.warn("upload rejected", { assetId: asset.id, detail });
    return true;
  }

  private requireStorage(): ObjectStorage {
    if (!this.storage) throw new ConflictError("File uploads aren't available yet.");
    return this.storage;
  }

  private assetDTO(a: ProductAsset): AssetDTO {
    return {
      id: a.id,
      kind: a.kind,
      filename: a.originalFilename,
      sizeBytes: a.sizeBytes,
      status: a.scanStatus,
      url: a.kind === "preview_image" && a.scanStatus === "clean" ? this.publicAssetUrl(a.r2Key) : null,
    };
  }

  private async change(product: Product): Promise<ProductChange> {
    const profile = await this.repos.profiles.findByUserId(product.creatorId);
    return { productId: product.id, profileId: profile?.id ?? null };
  }
}
