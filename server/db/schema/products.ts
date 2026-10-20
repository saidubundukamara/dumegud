import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { categories } from "./creators";
import { createdAt, id, timestamps } from "./columns";
import { payments } from "./payments";

// Digital products and delivery (implementation.md Phase 5).

export const productStatus = pgEnum("product_status", ["draft", "pending_review", "published", "unpublished", "suspended"]);
export const licenseType = pgEnum("license_type", ["personal", "personal_modify", "commercial"]);
export const assetKind = pgEnum("product_asset_kind", ["file", "preview_image"]);
export const scanStatus = pgEnum("scan_status", ["uploading", "pending", "clean", "rejected"]);

export type ProductStatus = (typeof productStatus.enumValues)[number];
export type LicenseType = (typeof licenseType.enumValues)[number];
export type AssetKind = (typeof assetKind.enumValues)[number];
export type ScanStatus = (typeof scanStatus.enumValues)[number];

export const products = pgTable(
  "products",
  {
    id: id(),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    priceMinor: bigint({ mode: "number" }).notNull(),
    currency: text().notNull().default("SLE"),
    licenseType: licenseType().notNull().default("personal"),
    licenseText: text().notNull().default(""),
    downloadLimit: integer().notNull(),
    accessDays: integer().notNull(),
    status: productStatus().notNull().default("draft"),
    reviewNote: text(),
    ownershipDeclaredAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index().on(t.creatorId, t.status),
    index().on(t.status, t.updatedAt),
    check("products_price_positive", sql`${t.priceMinor} > 0`),
    check("products_title_length", sql`char_length(${t.title}) between 1 and 120`),
    check("products_description_length", sql`char_length(${t.description}) <= 5000`),
  ],
);

export const productAssets = pgTable(
  "product_assets",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: assetKind().notNull(),
    /** Random object key; never derived from the filename. Public bucket for previews, private for files. */
    r2Key: text().notNull().unique(),
    /** Display only (sanitised). */
    originalFilename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    sha256: text(),
    scanStatus: scanStatus().notNull().default("uploading"),
    scanDetail: text(),
    /** PDFs get a per-order footer stamp on download (disclosed on the product page). */
    watermarkable: boolean().notNull().default(false),
    /** The object was deleted from storage (erased creator, every entitlement expired). */
    purgedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.productId, t.kind)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    paymentId: uuid()
      .notNull()
      .unique()
      .references(() => payments.id, { onDelete: "restrict" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** AES-256-GCM (server/lib/crypto.ts). */
    buyerEmailEnc: text().notNull(),
    /** Peppered HMAC of the normalised email, for "lost your link?". */
    buyerEmailHash: text().notNull(),
    buyerName: text(),
    priceMinor: bigint({ mode: "number" }).notNull(),
    /** Library link: SHA-256 for lookup, encrypted copy so recovery can re-send the same link. */
    accessTokenHash: text().notNull().unique(),
    accessTokenEnc: text().notNull(),
    /** SHA-256 of the purchasing browser's claim cookie (instant access on the success page). */
    claimHash: text(),
    receiptSentAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index().on(t.buyerEmailHash), index().on(t.creatorId, t.createdAt)],
);

export const entitlements = pgTable(
  "entitlements",
  {
    id: id(),
    /** Unique: one entitlement per order, however many times settlement runs. */
    orderId: uuid()
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    downloadsUsed: integer().notNull().default(0),
    downloadLimit: integer().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedReason: text(),
    createdAt: createdAt(),
  },
  (t) => [check("entitlements_downloads_within_limit", sql`${t.downloadsUsed} <= ${t.downloadLimit}`)],
);

/** Append-only. */
export const downloadEvents = pgTable(
  "download_events",
  {
    id: id(),
    entitlementId: uuid()
      .notNull()
      .references(() => entitlements.id, { onDelete: "restrict" }),
    assetId: uuid()
      .notNull()
      .references(() => productAssets.id, { onDelete: "restrict" }),
    ipHash: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.entitlementId, t.createdAt)],
);

export type Product = typeof products.$inferSelect;
export type ProductAsset = typeof productAssets.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Entitlement = typeof entitlements.$inferSelect;
