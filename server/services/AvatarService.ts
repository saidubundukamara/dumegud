import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ObjectTooLargeError, type ObjectStorage } from "@/server/integrations/r2/storage";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/server/validation/creator";
import type { Actor } from "./actor";
import type { ProfileChange } from "./CreatorService";

const AVATAR_SIZE = 400;
const UPLOAD_URL_TTL_SECONDS = 5 * 60;
/** Refuse decompression bombs: 25 megapixels is far beyond any phone photo we need. */
const MAX_INPUT_PIXELS = 25_000_000;

export type AvatarBuckets = { uploads: string; public: string };

/**
 * Avatar upload: the browser PUTs the raw file straight to a private R2 staging prefix (never
 * through our functions), then `confirmUpload` re-encodes it server-side. Re-encoding strips
 * EXIF/GPS, normalises orientation and format, and rejects anything that isn't really an image.
 */
export class AvatarService {
  constructor(
    private readonly profiles: CreatorProfileRepository,
    private readonly storage: ObjectStorage,
    private readonly buckets: AvatarBuckets,
    private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void> = enforceRateLimit,
  ) {}

  async requestUpload(actor: Actor, input: { contentType: (typeof AVATAR_TYPES)[number]; size: number }) {
    await this.rateLimit("upload:user", actor.userId);
    const profile = await this.profiles.findByUserId(actor.userId);
    if (!profile) throw new ConflictError("Set up your page before adding a photo.");

    const key = `${stagingPrefix(actor.userId)}${randomUUID()}`;
    const url = await this.storage.presignPut({
      bucket: this.buckets.uploads,
      key,
      contentType: input.contentType,
      contentLength: input.size,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return { key, url };
  }

  async confirmUpload(actor: Actor, key: string): Promise<ProfileChange> {
    if (!isOwnStagingKey(actor.userId, key)) throw new ValidationError("That upload couldn't be found.");
    const profile = await this.profiles.findByUserId(actor.userId);
    if (!profile) throw new ConflictError("Set up your page before adding a photo.");

    let object: Awaited<ReturnType<ObjectStorage["getObject"]>>;
    try {
      object = await this.storage.getObject(this.buckets.uploads, key, AVATAR_MAX_BYTES);
    } catch (err) {
      if (err instanceof ObjectTooLargeError) {
        await this.deleteQuietly(this.buckets.uploads, key);
        throw new ValidationError("Use an image under 2 MB.");
      }
      throw err;
    }
    if (!object) throw new ValidationError("That upload couldn't be found. Please try again.");

    const webp = await reencodeAvatar(object.body).catch(() => null);
    await this.deleteQuietly(this.buckets.uploads, key);
    if (!webp) throw new ValidationError("That file isn't a JPEG, PNG or WebP image we can read.");

    const publicKey = `avatars/${actor.userId}/${randomUUID()}.webp`;
    await this.storage.putObject({
      bucket: this.buckets.public,
      key: publicKey,
      body: webp,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    await this.profiles.setAvatarKeyOwned(actor.userId, publicKey);
    if (profile.avatarKey) await this.deleteQuietly(this.buckets.public, profile.avatarKey);
    return { profileId: profile.id, handles: [profile.handleLower] };
  }

  async removeAvatar(actor: Actor): Promise<ProfileChange | null> {
    const profile = await this.profiles.findByUserId(actor.userId);
    if (!profile?.avatarKey) return null;
    await this.profiles.setAvatarKeyOwned(actor.userId, null);
    await this.deleteQuietly(this.buckets.public, profile.avatarKey);
    return { profileId: profile.id, handles: [profile.handleLower] };
  }

  private async deleteQuietly(bucket: string, key: string) {
    try {
      await this.storage.deleteObject(bucket, key);
    } catch (err) {
      logger.warn("failed to delete object; lifecycle rules will clean it up", { bucket, err });
    }
  }
}

function stagingPrefix(userId: string) {
  return `staging/avatars/${userId}/`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Keys are only ever ones we minted for this user: no path tricks, no other users' uploads. */
export function isOwnStagingKey(userId: string, key: string): boolean {
  return new RegExp(`^${stagingPrefix(userId).replace(/[/]/g, "\\/")}${UUID}$`).test(key);
}

/** Square-crop to 400px WebP. Output carries no metadata (sharp drops EXIF unless asked). */
export async function reencodeAvatar(input: Uint8Array): Promise<Uint8Array> {
  const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
  const meta = await image.metadata();
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new Error(`unsupported format ${meta.format}`);
  const out = await image
    .rotate() // apply EXIF orientation before it's stripped
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();
  return new Uint8Array(out);
}
