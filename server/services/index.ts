import "server-only";
import { getEnv, getR2Config } from "@/server/env";
import { createEmailService, type EmailService } from "@/server/integrations/email";
import { createMonime, type MonimeClient } from "@/server/integrations/monime";
import { sharedFakeMonimeServer } from "@/server/integrations/monime/fake";
import { R2Storage } from "@/server/integrations/r2/client";
import { AccountDeletionRepository } from "@/server/repositories/AccountDeletionRepository";
import { AdminRepository } from "@/server/repositories/AdminRepository";
import { AuditRepository } from "@/server/repositories/AuditRepository";
import { AuthEventRepository } from "@/server/repositories/AuthEventRepository";
import { AuthTokenRepository } from "@/server/repositories/AuthTokenRepository";
import { CategoryRepository } from "@/server/repositories/CategoryRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { HandleRepository } from "@/server/repositories/HandleRepository";
import { JobRepository } from "@/server/repositories/JobRepository";
import { LedgerRepository } from "@/server/repositories/LedgerRepository";
import { KycRepository } from "@/server/repositories/KycRepository";
import { OrderRepository } from "@/server/repositories/OrderRepository";
import { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import { PayoutRepository } from "@/server/repositories/PayoutRepository";
import { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import { ProductRepository } from "@/server/repositories/ProductRepository";
import { RiskRepository } from "@/server/repositories/RiskRepository";
import { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import { AccountDeletionService } from "./AccountDeletionService";
import { AdminConfigService } from "./AdminConfigService";
import { AdminService } from "./AdminService";
import { AuthService } from "./AuthService";
import { AvatarService } from "./AvatarService";
import { BalanceService } from "./BalanceService";
import { CaseService } from "./CaseService";
import { AuditService, RestrictionService } from "./compliance";
import { ContributionService } from "./ContributionService";
import { CreatorService } from "./CreatorService";
import { DownloadService } from "./DownloadService";
import { JobService } from "./JobService";
import { KycService } from "./KycService";
import { LimitService } from "./LimitService";
import { OrderService } from "./OrderService";
import { PayoutMethodService } from "./PayoutMethodService";
import { PayoutService } from "./PayoutService";
import { ProductReviewService } from "./ProductReviewService";
import { ProductService } from "./ProductService";
import { ReconciliationService } from "./ReconciliationService";
import { ReportService } from "./ReportService";
import { RiskService } from "./RiskService";
import { PlatformSettingsService } from "./PlatformSettingsService";
import { SettlementService } from "./SettlementService";
import { ShoutoutService } from "./ShoutoutService";
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
  kyc: new KycRepository(),
  payoutMethods: new PayoutMethodRepository(),
  payouts: new PayoutRepository(),
  audit: new AuditRepository(),
  risk: new RiskRepository(),
  admin: new AdminRepository(),
  shoutouts: new ShoutoutRepository(),
  accountDeletions: new AccountDeletionRepository(),
  jobs: new JobRepository(),
};

// Compliance hooks shared by most services (stateless, safe to create at import).
const audit = new AuditService(repos.audit);
const restrictions = new RestrictionService(repos.risk);
const limits = new LimitService(repos.risk);
const risk = new RiskService(repos);

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
let shoutouts: ShoutoutService | undefined;
let storage: R2Storage | null | undefined;
let products: ProductService | undefined;
let productReview: ProductReviewService | undefined;
let orders: OrderService | undefined;
let downloads: DownloadService | undefined;
let kyc: KycService | undefined;
let balances: BalanceService | undefined;
let payoutMethods: PayoutMethodService | undefined;
let payouts: PayoutService | undefined;
let cases: CaseService | undefined;
let reports: ReportService | undefined;
let adminConfig: AdminConfigService | undefined;
let admin: AdminService | undefined;
let accountDeletions: AccountDeletionService | undefined;
let jobs: JobService | undefined;
let reconciliation: ReconciliationService | undefined;

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
      audit,
      restrictions,
      publicAssetUrl,
      deletions: repos.accountDeletions,
    });
    return creators;
  },
  get webhooks(): WebhookService {
    // Event name → handler. Unregistered events are recorded as `ignored` and answered 200.
    if (!webhooks) {
      const handlers: Partial<Record<string, WebhookHandler>> = {
        ...services.settlement.webhookHandlers(),
        ...services.payouts.webhookHandlers(),
      };
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
      limits,
      risk,
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
      restrictions,
      limits,
      risk,
      monime: getMonime(),
      settings: services.settings,
      platformAccountId,
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    return contributions;
  },
  get shoutouts(): ShoutoutService {
    shoutouts ??= new ShoutoutService({ repos, audit, appBaseUrl: getEnv().APP_BASE_URL, publicAssetUrl });
    return shoutouts;
  },
  get products(): ProductService {
    const env = getEnv();
    products ??= new ProductService({
      repos,
      restrictions,
      settings: services.settings,
      storage: getStorage(),
      buckets: { products: env.R2_PRODUCTS_BUCKET, uploads: env.R2_UPLOADS_BUCKET, public: env.R2_PUBLIC_BUCKET },
      publicAssetUrl,
      deletions: repos.accountDeletions,
    });
    return products;
  },
  get productReview(): ProductReviewService {
    productReview ??= new ProductReviewService(repos.products, repos.profiles, undefined, audit);
    return productReview;
  },
  get orders(): OrderService {
    const env = getEnv();
    orders ??= new OrderService({
      repos,
      restrictions,
      limits,
      risk,
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
  get kyc(): KycService {
    const env = getEnv();
    kyc ??= new KycService({ repos, audit, storage: getStorage(), bucket: env.R2_KYC_BUCKET, email: getEmail(), appBaseUrl: env.APP_BASE_URL });
    return kyc;
  },
  get balances(): BalanceService {
    balances ??= new BalanceService(repos, getMonime(), services.settings);
    return balances;
  },
  get payoutMethods(): PayoutMethodService {
    payoutMethods ??= new PayoutMethodService({
      repos,
      audit,
      risk,
      kyc: services.kyc,
      monime: getMonime(),
      settings: services.settings,
      email: getEmail(),
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    return payoutMethods;
  },
  get payouts(): PayoutService {
    payouts ??= new PayoutService({
      repos,
      audit,
      restrictions,
      limits,
      monime: getMonime(),
      balances: services.balances,
      methods: services.payoutMethods,
      kyc: services.kyc,
      settings: services.settings,
      email: getEmail(),
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    return payouts;
  },
  get restrictions(): RestrictionService {
    return restrictions;
  },
  get risk(): RiskService {
    return risk;
  },
  get cases(): CaseService {
    cases ??= new CaseService(repos, services.settings, audit);
    return cases;
  },
  get reports(): ReportService {
    reports ??= new ReportService(repos, audit);
    return reports;
  },
  get adminConfig(): AdminConfigService {
    adminConfig ??= new AdminConfigService(repos, audit);
    return adminConfig;
  },
  get admin(): AdminService {
    admin ??= new AdminService({
      repos,
      audit,
      monime: getMonime(),
      platformAccountId,
      settlement: services.settlement,
      transfers: services.transfers,
      payouts: services.payouts,
      webhooks: () => services.webhooks,
      jobs: services.jobs,
    });
    return admin;
  },
  get accountDeletions(): AccountDeletionService {
    const env = getEnv();
    accountDeletions ??= new AccountDeletionService({
      repos,
      monime: getMonime(),
      auth: services.auth,
      email: getEmail(),
      appBaseUrl: env.APP_BASE_URL,
      platformAccountId,
      storage: getStorage(),
      buckets: { public: env.R2_PUBLIC_BUCKET, kyc: env.R2_KYC_BUCKET },
      risk,
      audit,
    });
    return accountDeletions;
  },
  get jobs(): JobService {
    jobs ??= new JobService({ repos });
    return jobs;
  },
  get reconciliation(): ReconciliationService {
    const env = getEnv();
    reconciliation ??= new ReconciliationService({
      repos,
      wallet: services.wallet,
      settlement: services.settlement,
      transfers: services.transfers,
      payouts: services.payouts,
      risk,
      settings: services.settings,
      monime: getMonime(),
      platformAccountId,
      storage: getStorage(),
      buckets: { products: env.R2_PRODUCTS_BUCKET, public: env.R2_PUBLIC_BUCKET },
    });
    return reconciliation;
  },
  get audit(): AuditService {
    return audit;
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
