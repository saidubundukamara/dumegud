import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/server/lib/errors";
import { AvatarService, isOwnStagingKey, reencodeAvatar } from "@/server/services/AvatarService";
import { createCreatorFakes, createMemoryStorage } from "../fixtures/creator-fakes";

const USER = "11111111-2222-4333-8444-555555555555";
const actor = { userId: USER, role: "creator" as const, status: "active" as const, emailVerified: true };

async function jpegWithExif() {
  return sharp({ create: { width: 900, height: 600, channels: 3, background: "#c0ffee" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-gps-and-camera" } })
    .toBuffer();
}

describe("reencodeAvatar", () => {
  it("returns a 400×400 WebP with no EXIF", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // the fixture really carries EXIF
    const out = await reencodeAvatar(input);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 400, height: 400 });
    expect(meta.exif).toBeUndefined();
    expect(out.byteLength).toBeLessThan(100_000);
  });

  it("rejects SVG, GIF and non-images", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(reencodeAvatar(svg)).rejects.toThrow();
    await expect(reencodeAvatar(gif)).rejects.toThrow();
    await expect(reencodeAvatar(Buffer.from("not an image"))).rejects.toThrow();
  });
});

describe("isOwnStagingKey", () => {
  it("only accepts keys minted for this user", () => {
    expect(isOwnStagingKey(USER, `staging/avatars/${USER}/0b5c2b0e-5d9f-4c1b-9a8f-1a2b3c4d5e6f`)).toBe(true);
    expect(isOwnStagingKey(USER, `staging/avatars/someone-else/0b5c2b0e-5d9f-4c1b-9a8f-1a2b3c4d5e6f`)).toBe(false);
    expect(isOwnStagingKey(USER, `staging/avatars/${USER}/../other/x`)).toBe(false);
    expect(isOwnStagingKey(USER, `avatars/${USER}/x.webp`)).toBe(false);
  });
});

describe("AvatarService", () => {
  let creators: ReturnType<typeof createCreatorFakes>;
  let store: ReturnType<typeof createMemoryStorage>;
  let service: AvatarService;

  beforeEach(async () => {
    creators = createCreatorFakes();
    store = createMemoryStorage();
    service = new AvatarService(creators.profileRepo as never, store.storage, { uploads: "up", public: "pub" }, async () => {});
    await creators.profileRepo.insert(USER, { handle: "aminata", handleLower: "aminata", displayName: "Aminata" });
  });

  it("presigns a staging key for the user", async () => {
    const { key, url } = await service.requestUpload(actor, { contentType: "image/jpeg", size: 1000 });
    expect(isOwnStagingKey(USER, key)).toBe(true);
    expect(url).toContain(key);
  });

  it("re-encodes, publishes, deletes the staging object and replaces the old avatar", async () => {
    const first = await service.requestUpload(actor, { contentType: "image/jpeg", size: 1000 });
    store.put("up", first.key, await jpegWithExif());
    const change = await service.confirmUpload(actor, first.key);
    expect(change.handles).toEqual(["aminata"]);

    const profile = await creators.profileRepo.findByUserId(USER);
    const firstAvatar = profile!.avatarKey!;
    expect(firstAvatar).toMatch(new RegExp(`^avatars/${USER}/[0-9a-f-]+\\.webp$`));
    expect(store.objects.get(`pub/${firstAvatar}`)).toMatchObject({ contentType: "image/webp" });
    expect(store.objects.has(`up/${first.key}`)).toBe(false);

    const second = await service.requestUpload(actor, { contentType: "image/png", size: 1000 });
    store.put("up", second.key, await sharp({ create: { width: 50, height: 50, channels: 4, background: "#fff" } }).png().toBuffer());
    await service.confirmUpload(actor, second.key);
    expect(store.objects.has(`pub/${firstAvatar}`)).toBe(false);
  });

  it("rejects another user's key and non-image uploads", async () => {
    await expect(service.confirmUpload(actor, "staging/avatars/other/0b5c2b0e-5d9f-4c1b-9a8f-1a2b3c4d5e6f")).rejects.toBeInstanceOf(
      ValidationError,
    );
    const { key } = await service.requestUpload(actor, { contentType: "image/png", size: 10 });
    store.put("up", key, Buffer.from("<html><script>alert(1)</script></html>"));
    await expect(service.confirmUpload(actor, key)).rejects.toBeInstanceOf(ValidationError);
    expect(store.objects.has(`up/${key}`)).toBe(false);
  });

  it("rejects oversized uploads", async () => {
    const { key } = await service.requestUpload(actor, { contentType: "image/png", size: 10 });
    store.put("up", key, new Uint8Array(2 * 1024 * 1024 + 1));
    await expect(service.confirmUpload(actor, key)).rejects.toThrow(/under 2 MB/);
  });
});
