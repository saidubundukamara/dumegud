import "server-only";
import { HANDLE_CHANGE_COOLDOWN_DAYS, HANDLE_REDIRECT_DAYS, handleFormatError, normalizeHandle } from "@/lib/handle";
import type { Platform } from "@/lib/social";
import type { CreatorProfile, ProfileStatus } from "@/server/db/schema";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { isUniqueViolation } from "@/server/repositories/BaseRepository";
import type { CategoryRepository } from "@/server/repositories/CategoryRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { HandleRepository } from "@/server/repositories/HandleRepository";
import type { ProfileInput } from "@/server/validation/creator";
import type { Actor } from "./actor";
import { noAudit, noRestrictions, type AuditLogger, type RestrictionGuard } from "./compliance";
import { runInTransaction } from "./transaction";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PublicProfileDTO = {
  id: string;
  /** Internal: lets server code load the creator's shop. Never render it. */
  ownerId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  categoryName: string | null;
  links: { platform: Platform; url: string }[];
  suggestedAmountsMinor: number[];
  supportMessageEnabled: boolean;
};

export type PublicProfileResult =
  | { kind: "found"; profile: PublicProfileDTO }
  | { kind: "redirect"; handle: string; profileId: string }
  | { kind: "unavailable"; profileId: string }
  | { kind: "not_found" };

export type OwnProfileDTO = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  categoryId: string | null;
  supportMessageEnabled: boolean;
  status: ProfileStatus;
  termsAccepted: boolean;
  links: { platform: Platform; url: string }[];
  /** When the handle can next be changed, or null if it can be changed now. */
  handleLockedUntil: Date | null;
};

export type ChecklistItem = { key: string; label: string; done: boolean };

/** Cache tags to refresh after a change (internal ids and public handles only, no PII). */
export type ProfileChange = { profileId: string; handles: string[] };

type CreatorRepos = {
  profiles: CreatorProfileRepository;
  handles: HandleRepository;
  categories: CategoryRepository;
  wallets: CreatorWalletRepository;
};

export type CreatorServiceDeps = {
  repos: CreatorRepos;
  /** Public URL for a key in the public bucket, or null when R2 isn't configured. */
  publicAssetUrl: (key: string) => string | null;
  now?: () => Date;
  transaction?: typeof runInTransaction;
  audit?: AuditLogger;
  restrictions?: RestrictionGuard;
};

export class CreatorService {
  private readonly repos: CreatorRepos;
  private readonly publicAssetUrl: CreatorServiceDeps["publicAssetUrl"];
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;
  private readonly audit: AuditLogger;
  private readonly restrictions: RestrictionGuard;

  constructor(deps: CreatorServiceDeps) {
    this.audit = deps.audit ?? noAudit;
    this.restrictions = deps.restrictions ?? noRestrictions;
    this.repos = deps.repos;
    this.publicAssetUrl = deps.publicAssetUrl;
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
  }

  // ── Owner ─────────────────────────────────────────────────────────────────────

  async getOwnProfile(actor: Actor): Promise<OwnProfileDTO | null> {
    const profile = await this.repos.profiles.findByUserId(actor.userId);
    if (!profile) return null;
    const links = await this.repos.profiles.listLinks(profile.id);
    return {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      avatarUrl: profile.avatarKey ? this.publicAssetUrl(profile.avatarKey) : null,
      categoryId: profile.categoryId,
      supportMessageEnabled: profile.supportMessageEnabled,
      status: profile.status,
      termsAccepted: profile.creatorTermsAcceptedAt !== null,
      links: links.map((l) => ({ platform: l.platform, url: l.url })),
      handleLockedUntil: this.handleLockedUntil(profile),
    };
  }

  async listCategories() {
    const rows = await this.repos.categories.listActive();
    return rows.map((c) => ({ id: c.id, name: c.name }));
  }

