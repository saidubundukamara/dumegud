import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import type { Actor } from "@/server/services/actor";
import { CreatorService } from "@/server/services/CreatorService";
import type { ProfileInput } from "@/server/validation/creator";
import { createCreatorFakes } from "../fixtures/creator-fakes";

let fakes: ReturnType<typeof createCreatorFakes>;
let service: CreatorService;

const actor = (userId: string, overrides: Partial<Actor> = {}): Actor => ({
  userId,
  role: "creator",
  status: "active",
  emailVerified: true,
  ...overrides,
});

const input = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
  handle: "aminata",
  displayName: "Aminata",
  bio: "I make music.",
  categoryId: null,
  supportMessageEnabled: true,
  links: [],
  ...overrides,
});

const fieldError = (field: string) => expect.objectContaining({ fieldErrors: { [field]: expect.any(Array) } });

beforeEach(() => {
  fakes = createCreatorFakes();
  service = new CreatorService(fakes.deps);
});

describe("handles", () => {
  it("are unique case-insensitively", async () => {
    await service.saveProfile(actor("u1"), input({ handle: "Aminata" }));
    await expect(service.saveProfile(actor("u2"), input({ handle: "AMINATA" }))).rejects.toEqual(fieldError("handle"));
  });

  it("keep the creator's casing for display", async () => {
    await service.saveProfile(actor("u1"), input({ handle: "AminataK" }));
    const profile = [...fakes.profiles.values()][0];
    expect(profile).toMatchObject({ handle: "AminataK", handleLower: "aminatak" });
  });

  it("reject reserved and route names", async () => {
    await expect(service.saveProfile(actor("u1"), input({ handle: "dumegud" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(service.saveProfile(actor("u1"), input({ handle: "dashboard" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("can be changed once per 30 days, and the old one redirects and is protected for 90 days", async () => {
    await service.saveProfile(actor("u1"), input({ handle: "first" }));
    await service.saveProfile(actor("u1"), input({ handle: "second" })); // first change is free
    await expect(service.saveProfile(actor("u1"), input({ handle: "third" }))).rejects.toEqual(fieldError("handle"));

    // Someone else can't grab the released handle…
    await expect(service.saveProfile(actor("u2"), input({ handle: "first" }))).rejects.toEqual(fieldError("handle"));

    // …and it redirects once the page is published.
    const profile = [...fakes.profiles.values()][0];
    fakes.profiles.set(profile.id, { ...fakes.profiles.get(profile.id)!, status: "published" });
    expect(await service.getPublicProfile("first")).toEqual({ kind: "redirect", handle: "second", profileId: profile.id });

    fakes.advanceDays(91);
    expect(await service.getPublicProfile("first")).toEqual({ kind: "not_found" });
    await expect(service.saveProfile(actor("u2"), input({ handle: "first" }))).resolves.toBeDefined();
  });

  it("can be reclaimed by the same creator", async () => {
    await service.saveProfile(actor("u1"), input({ handle: "first" }));
    await service.saveProfile(actor("u1"), input({ handle: "second" }));
    fakes.advanceDays(31);
    await service.saveProfile(actor("u1"), input({ handle: "first" }));
    expect(fakes.history.has("first")).toBe(false);
    expect(fakes.history.has("second")).toBe(true);
  });

  it("a casing-only change doesn't count as a handle change", async () => {
    await service.saveProfile(actor("u1"), input({ handle: "first" }));
    await service.saveProfile(actor("u1"), input({ handle: "First" }));
    await service.saveProfile(actor("u1"), input({ handle: "second" }));
    expect(fakes.history.has("first")).toBe(true);
  });

  it("reports cache tags for both the new and the released handle", async () => {
    await service.saveProfile(actor("u1"), input({ handle: "first" }));
    const change = await service.saveProfile(actor("u1"), input({ handle: "second" }));
    expect(change.handles.sort()).toEqual(["first", "second"]);
  });
});

describe("saveProfile", () => {
  it("rejects unknown categories", async () => {
    await expect(
      service.saveProfile(actor("u1"), input({ categoryId: "00000000-0000-4000-8000-00000000dead" })),
    ).rejects.toEqual(fieldError("categoryId"));
  });

  it("refuses edits to a suspended page", async () => {
    await service.saveProfile(actor("u1"), input());
    const p = [...fakes.profiles.values()][0];
    fakes.profiles.set(p.id, { ...p, status: "suspended" });
    await expect(service.saveProfile(actor("u1"), input({ bio: "x" }))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("publishing", () => {
  async function readyCreator(userId = "u1") {
    await service.saveProfile(actor(userId), input());
    await service.acceptCreatorTerms(actor(userId));
    fakes.setWallet(userId, "active");
  }

  it("publishes when every checklist item is done", async () => {
    await readyCreator();
    await service.publish(actor("u1"));
    expect([...fakes.profiles.values()][0].status).toBe("published");
    expect((await service.getPublicProfile("aminata")).kind).toBe("found");
  });

  it.each([
    ["unverified email", () => actor("u1", { emailVerified: false }), () => {}],
    ["restricted account", () => actor("u1", { status: "restricted" }), () => {}],
    ["pending wallet", () => actor("u1"), () => fakes.setWallet("u1", "pending")],
  ])("refuses with a %s", async (_label, who, arrange) => {
    await readyCreator();
    arrange();
    await expect(service.publish(who())).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses without accepted terms", async () => {
    await service.saveProfile(actor("u1"), input());
    fakes.setWallet("u1", "active");
    const checklist = await service.getPublishChecklist(actor("u1"));
    expect(checklist.find((i) => i.key === "terms")?.done).toBe(false);
    await expect(service.publish(actor("u1"))).rejects.toBeInstanceOf(ConflictError);
  });

  it("owners can't publish a suspended page", async () => {
    await readyCreator();
    const p = [...fakes.profiles.values()][0];
    fakes.profiles.set(p.id, { ...p, status: "suspended" });
    await expect(service.publish(actor("u1"))).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("getPublicProfile", () => {
  it("hides draft and unpublished pages", async () => {
    await service.saveProfile(actor("u1"), input());
    expect(await service.getPublicProfile("aminata")).toEqual({ kind: "not_found" });
  });

  it("shows suspended pages and suspended owners as unavailable", async () => {
    await service.saveProfile(actor("u1"), input());
    const p = [...fakes.profiles.values()][0];
    fakes.profiles.set(p.id, { ...p, status: "published" });
    fakes.userStatus.set("u1", "suspended");
    expect((await service.getPublicProfile("aminata")).kind).toBe("unavailable");
  });

  it.each(["' OR 1=1 --", "a", "../etc/passwd", "<script>", "x".repeat(200)])(
    "returns not_found for malformed handle %s without querying",
    async (handle) => {
      let queried = false;
      fakes.profileRepo.findPublicByHandleLower = async () => {
        queried = true;
        return null;
      };
      expect(await service.getPublicProfile(handle)).toEqual({ kind: "not_found" });
      expect(queried).toBe(false);
    },
  );

  it("returns only public fields", async () => {
    await service.saveProfile(actor("u1"), input({ links: [{ platform: "instagram", url: "https://instagram.com/aminata" }] }));
    const p = [...fakes.profiles.values()][0];
    fakes.profiles.set(p.id, { ...p, status: "published", avatarKey: "avatars/u1/a.webp" });
    const result = await service.getPublicProfile("@Aminata");
    if (result.kind !== "found") throw new Error("expected found");
    expect(Object.keys(result.profile).sort()).toEqual(
      ["avatarUrl", "bio", "categoryName", "displayName", "handle", "id", "links", "ownerId", "suggestedAmountsMinor", "supportMessageEnabled"].sort(),
    );
    expect(result.profile.avatarUrl).toBe("https://cdn.dumegud.test/avatars/u1/a.webp");
  });
});
