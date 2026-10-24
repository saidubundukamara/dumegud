import "server-only";
import { z } from "zod";
import { MILESTONE_KEYS } from "@/lib/milestones";
import { isMonthKey } from "@/lib/recap";

const flag = z.preprocess((v) => v === "1" || v === "on" || v === true, z.boolean());
const size = z.enum(["story", "square"]).catch("story");

/** Recap card options from the query string. Amounts are off unless asked for. */
export const recapCardSchema = z.object({
  month: z.string().refine(isMonthKey, "Not a month."),
  size,
  amounts: flag,
});

export const milestoneCardSchema = z.object({
  key: z.enum(MILESTONE_KEYS as [string, ...string[]]),
  size,
  amounts: flag,
});

export const recapSeenSchema = z.object({ recapId: z.uuid() });

export const emailPreferencesSchema = z.object({ recapEmails: flag, milestoneEmails: flag });
