import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage } from "@/server/integrations/email";
import { FakeMonimeServer, type WebhookEnvelope } from "@/server/integrations/monime/fake";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { signToken } from "@/server/lib/crypto";
import { CategoryRepository } from "@/server/repositories/CategoryRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { OrderRepository } from "@/server/repositories/OrderRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ProductRepository } from "@/server/repositories/ProductRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { Actor } from "@/server/services/actor";
import { DownloadService } from "@/server/services/DownloadService";
import { OrderService } from "@/server/services/OrderService";
import { PlatformSettingsService } from "@/server/services/PlatformSettingsService";
import { ProductReviewService } from "@/server/services/ProductReviewService";
import { ProductService } from "@/server/services/ProductService";
import { SettlementService } from "@/server/services/SettlementService";
import { TransferService } from "@/server/services/TransferService";
import { WalletService } from "@/server/services/WalletService";
import { WebhookService } from "@/server/services/WebhookService";
import { createMemoryStorage } from "../fixtures/creator-fakes";
import { createTestDb, type TestDb } from "./db";

const SECRET = "test-download-signing-secret-0123456789";
const buckets = { products: "products", uploads: "uploads", public: "public" };
const ctx = { ip: "203.0.113.20", userAgent: "vitest" };

let t: TestDb;
let monimeServer: FakeMonimeServer;
let store: ReturnType<typeof createMemoryStorage>;
let sent: EmailMessage[];
let now: Date;
let creator: Actor;
let staff: Actor;

const repos = {
  users: new UserRepository(),
  profiles: new CreatorProfileRepository(),
  wallets: new CreatorWalletRepository(),
  payments: new PaymentRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  webhookEvents: new WebhookEventRepository(),
  products: new ProductRepository(),
  orders: new OrderRepository(),
  categories: new CategoryRepository(),
};

let products: ProductService;
let review: ProductReviewService;
let orders: OrderService;
let downloads: DownloadService;
let webhooks: WebhookService;

async function pdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]).drawText("Hello from Aminata");
  return doc.save();
}

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.client.exec(
    `truncate download_events, entitlements, orders, product_assets, products, ledger_entries, ledger_journals,
     payment_events, contributions, payments, webhook_events, creator_wallets, creator_profiles, users cascade`,
  );
  for (const f of ["0005_seed_platform_settings.sql", "0007_seed_product_settings.sql"]) {
    await t.client.exec(readFileSync(`server/db/migrations/${f}`, "utf8"));
  }
  now = new Date();
  sent = [];
  store = createMemoryStorage();
  monimeServer = new FakeMonimeServer();
  const monime = monimeServer.client();
  const platformId = monimeServer.seedAccount({ id: "fac-platform" }).id;
  const settings = new PlatformSettingsService(repos.settings);
  const email = { send: async (m: EmailMessage) => void sent.push(m) };

  products = new ProductService({ repos, settings, storage: store.storage, buckets, publicAssetUrl: (k) => `https://cdn.test/${k}`, rateLimit: async () => {} });
  review = new ProductReviewService(repos.products, repos.profiles);
  orders = new OrderService({
    repos,
    products,
    monime,
    email,
    settings,
    platformAccountId: () => platformId,
    appBaseUrl: "https://dumegud.test",
    downloadSecret: SECRET,
    now: () => now,
    rateLimit: async () => {},
  });
  downloads = new DownloadService(repos, store.storage, buckets.products, SECRET, () => now);
  const transfers = new TransferService({ repos, monime, platformAccountId: () => platformId, sleep: async () => {} });
  const settlement = new SettlementService({ repos, transfers, settings, monime, fulfilment: { order: orders } });
  webhooks = new WebhookService(repos.webhookEvents, settlement.webhookHandlers());

  const user = (await repos.users.insertIfEmailFree({ email: "aminata@example.com", name: "Aminata", passwordHash: null }))!;
  await new WalletService(repos, monime).provisionForCreator(user.id);
  await repos.profiles.insert(user.id, { handle: "aminata", handleLower: "aminata", displayName: "Aminata", bio: "", categoryId: null, supportMessageEnabled: true });
  await repos.profiles.acceptTermsOwned(user.id, now);
  await repos.profiles.setStatusOwned(user.id, "published", now);
  creator = { userId: user.id, role: "creator", status: "active", emailVerified: true };
  staff = { userId: crypto.randomUUID(), role: "staff", status: "active", emailVerified: true };
});

const productInput = { title: "Krio Recipes", description: "30 recipes.", categoryId: null, price: 25_000, licenseType: "personal" as const, licenseText: "" };

async function upload(productId: string, filename: string, bytes: Uint8Array, kind: "file" | "preview_image" = "file") {
  const { assetId, url } = await products.requestUpload(creator, { productId, kind, filename, size: bytes.byteLength });
  const key = new URL(url).pathname.split("/").slice(2).join("/"); // https://r2.test/<bucket>/<key>
  store.put(kind === "file" ? buckets.products : buckets.uploads, key, bytes);
  return { assetId, confirm: () => products.confirmUpload(creator, assetId) };
}

