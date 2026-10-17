import "server-only";
import { z } from "zod";
import { LICENSE_TYPES } from "@/lib/license";
import { parseMajorToMinor } from "@/lib/money";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;

const cleanText = (v: string) =>
  v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Major-unit price text → minor units. Range checks against settings happen in the service. */
const price = z.string().transform((v, ctx) => {
  const minor = parseMajorToMinor(v);
  if (minor === null || minor <= 0) {
    ctx.addIssue({ code: "custom", message: "Enter a price in leones, like 50 or 49.99." });
    return z.NEVER;
  }
  return minor;
});

// Allow-listed fields: status, creatorId, limits and review fields can't be set by the creator.
export const productSchema = z.object({
  title: z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(1, "Give your product a title.").max(TITLE_MAX, `Use at most ${TITLE_MAX} characters.`))
    .refine((v) => !v.includes("\n"), "Keep the title on one line."),
  description: z.string().transform(cleanText).pipe(z.string().max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters.`)),
  categoryId: z.union([z.literal("").transform(() => null), z.uuid()]),
  price,
  licenseType: z.enum(LICENSE_TYPES),
  licenseText: z.string().transform(cleanText).pipe(z.string().max(1000, "Use at most 1000 characters.")),
});

export type ProductInput = z.infer<typeof productSchema>;

export const uploadRequestSchema = z.object({
  productId: z.uuid(),
  kind: z.enum(["file", "preview_image"]),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

export const purchaseSchema = z.object({
  productId: z.uuid(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Enter the email address we should send your download link to.")),
  buyerName: z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(60, "Use at most 60 characters."))
    .transform((v) => v || null),
});
