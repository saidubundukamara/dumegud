import "server-only";
import { and, asc, desc, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  categories,
  creatorProfiles,
  socialLinks,
  users,
  type CreatorProfile,
  type ProfileStatus,
  type SocialLink,
  type SocialPlatform,
  type UserStatus,
} from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type ProfileWrite = Pick<
  CreatorProfile,
  "handle" | "handleLower" | "displayName" | "bio" | "categoryId" | "supportMessageEnabled"
> & { handleChangedAt?: Date | null };

export type PublicProfileRow = {
  profile: CreatorProfile;
  userStatus: UserStatus;
  categoryName: string | null;
};

export class CreatorProfileRepository extends BaseRepository {
  async findByUserId(userId: string, tx?: Executor): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx).select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
    return row ?? null;
  }

  /** Row-locks the profile (handle changes, risk tier). */
  async lockByUserId(userId: string, tx: Executor): Promise<CreatorProfile | null> {
    const [row] = await tx.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).for("update").limit(1);
    return row ?? null;
  }

  async findByHandleLower(handleLower: string, tx?: Executor): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.handleLower, handleLower))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string, tx?: Executor): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx).select().from(creatorProfiles).where(eq(creatorProfiles.id, id)).limit(1);
    return row ?? null;
  }

  /** Profile + owner status + category name for the public page (one indexed lookup). */
  async findPublicByHandleLower(handleLower: string, tx?: Executor): Promise<PublicProfileRow | null> {
    const [row] = await this.exec(tx)
      .select({ profile: creatorProfiles, userStatus: users.status, categoryName: categories.name })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .leftJoin(categories, eq(categories.id, creatorProfiles.categoryId))
      .where(eq(creatorProfiles.handleLower, handleLower))
      .limit(1);
    return row ?? null;
  }

  /** Live pages for the sitemap: published, and the owner isn't suspended or closed (same rule as the public page). */
  async listPublishedForSitemap(limit: number, tx?: Executor): Promise<{ handle: string; updatedAt: Date }[]> {
    return this.exec(tx)
      .select({ handle: creatorProfiles.handle, updatedAt: creatorProfiles.updatedAt })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(and(eq(creatorProfiles.status, "published"), notInArray(users.status, ["suspended", "closed"])))
      .orderBy(desc(creatorProfiles.updatedAt))
      .limit(limit);
  }

  /** Throws a unique violation if the handle is taken (callers check isUniqueViolation). */
  async insert(userId: string, data: ProfileWrite, tx?: Executor): Promise<CreatorProfile> {
    const [row] = await this.exec(tx)
      .insert(creatorProfiles)
      .values({ userId, ...data })
      .returning();
    return row;
  }

  /** Owner-scoped update: the WHERE clause is the IDOR guard. */
  async updateOwned(userId: string, patch: Partial<ProfileWrite>, tx?: Executor): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx)
      .update(creatorProfiles)
      .set(patch)
      .where(eq(creatorProfiles.userId, userId))
      .returning();
    return row ?? null;
  }

  /**
   * With `expected` (the key the caller read), nothing is written if the photo changed meanwhile,
   * so a concurrent upload or removal is never overwritten. Returns whether it was written.
   */
  async setAvatarKeyOwned(userId: string, avatarKey: string | null, tx?: Executor, opts: { expected?: string | null } = {}): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(creatorProfiles)
      .set({ avatarKey })
      .where(
        and(
          eq(creatorProfiles.userId, userId),
          opts.expected !== undefined ? sql`${creatorProfiles.avatarKey} is not distinct from ${opts.expected}` : undefined,
        ),
      )
      .returning({ id: creatorProfiles.id });
    return rows.length > 0;
  }

  async acceptTermsOwned(userId: string, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(creatorProfiles)
      .set({ creatorTermsAcceptedAt: at })
      .where(and(eq(creatorProfiles.userId, userId), isNull(creatorProfiles.creatorTermsAcceptedAt)));
  }

  /** Status change, never touching a suspended profile (only staff lift suspensions). */
  async setStatusOwned(
    userId: string,
    status: Exclude<ProfileStatus, "suspended">,
    publishedAt: Date | null,
    tx?: Executor,
  ): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx)
      .update(creatorProfiles)
      .set(publishedAt ? { status, publishedAt } : { status })
      .where(and(eq(creatorProfiles.userId, userId), ne(creatorProfiles.status, "suspended")))
      .returning();
    return row ?? null;
  }

  /** Takes a live page offline; any other status (draft, suspended, …) is left alone. */
  async unpublishIfPublished(userId: string, tx?: Executor): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx)
      .update(creatorProfiles)
      .set({ status: "unpublished" })
      .where(and(eq(creatorProfiles.userId, userId), eq(creatorProfiles.status, "published")))
      .returning();
    return row ?? null;
  }

  async listLinks(profileId: string, tx?: Executor): Promise<SocialLink[]> {
    return this.exec(tx)
      .select()
      .from(socialLinks)
      .where(eq(socialLinks.profileId, profileId))
      .orderBy(asc(socialLinks.position));
  }

  async replaceLinks(profileId: string, links: { platform: SocialPlatform; url: string }[], tx?: Executor) {
    const db = this.exec(tx);
    await db.delete(socialLinks).where(eq(socialLinks.profileId, profileId));
    if (links.length) {
      await db.insert(socialLinks).values(links.map((l, position) => ({ profileId, ...l, position })));
    }
  }

  async setVerificationTier(userId: string, tier: CreatorProfile["verificationTier"], tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorProfiles).set({ verificationTier: tier }).where(eq(creatorProfiles.userId, userId));
  }

  async setRiskTier(userId: string, tier: CreatorProfile["riskTier"], tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorProfiles).set({ riskTier: tier }).where(eq(creatorProfiles.userId, userId));
  }

  async setStatusByStaff(profileId: string, status: ProfileStatus, tx?: Executor): Promise<CreatorProfile | null> {
    const [row] = await this.exec(tx).update(creatorProfiles).set({ status }).where(eq(creatorProfiles.id, profileId)).returning();
    return row ?? null;
  }

  /**
   * Account erasure: the profile keeps its id (payments and products reference it) but loses
   * everything personal. The handle becomes a placeholder, which frees the real one.
   * Returns the profile as it was, so the caller can clean up the avatar and caches.
   */
  async anonymise(userId: string, placeholderHandle: string, tx?: Executor): Promise<CreatorProfile | null> {
    const db = this.exec(tx);
    const [before] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.userId, userId)).limit(1);
    if (!before) return null;
    await db.delete(socialLinks).where(eq(socialLinks.profileId, before.id));
    await db
      .update(creatorProfiles)
      .set({
        handle: placeholderHandle,
        handleLower: placeholderHandle.toLowerCase(),
        displayName: "Deleted creator",
        bio: "",
        avatarKey: null,
        status: before.status === "suspended" ? "suspended" : "unpublished",
        publishedAt: null,
      })
      .where(eq(creatorProfiles.id, before.id));
    return before;
  }

}
