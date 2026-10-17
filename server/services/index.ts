import "server-only";
import { getEnv, getR2Config } from "@/server/env";
import { createEmailService, type EmailService } from "@/server/integrations/email";
import { createMonime, type MonimeClient } from "@/server/integrations/monime";
import { R2Storage } from "@/server/integrations/r2/client";
import { AuthEventRepository } from "@/server/repositories/AuthEventRepository";
import { AuthTokenRepository } from "@/server/repositories/AuthTokenRepository";
import { CategoryRepository } from "@/server/repositories/CategoryRepository";
import { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import { HandleRepository } from "@/server/repositories/HandleRepository";
import { UserRepository } from "@/server/repositories/UserRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import { AuthService } from "./AuthService";
import { AvatarService } from "./AvatarService";
import { CreatorService } from "./CreatorService";
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
};

let email: EmailService | undefined;
let monime: MonimeClient | undefined;
let auth: AuthService | undefined;
let wallet: WalletService | undefined;
let creators: CreatorService | undefined;
let avatars: AvatarService | null | undefined;
let webhooks: WebhookService | undefined;

function getEmail(): EmailService {
  email ??= createEmailService(getEnv());
  return email;
}

export function getMonime(): MonimeClient {
  monime ??= createMonime(getEnv());
  return monime;
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
      publicAssetUrl: (key) => {
        const r2 = getR2Config();
        return r2 ? `${r2.publicBaseUrl}/${key}` : null;
      },
    });
    return creators;
  },
  get webhooks(): WebhookService {
    // Event name → handler. Phase 4 adds checkout/payment settlement; Phase 6 adds payouts.
    // Unregistered events are recorded as `ignored` and answered 200.
    const handlers: Partial<Record<string, WebhookHandler>> = {};
    webhooks ??= new WebhookService(repos.webhookEvents, handlers);
    return webhooks;
  },
  /** Null while R2 isn't configured: the UI hides photo upload. */
  get avatars(): AvatarService | null {
    if (avatars === undefined) {
      const r2 = getR2Config();
      avatars = r2
        ? new AvatarService(repos.profiles, new R2Storage(r2), { uploads: r2.uploadsBucket, public: r2.publicBucket })
        : null;
    }
    return avatars;
  },
};
