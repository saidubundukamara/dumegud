import type { CreatorProfile, CreatorWallet, UserStatus } from "@/server/db/schema";
import type { ObjectStorage } from "@/server/integrations/r2/storage";
import { ObjectTooLargeError } from "@/server/integrations/r2/storage";
import type { CreatorServiceDeps } from "@/server/services/CreatorService";

// In-memory stand-ins for the creator repositories, mirroring the SQL semantics that matter
// (unique handle_lower, owner-scoped updates, suspended profiles untouchable by owners).

class UniqueViolation extends Error {
  code = "23505";
}

export function createCreatorFakes(opts: { now?: Date } = {}) {
  let now = opts.now ?? new Date("2026-10-17T12:00:00Z");
  const profiles = new Map<string, CreatorProfile>();
  const links = new Map<string, { platform: string; url: string }[]>();
  const history = new Map<string, { handleLower: string; profileId: string; releasedAt: Date }>();
  const reserved = new Set(["dumegud", "support"]);
  const wallets = new Map<string, CreatorWallet>();
  const userStatus = new Map<string, UserStatus>();
  const categories = [{ id: "00000000-0000-4000-8000-000000000001", slug: "music", name: "Music", active: true, position: 1 }];

  const byUser = (userId: string) => [...profiles.values()].find((p) => p.userId === userId) ?? null;
  const byHandle = (h: string) => [...profiles.values()].find((p) => p.handleLower === h) ?? null;
  const assertUnique = (h: string, selfId?: string) => {
    const other = byHandle(h);
    if (other && other.id !== selfId) throw new UniqueViolation("duplicate handle_lower");
  };

  const profileRepo = {
    findByUserId: async (userId: string) => byUser(userId),
    findByHandleLower: async (h: string) => byHandle(h),
    findById: async (id: string) => profiles.get(id) ?? null,
    findPublicByHandleLower: async (h: string) => {
      const profile = byHandle(h);
      if (!profile) return null;
      const category = categories.find((c) => c.id === profile.categoryId);
      return { profile, userStatus: userStatus.get(profile.userId) ?? "active", categoryName: category?.name ?? null };
    },
    insert: async (userId: string, data: Partial<CreatorProfile>) => {
      assertUnique(data.handleLower!);
      const row: CreatorProfile = {
        id: crypto.randomUUID(),
        userId,
        handle: data.handle!,
        handleLower: data.handleLower!,
        handleChangedAt: data.handleChangedAt ?? null,
        displayName: data.displayName!,
        bio: data.bio ?? "",
        avatarKey: null,
        categoryId: data.categoryId ?? null,
        suggestedAmountsMinor: [2000, 5000, 10000],
        supportMessageEnabled: data.supportMessageEnabled ?? true,
        status: "draft",
        publishedAt: null,
        creatorTermsAcceptedAt: null,
        verificationTier: "none",
        riskTier: "low",
        createdAt: now,
        updatedAt: now,
      };
      profiles.set(row.id, row);
      return row;
    },
    updateOwned: async (userId: string, patch: Partial<CreatorProfile>) => {
      const p = byUser(userId);
      if (!p) return null;
      if (patch.handleLower) assertUnique(patch.handleLower, p.id);
      const next = { ...p, ...patch };
      profiles.set(p.id, next);
      return next;
    },
    setAvatarKeyOwned: async (userId: string, avatarKey: string | null) => {
      const p = byUser(userId);
      if (p) profiles.set(p.id, { ...p, avatarKey });
    },
    acceptTermsOwned: async (userId: string, at: Date) => {
      const p = byUser(userId);
      if (p) profiles.set(p.id, { ...p, creatorTermsAcceptedAt: at });
    },
    setStatusOwned: async (userId: string, status: CreatorProfile["status"], publishedAt: Date | null) => {
      const p = byUser(userId);
      if (!p || p.status === "suspended") return null;
      const next = { ...p, status, ...(publishedAt ? { publishedAt } : {}) };
      profiles.set(p.id, next);
      return next;
    },
    listLinks: async (profileId: string) =>
      (links.get(profileId) ?? []).map((l, position) => ({ id: `${position}`, profileId, verifiedAt: null, position, ...l })),
    replaceLinks: async (profileId: string, next: { platform: string; url: string }[]) => {
      links.set(profileId, next);
    },
  };

  const handleRepo = {
    isReserved: async (h: string) => reserved.has(h),
    findHistory: async (h: string) => history.get(h) ?? null,
    recordRelease: async (handleLower: string, profileId: string, releasedAt: Date) => {
      history.set(handleLower, { handleLower, profileId, releasedAt });
    },
    deleteHistory: async (h: string) => {
      history.delete(h);
    },
  };

  const walletRepo = {
    findByUserId: async (userId: string) => wallets.get(userId) ?? null,
  };

  const deps: CreatorServiceDeps = {
    repos: {
      profiles: profileRepo as unknown as CreatorServiceDeps["repos"]["profiles"],
      handles: handleRepo as unknown as CreatorServiceDeps["repos"]["handles"],
      categories: {
        listActive: async () => categories,
        isActive: async (id: string) => categories.some((c) => c.id === id && c.active),
      } as unknown as CreatorServiceDeps["repos"]["categories"],
      wallets: walletRepo as unknown as CreatorServiceDeps["repos"]["wallets"],
    },
    publicAssetUrl: (key) => `https://cdn.dumegud.test/${key}`,
    now: () => now,
    transaction: (fn) => fn(undefined as never),
  };

  return {
    deps,
    profiles,
    history,
    reserved,
    userStatus,
    categories,
    profileRepo,
    setWallet: (userId: string, status: CreatorWallet["status"]) =>
      wallets.set(userId, { userId, status } as CreatorWallet),
    advanceDays: (days: number) => {
      now = new Date(now.getTime() + days * 86_400_000);
    },
  };
}

/** In-memory object storage. */
export function createMemoryStorage() {
  const objects = new Map<string, { body: Uint8Array; contentType?: string; cacheControl?: string }>();
  const k = (bucket: string, key: string) => `${bucket}/${key}`;
  const storage: ObjectStorage = {
    presignPut: async ({ bucket, key }) => `https://r2.test/${bucket}/${key}?signed`,
    getObject: async (bucket, key, maxBytes) => {
      const o = objects.get(k(bucket, key));
      if (!o) return null;
      if (o.body.byteLength > maxBytes) throw new ObjectTooLargeError();
      return o;
    },
    putObject: async ({ bucket, key, body, contentType, cacheControl }) => {
      objects.set(k(bucket, key), { body, contentType, cacheControl });
    },
    deleteObject: async (bucket, key) => {
      objects.delete(k(bucket, key));
    },
    headObject: async (bucket, key) => {
      const o = objects.get(k(bucket, key));
      return o ? { size: o.body.byteLength, contentType: o.contentType } : null;
    },
    getRange: async (bucket, key, start, end) => objects.get(k(bucket, key))?.body.slice(start, end + 1) ?? null,
    streamObject: async (bucket, key) => {
      const o = objects.get(k(bucket, key));
      if (!o) return null;
      return (async function* () {
        for (let i = 0; i < o.body.byteLength; i += 64 * 1024) yield o.body.slice(i, i + 64 * 1024);
      })();
    },
    presignGet: async ({ bucket, key, filename }) => `https://r2.test/${bucket}/${key}?download=${encodeURIComponent(filename)}&signed`,
  };
  return { storage, objects, put: (bucket: string, key: string, body: Uint8Array) => objects.set(k(bucket, key), { body }) };
}
