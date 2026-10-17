import "server-only";
import { z } from "zod";
import { parseMajorToMinor } from "@/lib/money";
import { isShoutoutPlatform, parseShoutoutHandle, SHOUTOUT_HANDLE_MAX, SHOUTOUT_PLATFORMS } from "@/lib/shoutout";
import { isTrafficSource } from "@/lib/traffic-source";

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

/** Optional shout-out handle: blank → null; otherwise validated for its platform. */
const shoutoutFields = {
  socialPlatform: z
    .string()
    .nullish()
    .transform((v) => (isShoutoutPlatform(v) ? v : null)),
  socialHandle: plainText(SHOUTOUT_HANDLE_MAX + 30, "Your username"),
};

function refineHandle(
  v: { socialPlatform: (typeof SHOUTOUT_PLATFORMS)[number] | null; socialHandle: string | null },
  ctx: z.RefinementCtx,
): { socialPlatform: (typeof SHOUTOUT_PLATFORMS)[number] | null; socialHandle: string | null } {
  if (!v.socialHandle) return { socialPlatform: null, socialHandle: null };
  if (!v.socialPlatform) {
    ctx.addIssue({ code: "custom", path: ["socialPlatform"], message: "Choose where you'd like the shout-out." });
    return v;
  }
  const parsed = parseShoutoutHandle(v.socialPlatform, v.socialHandle);
  if ("error" in parsed) {
    ctx.addIssue({ code: "custom", path: ["socialHandle"], message: parsed.error });
    return v;
  }
  return { socialPlatform: v.socialPlatform, socialHandle: parsed.handle };
}

/** Allow-listed fields only. Amount limits are checked against platform settings in the service. */
export const startSupportSchema = z
  .object({
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
  ...shoutoutFields,
  shoutoutConsent: z.boolean().default(false),
  /** Attribution hint from the browser; anything unknown becomes null. */
  source: z
    .string()
    .nullish()
    .transform((v) => (isTrafficSource(v) ? v : null)),
  })
  .transform((v, ctx) => ({ ...v, ...refineHandle(v, ctx) }));

type ShoutoutKeys = "socialPlatform" | "socialHandle" | "shoutoutConsent" | "source";
type ParsedSupport = z.output<typeof startSupportSchema>;
/** The shout-out and attribution fields are optional for callers other than the widget. */
export type StartSupportInput = Omit<ParsedSupport, ShoutoutKeys> & Partial<Pick<ParsedSupport, ShoutoutKeys>>;
export type AddShoutoutInput = z.output<typeof addShoutoutSchema>;

/** Thank-you page: add a shout-out handle to a just-paid contribution. */
export const addShoutoutSchema = z
  .object({
    paymentId: z.uuid(),
    ...shoutoutFields,
  })
  .transform((v, ctx) => {
    const refined = refineHandle(v, ctx);
    if (!refined.socialHandle) ctx.addIssue({ code: "custom", path: ["socialHandle"], message: "Enter your username." });
    return { paymentId: v.paymentId, ...refined };
  });
