"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { assertNotBot } from "@/server/lib/bot";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";

const reportSchema = z.object({
  targetType: z.enum(["creator", "product"]),
  targetId: z.uuid(),
  reason: z.enum(["scam", "impersonation", "copyright", "illegal", "other"], "Choose a reason."),
  details: z.string().trim().max(1000, "Use at most 1000 characters."),
  reporterEmail: z.union([z.literal("").transform(() => null), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email or leave it blank."))]),
});

export async function submitReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { details: field(formData, "details"), reporterEmail: field(formData, "reporterEmail") };
  const parsed = reportSchema.safeParse({
    targetType: field(formData, "targetType"),
    targetId: field(formData, "targetId"),
    reason: field(formData, "reason"),
    ...values,
  });
  if (!parsed.success) return invalidForm(parsed.error, values);
  return runForm(async () => {
    await assertNotBot();
    const ctx = getRequestContext(await headers());
    await enforceRateLimit("report:ip", ctx.ip);
    await services.reports.submit(parsed.data, ctx);
    return { status: "success", message: "Thanks. Our team will review your report." };
  }, values);
}