  /** Create or update the actor's own profile, including handle changes and links. */
  async saveProfile(actor: Actor, input: ProfileInput): Promise<ProfileChange> {
    const now = this.now();
    const existing = await this.repos.profiles.findByUserId(actor.userId);
    if (existing?.status === "suspended") throw new ConflictError("Your page is suspended. Contact support.");

    const handleLower = normalizeHandle(input.handle);
    const handleChanged = !existing || existing.handleLower !== handleLower;

    if (handleChanged) {
      if (existing) {
        const lockedUntil = this.handleLockedUntil(existing);
        if (lockedUntil) {
          throw new ValidationError(undefined, {
            handle: [`You can change your handle again on ${lockedUntil.toISOString().slice(0, 10)}.`],
          });
        }
      }
      await this.assertHandleAvailable(handleLower, existing?.id ?? null, now);
    }

    if (input.categoryId && !(await this.repos.categories.isActive(input.categoryId))) {
      throw new ValidationError(undefined, { categoryId: ["Choose a category from the list."] });
    }

    const write = {
      handle: input.handle,
      handleLower,
      displayName: input.displayName,
      bio: input.bio,
      categoryId: input.categoryId,
      supportMessageEnabled: input.supportMessageEnabled,
      // The first handle is free; later changes start the cooldown.
      ...(existing && handleChanged ? { handleChangedAt: now } : {}),
    };

    try {
      const profile = await this.transaction(async (tx) => {
        const saved = existing
          ? await this.repos.profiles.updateOwned(actor.userId, write, tx)
          : await this.repos.profiles.insert(actor.userId, write, tx);
        if (!saved) throw new ConflictError("Your profile changed while saving. Please try again.");
        if (existing && handleChanged) {
          await this.repos.handles.recordRelease(existing.handleLower, saved.id, now, tx);
          await this.repos.handles.deleteHistory(handleLower, tx); // reclaiming one's own old handle
        }
        await this.repos.profiles.replaceLinks(saved.id, input.links, tx);
        return saved;
      });
      if (existing && handleChanged) {
        await this.audit.log({ actor, action: "profile.handle_change", targetType: "creator_profile", targetId: profile.id, before: { handle: existing.handle }, after: { handle: input.handle } });
      }
      const handles = [handleLower, ...(existing && handleChanged ? [existing.handleLower] : [])];
      return { profileId: profile.id, handles };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ValidationError(undefined, { handle: ["That handle is taken."] });
      throw err;
    }
  }

  /** Format, reserved list, other profiles and recently released handles. */
  async assertHandleAvailable(handleLower: string, ownProfileId: string | null, now = this.now()): Promise<void> {
    const formatError = handleFormatError(handleLower);
    if (formatError) throw new ValidationError(undefined, { handle: [formatError] });
    const unavailable = () => new ValidationError(undefined, { handle: ["That handle isn't available."] });

    if (await this.repos.handles.isReserved(handleLower)) throw unavailable();

    const owner = await this.repos.profiles.findByHandleLower(handleLower);
    if (owner && owner.id !== ownProfileId) throw new ValidationError(undefined, { handle: ["That handle is taken."] });

    const history = await this.repos.handles.findHistory(handleLower);
    if (history && history.profileId !== ownProfileId && now.getTime() - history.releasedAt.getTime() < HANDLE_REDIRECT_DAYS * DAY_MS) {
      throw unavailable();
    }
  }

  async acceptCreatorTerms(actor: Actor): Promise<void> {
    const profile = await this.repos.profiles.findByUserId(actor.userId);
    if (!profile) throw new ConflictError("Set up your page before accepting the creator terms.");
    if (!profile.creatorTermsAcceptedAt) await this.repos.profiles.acceptTermsOwned(actor.userId, this.now());
  }

