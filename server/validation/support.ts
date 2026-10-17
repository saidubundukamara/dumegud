import "server-only";
import { z } from "zod";
import { parseMajorToMinor } from "@/lib/money";

export const SUPPORTER_NAME_MAX = 60;
export const SUPPORT_MESSAGE_MAX = 280;

const plainText = (max: number, label: string) =>
  z
    .string()
    .transform((v) =>
      v
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
        .trim(),
    )
    .pipe(z.string().max(max, `${label} can be at most ${max} characters.`))
    .transform((v) => v || null);

/** Allow-listed fields only. Amount limits are checked against platform settings in the service. */
export const startSupportSchema = z.object({
  handle: z.string().min(1).max(64),
  /** Entered in leones ("50", "50.5"); converted without floats. */
  amount: z
    .string()
    .transform((v, ctx) => {
      const minor = parseMajorToMinor(v);
      if (minor === null || minor <= 0) {
        ctx.addIssue({ code: "custom", message: "Enter an amount in leones, like 50 or 50.50." });
        return z.NEVER;
      }
      return minor;
    }),
  supporterName: plainText(SUPPORTER_NAME_MAX, "Your name").refine((v) => !v?.includes("\n"), "Keep your name on one line."),
  message: plainText(SUPPORT_MESSAGE_MAX, "Your message"),
  isAnonymous: z.boolean(),
});

export type StartSupportInput = z.infer<typeof startSupportSchema>;
