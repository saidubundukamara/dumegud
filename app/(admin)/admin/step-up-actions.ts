"use server";

import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/dal/session";
import { grantStepUp } from "@/server/dal/step-up";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

/** Confirm the password to unlock sensitive admin actions for 10 minutes. */
export async function confirmStepUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("staff", "super_admin");
  return runForm(async () => {
    const ok = await services.auth.confirmPassword(session.actor, field(formData, "password"));
    await services.audit.log({ actor: session.actor, action: ok ? "step_up.success" : "step_up.failure", targetType: "user", targetId: session.actor.userId });
    if (!ok) return { status: "error", message: "That password is incorrect." };
    await grantStepUp({ userId: session.actor.userId, sessionVersion: session.sessionVersion });
    return { status: "success", message: "Sensitive actions unlocked for 10 minutes." };
  });
}
