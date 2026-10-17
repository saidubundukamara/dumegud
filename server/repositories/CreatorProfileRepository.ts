import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
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

  async setAvatarKeyOwned(userId: string, avatarKey: string | null, tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorProfiles).set({ avatarKey }).where(eq(creatorProfiles.userId, userId));
  }

  async acceptTermsOwned(userId: string, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(creatorProfiles)
      .set({ creatorTermsAcceptedAt: at })
      .where(eq(creatorProfiles.userId, userId));
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
}
