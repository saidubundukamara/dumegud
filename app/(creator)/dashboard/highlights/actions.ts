"use server";

import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { isMilestoneKey } from "@/lib/milestones";
import { isMonthKey } from "@/lib/recap";
import { verifySession } from "@/server/dal/session";
import { toActionResult } from "@/server/lib/errors";
import { field } from "@/server/lib/form";
import { services } from "@/server/services";
import { recapSeenSchema } from "@/server/validation/engagement";

// Seen/dismiss actions for the Home cards. Owner-scoped in the service; repeats are no-ops.

/** Open last month's recap from Home: it stops showing there. */
export async function openRecap(formData: FormData): Promise<void> {
  const { actor } = await verifySession();
  const parsed = recapSeenSchema.safeParse({ recapId: field(formData, "recapId") });
  const month = field(formData, "month");
  if (parsed.success) await toActionResult(() => services.recaps.markSeen(actor, parsed.data.recapId));
  redirect((isMonthKey(month) ? `/dashboard/highlights?month=${month}` : "/dashboard/highlights") as Route);
}

export async function dismissRecap(formData: FormData): Promise<void> {
  const { actor } = await verifySession();
  const parsed = recapSeenSchema.safeParse({ recapId: field(formData, "recapId") });
  if (parsed.success) await toActionResult(() => services.recaps.markSeen(actor, parsed.data.recapId));
  refresh();
}

/** Open a new milestone's card from Home: the celebration is done. */
export async function openMilestone(formData: FormData): Promise<void> {
  const { actor } = await verifySession();
  const key = field(formData, "key");
  await toActionResult(() => services.milestones.markSeen(actor));
  redirect((isMilestoneKey(key) ? `/dashboard/highlights?milestone=${key}#milestones` : "/dashboard/highlights#milestones") as Route);
}

export async function dismissMilestone(): Promise<void> {
  const { actor } = await verifySession();
  await toActionResult(() => services.milestones.markSeen(actor));
  refresh();
}
