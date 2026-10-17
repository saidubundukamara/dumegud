import { describe, expect, it } from "vitest";
import { profileSchema } from "@/server/validation/creator";

const base = {
  handle: "@Aminata",
  displayName: "Aminata",
  bio: "",
  categoryId: "",
  supportMessageEnabled: true,
  links: [],
};

describe("profileSchema", () => {
  it("normalises the handle and an empty category", () => {
    expect(profileSchema.parse(base)).toMatchObject({ handle: "aminata", categoryId: null });
  });

  it("strips fields outside the allow-list (no mass assignment)", () => {
    const parsed = profileSchema.parse({ ...base, status: "published", userId: "x", riskTier: "low", suggestedAmountsMinor: [1] });
    expect(Object.keys(parsed).sort()).toEqual(["bio", "categoryId", "displayName", "handle", "links", "supportMessageEnabled"]);
  });

  it("keeps bios as plain text: strips control and bidi characters, caps length", () => {
    const parsed = profileSchema.parse({ ...base, bio: "Hi‮ there\r\n\n\n\nbye\u0007" });
    expect(parsed.bio).toBe("Hi there\n\nbye");
    expect(profileSchema.safeParse({ ...base, bio: "x".repeat(501) }).success).toBe(false);
  });

  it("stores <script> in a bio as text (React escapes it on render)", () => {
    expect(profileSchema.parse({ ...base, bio: "<script>alert(1)</script>" }).bio).toBe("<script>alert(1)</script>");
  });

  it("rejects javascript: links and mislabelled platforms", () => {
    expect(profileSchema.safeParse({ ...base, links: [{ platform: "website", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, links: [{ platform: "tiktok", url: "https://evil.example" }] }).success).toBe(false);
  });

  it("caps the number of links", () => {
    const links = Array.from({ length: 7 }, (_, i) => ({ platform: "website", url: `https://e${i}.example` }));
    expect(profileSchema.safeParse({ ...base, links }).success).toBe(false);
  });
});
