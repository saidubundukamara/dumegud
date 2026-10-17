"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { verifySession } from "@/server/dal/session";
import { invalidForm, runForm } from "@/server/lib/form";
import { services } from "@/server/services";
import { entriesToObject, markPostedSchema } from "@/server/validation/shoutout";

/** The creator posted the thank-you: everyone they reviewed stops waiting. */
export async function markShoutoutPosted(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const parsed = markPostedSchema.safeParse(entriesToObject(formData.entries()));
  if (!parsed.success) return invalidForm(parsed.error);
  let thanked: number | null = null;
  const result = await runForm(async () => {
    ({ thanked } = await services.shoutouts.markPosted(actor, parsed.data));
    return { status: "success" };
  });
  if (thanked === null) return result;
  redirect(`/dashboard/shoutouts?posted=${thanked}`);
}