  /** What still stands between the creator and a live page. Shown on the dashboard. */
  async getPublishChecklist(actor: Actor): Promise<ChecklistItem[]> {
    const [profile, wallet] = await Promise.all([
      this.repos.profiles.findByUserId(actor.userId),
      this.repos.wallets.findByUserId(actor.userId),
    ]);
    return [
      { key: "email", label: "Confirm your email", done: actor.emailVerified },
      { key: "profile", label: "Set up your page (name and handle)", done: Boolean(profile?.displayName && profile.handle) },
      { key: "terms", label: "Accept the creator terms", done: Boolean(profile?.creatorTermsAcceptedAt) },
      { key: "wallet", label: "Wallet ready to receive money", done: wallet?.status === "active" },
      {
        key: "standing",
        label: "Account in good standing",
        done: actor.status === "active" && profile?.status !== "suspended",
      },
    ];
  }

  async publish(actor: Actor): Promise<ProfileChange> {
    await this.restrictions.assertAllowed(actor.userId, "publish", "Publishing isn't available on your account right now. Contact support.");
    const checklist = await this.getPublishChecklist(actor);
    const missing = checklist.filter((i) => !i.done);
    if (missing.length) {
      throw new ConflictError(`Before publishing: ${missing.map((i) => i.label.toLowerCase()).join("; ")}.`);
    }
    const profile = await this.repos.profiles.setStatusOwned(actor.userId, "published", this.now());
    if (!profile) throw new ConflictError("Your page can't be published right now.");
    return { profileId: profile.id, handles: [profile.handleLower] };
  }

  async unpublish(actor: Actor): Promise<ProfileChange> {
    const profile = await this.repos.profiles.setStatusOwned(actor.userId, "unpublished", null);
    if (!profile) throw new ConflictError("Your page can't be unpublished right now.");
    return { profileId: profile.id, handles: [profile.handleLower] };
  }

  // ── Public ────────────────────────────────────────────────────────────────────

  /**
   * Public page lookup. Malformed handles never reach the database. Old handles redirect for
   * 90 days. Suspended pages (or owners) show a neutral "unavailable" page.
   */
  /** Live creator pages for the sitemap, most recently updated first. */
  async listForSitemap(limit = 45_000): Promise<{ handle: string; updatedAt: Date }[]> {
    return this.repos.profiles.listPublishedForSitemap(limit);
  }

  async getPublicProfile(rawHandle: string): Promise<PublicProfileResult> {
    const handleLower = normalizeHandle(rawHandle);
    if (handleFormatError(handleLower)) return { kind: "not_found" };

    const row = await this.repos.profiles.findPublicByHandleLower(handleLower);
    if (row) {
      const { profile, userStatus, categoryName } = row;
      if (profile.status === "suspended" || userStatus === "suspended" || userStatus === "closed") {
        return { kind: "unavailable", profileId: profile.id };
      }
      if (profile.status !== "published") return { kind: "not_found" };
      const links = await this.repos.profiles.listLinks(profile.id);
      return {
        kind: "found",
        profile: {
          id: profile.id,
          ownerId: profile.userId,
          handle: profile.handle,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarKey ? this.publicAssetUrl(profile.avatarKey) : null,
          categoryName,
          links: links.map((l) => ({ platform: l.platform, url: l.url })),
          suggestedAmountsMinor: profile.suggestedAmountsMinor,
          supportMessageEnabled: profile.supportMessageEnabled,
        },
      };
    }

    const history = await this.repos.handles.findHistory(handleLower);
    if (history && this.now().getTime() - history.releasedAt.getTime() < HANDLE_REDIRECT_DAYS * DAY_MS) {
      const current = await this.repos.profiles.findById(history.profileId);
      if (current?.status === "published") {
        return { kind: "redirect", handle: current.handle, profileId: current.id };
      }
    }
    return { kind: "not_found" };
  }

  private handleLockedUntil(profile: CreatorProfile): Date | null {
    if (!profile.handleChangedAt) return null;
    const until = new Date(profile.handleChangedAt.getTime() + HANDLE_CHANGE_COOLDOWN_DAYS * DAY_MS);
    return until > this.now() ? until : null;
  }
}