async function publishedProduct() {
  const { productId } = await products.create(creator, productInput);
  await (await upload(productId, "recipes.pdf", await pdfBytes())).confirm();
  await products.submitForReview(creator, productId, true);
  await review.approve(staff, productId);
  return productId;
}

const deliver = (e: WebhookEnvelope) => webhooks.handleMonime(parseMonimeEvent(JSON.stringify(e))!, e);

async function buyAndPay(productId: string) {
  const started = await orders.start({ productId, email: "Buyer@Example.com".toLowerCase(), buyerName: "Fatmata" }, ctx);
  const payment = (await repos.payments.findById(started.paymentId))!;
  const events = monimeServer.completeCheckout(payment.monimeCheckoutSessionId!, { order: "payment-first" });
  for (const e of [...events, ...events]) await deliver(e);
  return started;
}

describe("uploads", () => {
  it("rejects a renamed executable and accepts a real PDF", async () => {
    const { productId } = await products.create(creator, productInput);
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, ...new Array(300).fill(0)]); // "MZ" PE header
    const fake = await upload(productId, "book.pdf", exe);
    await expect(fake.confirm()).rejects.toThrow(/isn't a real \.pdf/);
    expect((await repos.products.findAsset(fake.assetId))!.scanStatus).toBe("rejected");

    const real = await upload(productId, "book.pdf", await pdfBytes());
    await real.confirm();
    expect((await repos.products.findAsset(real.assetId))).toMatchObject({ scanStatus: "pending", watermarkable: true });
  });

  it("rejects disallowed types and size mismatches", async () => {
    const { productId } = await products.create(creator, productInput);
    await expect(products.requestUpload(creator, { productId, kind: "file", filename: "run.exe", size: 10 })).rejects.toThrow(/isn't allowed/);
    await expect(products.requestUpload(creator, { productId, kind: "file", filename: "pic.svg", size: 10 })).rejects.toThrow(/isn't allowed/);
    const { assetId, url } = await products.requestUpload(creator, { productId, kind: "file", filename: "a.pdf", size: 999 });
    store.put(buckets.products, new URL(url).pathname.split("/").slice(2).join("/"), await pdfBytes());
    await expect(products.confirmUpload(creator, assetId)).rejects.toThrow();
  });

  it("re-encodes preview images into the public bucket", async () => {
    const { productId } = await products.create(creator, productInput);
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#123456" } }).png().toBuffer();
    const preview = await upload(productId, "cover.png", png, "preview_image");
    await preview.confirm();
    const asset = (await repos.products.findAsset(preview.assetId))!;
    expect(asset).toMatchObject({ scanStatus: "clean", mimeType: "image/webp" });
    expect(asset.r2Key).toMatch(/^previews\//);
    expect((await sharp(store.objects.get(`public/${asset.r2Key}`)!.body).metadata()).width).toBe(1200);
  });

  it("is owner-scoped", async () => {
    const { productId } = await products.create(creator, productInput);
    const other: Actor = { ...creator, userId: crypto.randomUUID() };
    await expect(products.getOwn(other, productId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(products.requestUpload(other, { productId, kind: "file", filename: "a.pdf", size: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("lifecycle", () => {
  it("needs files and an ownership declaration before review, and staff to publish", async () => {
    const { productId } = await products.create(creator, productInput);
    const fileItem = async () => (await products.readiness(creator, productId)).find((i) => i.key === "file")?.done;
    expect(await fileItem()).toBe(false);
    await expect(products.submitForReview(creator, productId, true)).rejects.toThrow(/upload at least one file/);
    await (await upload(productId, "a.pdf", await pdfBytes())).confirm();
    expect(await fileItem()).toBe(true);
    await expect(products.submitForReview(creator, productId, false)).rejects.toThrow(/own the rights/);
    await products.submitForReview(creator, productId, true);
    expect(await products.getPublic(productId)).toBeNull();
    await expect(review.approve(creator, productId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await review.approve(staff, productId);
    expect(await products.getPublic(productId)).toMatchObject({ title: "Krio Recipes", priceMinor: 25_000, watermarked: true, files: [{ format: "PDF" }] });
  });

  it("editing a live product sends it back to review", async () => {
    const productId = await publishedProduct();
    await products.update(creator, productId, { ...productInput, title: "Krio Recipes, 2nd ed." });
    expect((await repos.products.findById(productId))!.status).toBe("pending_review");
    expect(await products.getPublic(productId)).toBeNull();
  });
});

describe("purchase → entitlement → download", () => {
  it("grants one entitlement and sends one receipt across replays, with the product fee", async () => {
    const productId = await publishedProduct();
    const { paymentId, claim } = await buyAndPay(productId);

    const payment = (await repos.payments.findById(paymentId))!;
    // 25,000; Monime 187 + 62 = 249 (each line floored); arrived 24,751; 5% product fee = 1,237; net 23,514
    expect(payment).toMatchObject({ kind: "order", status: "succeeded", platformFeeBps: 500, platformFeeMinor: 1_237, creatorNetMinor: 23_514, transferStatus: "completed" });
    const { rows } = await t.client.query("select 1 from entitlements");
    expect(rows).toHaveLength(1);
    const receipts = sent.filter((m) => m.tag === "receipt-order");
    expect(receipts).toHaveLength(1);
    expect(receipts[0].to).toBe("buyer@example.com");
    expect(receipts[0].text).toMatch(/https:\/\/dumegud\.test\/library\/[A-Za-z0-9_-]{43}/);

    // The buyer's email is encrypted at rest.
    const { rows: stored } = await t.client.query<{ buyer_email_enc: string }>("select buyer_email_enc from orders");
    expect(stored[0].buyer_email_enc).not.toContain("buyer@");

    // Only the purchasing browser's claim unlocks the success-page link.
    expect(await orders.libraryUrlForClaim(paymentId, claim)).toMatch(/\/library\//);
    expect(await orders.libraryUrlForClaim(paymentId, `${paymentId}.wrong`)).toBeNull();
    expect(await orders.libraryUrlForClaim(paymentId, undefined)).toBeNull();
  });

  it("downloads up to the limit, stamps PDFs with the order (not the buyer), and refuses bad tokens", async () => {
    const productId = await publishedProduct();
    await buyAndPay(productId);
    const token = /library\/([A-Za-z0-9_-]+)/.exec(sent.find((m) => m.tag === "receipt-order")!.text)![1];

    const library = (await orders.getLibrary(token))!;
    expect(library).toMatchObject({ status: "active", downloadsUsed: 0, downloadLimit: 5, productTitle: "Krio Recipes" });
    const fileId = library.files[0].id;

    for (let i = 0; i < 5; i++) {
      const result = await downloads.redeem(await orders.mintDownloadToken(token, fileId), ctx);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.url).toMatch(/^https:\/\/r2\.test\/products\/watermarked\//);
    }
    // Stamped once, reused afterwards; the stamp names the order, not the buyer.
    const stamped = [...store.objects.entries()].filter(([k]) => k.startsWith("products/watermarked/"));
    expect(stamped).toHaveLength(1);
    const pdfText = Buffer.from(stamped[0][1].body).toString("latin1");
    expect(pdfText).not.toContain("Fatmata");
    expect((await PDFDocument.load(stamped[0][1].body)).getPageCount()).toBe(1);

    expect((await orders.getLibrary(token))!.status).toBe("limit_reached");
    await expect(orders.mintDownloadToken(token, fileId)).rejects.toThrow(/used all your downloads/);
    // A token minted before the limit was hit is also refused at redemption.
    const { rows } = await t.client.query<{ id: string }>("select id from entitlements");
    const forged = signToken(`${rows[0].id}|${fileId}|${Math.floor(Date.now() / 1000) + 60}`, SECRET);
    expect(await downloads.redeem(forged, ctx)).toEqual({ ok: false, reason: "limit" });
    const { rows: events } = await t.client.query("select 1 from download_events");
    expect(events).toHaveLength(5);
  });

  it("refuses expired, tampered and foreign-signed tokens", async () => {
    const productId = await publishedProduct();
    await buyAndPay(productId);
    const token = /library\/([A-Za-z0-9_-]+)/.exec(sent.find((m) => m.tag === "receipt-order")!.text)![1];
    const fileId = (await orders.getLibrary(token))!.files[0].id;
    const good = await orders.mintDownloadToken(token, fileId);

    now = new Date(Date.now() + 61_000);
    expect(await downloads.redeem(good, ctx)).toEqual({ ok: false, reason: "expired" });
    now = new Date();
    expect(await downloads.redeem(good.slice(0, -2) + "xx", ctx)).toEqual({ ok: false, reason: "invalid" });
    expect(await downloads.redeem(signToken("a|b|9999999999", "another-secret-another-secret-0000"), ctx)).toEqual({ ok: false, reason: "invalid" });
  });

  it("gives no access before payment and none to an unknown library token", async () => {
    const productId = await publishedProduct();
    const started = await orders.start({ productId, email: "b@example.com", buyerName: null }, ctx);
    expect(await orders.libraryUrlForClaim(started.paymentId, started.claim)).toBeNull();
    expect(await orders.getLibrary("A".repeat(43))).toBeNull();
    const { rows } = await t.client.query("select 1 from entitlements");
    expect(rows).toHaveLength(0);
  });

  it("emails library links on recovery, and nothing for unknown emails", async () => {
    const productId = await publishedProduct();
    await buyAndPay(productId);
    await orders.sendLibraryLinks("nobody@example.com");
    expect(sent.filter((m) => m.tag === "library-links")).toHaveLength(0);
    await orders.sendLibraryLinks("buyer@example.com");
    const links = sent.filter((m) => m.tag === "library-links");
    expect(links).toHaveLength(1);
    expect(links[0].text).toContain("Krio Recipes: https://dumegud.test/library/");
  });
});
