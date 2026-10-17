import "server-only";
import { getEnv, getR2Config } from "@/server/env";
import { createEmailService, type EmailService } from "@/server/integrations/email";
import { createMonime, type MonimeClient } from "@/server/integrations/monime";
import { sharedFakeMonimeServer } from "@/server/integrations/monime/fake";
import { R2Storage } from "@/server/integrations/r2/client";
import { AuthEventRepository } from "@/server/repositories/AuthEventRepository";
import { AuthTokenRepository } from "@/server/repositories/AuthTokenRepository";
import { CategoryRepository } from "@/server/repositories/CategoryRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { HandleRepository } from "@/server/repositories/HandleRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { OrderRepository } from "@/server/repositories/OrderRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ProductRepository } from "@/server/repositories/ProductRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import { AuthService } from "./AuthService";
import { AvatarService } from "./AvatarService";
import { ContributionService } from "./ContributionService";
import { CreatorService } from "./CreatorService";
import { DownloadService } from "./DownloadService";
import { OrderService } from "./OrderService";
import { ProductReviewService } from "./ProductReviewService";
import { ProductService } from "./ProductService";
import { PlatformSettingsService } from "./PlatformSettingsService";
import { SettlementService } from "./SettlementService";
import { TransferService } from "./TransferService";
import { WalletService } from "./WalletService";
import { WebhookService, type WebhookHandler } from "./WebhookService";

// Composition root: the single place where repositories, integrations and services are
// instantiated and wired together. Actions and route handlers import `services` from here;
// tests construct services directly with fakes.
//
// Services are created on first use (not at import) so `next build` never needs env values.

export const repos = {
  users: new UserRepository(),
  authTokens: new AuthTokenRepository(),
  authEvents: new AuthEventRepository(),
  profiles: new CreatorProfileRepository(),
  handles: new HandleRepository(),
  categories: new CategoryRepository(),
  wallets: new CreatorWalletRepository(),
  webhookEvents: new WebhookEventRepository(),
  payments: new PaymentRepository(),
  ledger: new LedgerRepository(),
  settings: new PlatformSettingsRepository(),
  products: new ProductRepository(),
  orders: new OrderRepository(),
};

let email: EmailService | undefined;
let monime: MonimeClient | undefined;
let auth: AuthService | undefined;
let wallet: WalletService | undefined;
let creators: CreatorService | undefined;
let avatars: AvatarService | null | undefined;
let webhooks: WebhookService | undefined;
let settings: PlatformSettingsService | undefined;
let transfers: TransferService | undefined;
let settlement: SettlementService | undefined;
let contributions: ContributionService | undefined;
let storage: R2Storage | null | undefined;
let products: ProductService | undefined;
let productReview: ProductReviewService | undefined;
let orders: OrderService | undefined;
let downloads: DownloadService | undefined;

/** Null while R2 isn't configured. */
function getStorage(): R2Storage | null {
  if (storage === undefined) {
    const r2 = getR2Config();
    storage = r2 ? new R2Storage(r2) : null;
  }
  return storage;
}

function publicAssetUrl(key: string): string | null {
  const r2 = getR2Config();
  return r2 ? `${r2.publicBaseUrl}/${key}` : null;
}

function getEmail(): EmailService {
  email ??= createEmailService(getEnv());
  return email;
}

export function getMonime(): MonimeClient {
  monime ??= createMonime(getEnv());
  return monime;
}

/** The platform financial account every checkout pays into. The fake seeds a dev one. */
function platformAccountId(): string {
  const env = getEnv();
  if (env.MONIME_ENVIRONMENT === "fake") {
    const fake = sharedFakeMonimeServer();
    return (fake.accounts.get("fac-dev-platform") ?? fake.seedAccount({ id: "fac-dev-platform", name: "Dev platform" })).id;
  }
  return env.MONIME_PLATFORM_ACCOUNT_ID!;
}

export const services = {
  get auth(): AuthService {
    auth ??= new AuthService({
      repos,
      email: getEmail(),
      wallets: services.wallet,
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    return auth;
  },
  get wallet(): WalletService {
    wallet ??= new WalletService(repos, getMonime());
    return wallet;
  },
  get creators(): CreatorService {
    creators ??= new CreatorService({
      repos,
      publicAssetUrl,
    });
    return creators;
  },
  get webhooks(): WebhookService {
    // Event name → handler. Phase 6 adds payouts. Unregistered events are recorded as
    // `ignored` and answered 200.
    if (!webhooks) {
      const handlers: Partial<Record<string, WebhookHandler>> = { ...services.settlement.webhookHandlers() };
      webhooks = new WebhookService(repos.webhookEvents, handlers);
    }
    return webhooks;
  },
  get settings(): PlatformSettingsService {
    settings ??= new PlatformSettingsService(repos.settings);
    return settings;
  },
  get transfers(): TransferService {
    transfers ??= new TransferService({ repos, monime: getMonime(), platformAccountId });
    return transfers;
  },
  get settlement(): SettlementService {
    settlement ??= new SettlementService({
      repos,
      fulfilment: { order: services.orders },
      transfers: services.transfers,
      settings: services.settings,
      monime: getMonime(),
    });
    return settlement;
  },
  get contributions(): ContributionService {
    contributions ??= new ContributionService({
      repos,
      monime: getMonime(),
      settings: services.settings,
      platformAccountId,
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    return contributions;
  },
  get products(): ProductService {
    const env = getEnv();
    products ??= new ProductService({
      repos,
      settings: services.settings,
      storage: getStorage(),
      buckets: { products: env.R2_PRODUCTS_BUCKET, uploads: env.R2_UPLOADS_BUCKET, public: env.R2_PUBLIC_BUCKET },
      publicAssetUrl,
    });
    return products;
  },
  get productReview(): ProductReviewService {
    productReview ??= new ProductReviewService(repos.products, repos.profiles);
    return productReview;
  },
  get orders(): OrderService {
    const env = getEnv();
    orders ??= new OrderService({
      repos,
      products: services.products,
      monime: getMonime(),
      email: getEmail(),
      settings: services.settings,
      platformAccountId,
      appBaseUrl: env.APP_BASE_URL,
      downloadSecret: env.DOWNLOAD_SIGNING_SECRET,
    });
    return orders;
  },
  get downloads(): DownloadService {
    const env = getEnv();
    downloads ??= new DownloadService(repos, getStorage(), env.R2_PRODUCTS_BUCKET, env.DOWNLOAD_SIGNING_SECRET);
    return downloads;
  },
  /** Null while R2 isn't configured: the UI hides photo upload. */
  get avatars(): AvatarService | null {
    if (avatars === undefined) {
      const r2 = getR2Config();
      const store = getStorage();
      avatars = r2 && store ? new AvatarService(repos.profiles, store, { uploads: r2.uploadsBucket, public: r2.publicBucket }) : null;
    }
    return avatars;
  },
};
