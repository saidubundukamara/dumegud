"use server";

import { headers } from "next/headers";
import type { FormState } from "@/lib/form-state";
import { requireAdmin, stepUpSubject } from "@/server/dal/admin-session";
import { grantStepUp } from "@/server/dal/step-up";
import { field, runForm } from "@/server/lib/form";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";

/** A fresh authenticator code unlocks sensitive admin actions for 10 minutes. */
export async function confirmStepUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  return runForm(async () => {
    const ok = await services.adminAuth.confirmStepUp(session.actor, field(formData, "code"), getRequestContext(await headers()));
    if (!ok) return { status: "error", message: "That code didn't work. Wait for a new one and try again." };
    await grantStepUp(stepUpSubject(session));
    return { status: "success", message: "Sensitive actions unlocked for 10 minutes." };
  });
}
