import "server-only";
import { z } from "zod";
import { parseMajorToMinor } from "@/lib/money";

export const KYC_DOCS = ["id_front", "id_back", "selfie"] as const;
export type KycDoc = (typeof KYC_DOCS)[number];

const plain = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, "").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "This is required.").max(max));

export const kycSubmitSchema = z.object({
  legalName: plain(120).refine((v) => v.split(" ").length >= 2, "Enter your full name as it appears on your ID."),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      const age = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
      return !Number.isNaN(d.getTime()) && age >= 18 && age < 120;
    }, "You must be at least 18."),
  idType: z.enum(["national_id", "passport", "drivers_license", "voter_id"]),
  idNumber: z
    .string()
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .pipe(z.string().min(4, "Enter the number on your ID.").max(40)),
  idFrontKey: z.string().min(1, "Add a photo of the front of your ID."),
  idBackKey: z.string().transform((v) => v || null),
  selfieKey: z.string().min(1, "Add a selfie holding your ID."),
});

export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;

export const kycUploadSchema = z.object({
  doc: z.enum(KYC_DOCS),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"], "Use a JPEG, PNG or WebP photo."),
  size: z.number().int().positive().max(8 * 1024 * 1024, "Use a photo under 8 MB."),
});

export const bindMethodSchema = z.object({
  phone: z.string().min(1, "Enter your mobile money number.").max(30),
  providerId: z.union([z.literal("").transform(() => null), z.enum(["m17", "m18"])]),
});

export const withdrawSchema = z.object({
  amount: z.string().transform((v, ctx) => {
    const minor = parseMajorToMinor(v);
    if (minor === null || minor <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in leones." });
      return z.NEVER;
    }
    return minor;
  }),
});
