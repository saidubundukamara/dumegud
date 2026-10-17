import "server-only";
import { z } from "zod";
import { CAPTION_STYLES, SHOUTOUT_PLATFORMS } from "@/lib/shoutout";

const MAX_IDS = 500;

/** One value or a repeated query/form field, as an array. */
const idList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.uuid()).max(MAX_IDS));

/** Generator options from the dashboard's query string (or the image route). Junk falls back to defaults. */
export const shoutoutOptionsSchema = z.object({
  period: z.enum(["since_last", "week", "month"]).catch("since_last"),
  platform: z.enum(SHOUTOUT_PLATFORMS).catch("tiktok"),
  style: z.enum(CAPTION_STYLES).catch("warm"),
  includeTop: z.preprocess((v) => v === "1" || v === "on" || v === true, z.boolean()),
  exclude: idList.catch([]),
});

export const markPostedSchema = shoutoutOptionsSchema.extend({
  exclude: idList,
  reviewed: idList.pipe(z.array(z.uuid()).min(1, "There's nobody to thank yet.")),
});

export type ShoutoutOptionsInput = z.output<typeof shoutoutOptionsSchema>;

/** URLSearchParams / FormData → plain object with repeated keys as arrays. */
export function entriesToObject(entries: Iterable<[string, FormDataEntryValue]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of entries) {
    if (typeof raw !== "string") continue;
    const prev = out[key];
    out[key] = prev === undefined ? raw : Array.isArray(prev) ? [...prev, raw] : [prev, raw];
  }
  return out;
}
