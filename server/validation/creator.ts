import "server-only";
import { z } from "zod";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { MAX_SOCIAL_LINKS, parseSocialUrl, SOCIAL_PLATFORMS } from "@/lib/social";

export const BIO_MAX = 500;
export const DISPLAY_NAME_MAX = 60;

/** Plain text: drop control characters (keep newlines), normalise line endings, collapse blank runs. */
function cleanText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const handleSchema = z
  .string()
  .transform(normalizeHandle)
  .superRefine((v, ctx) => {
    const error = handleFormatError(v);
    if (error) ctx.addIssue({ code: "custom", message: error });
  });

const linkSchema = z
  .object({ platform: z.enum(SOCIAL_PLATFORMS), url: z.string() })
  .transform((link, ctx) => {
    const parsed = parseSocialUrl(link.platform, link.url);
    if ("error" in parsed) {
      ctx.addIssue({ code: "custom", message: parsed.error, path: ["url"] });
      return z.NEVER;
    }
    return { platform: link.platform, url: parsed.url };
  });

// Allow-listed fields only: status, userId, tiers and suggested amounts can't be set here.
export const profileSchema = z.object({
  handle: handleSchema,
  displayName: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, "Enter the name supporters will see.").max(DISPLAY_NAME_MAX, `Use at most ${DISPLAY_NAME_MAX} characters.`))
    .refine((v) => !v.includes("\n"), "Keep your name on one line."),
  bio: z.string().transform(cleanText).pipe(z.string().max(BIO_MAX, `Use at most ${BIO_MAX} characters.`)),
  categoryId: z.union([z.literal("").transform(() => null), z.uuid()]),
  supportMessageEnabled: z.boolean(),
  links: z.array(linkSchema).max(MAX_SOCIAL_LINKS, `Add at most ${MAX_SOCIAL_LINKS} links.`),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const avatarUploadSchema = z.object({
  contentType: z.enum(AVATAR_TYPES, "Use a JPEG, PNG or WebP image."),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES, "Use an image under 2 MB."),
});
