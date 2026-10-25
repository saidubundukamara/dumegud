import "server-only";
import { refresh } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { runForm } from "@/server/lib/form";

/**
 * runForm for console actions: after a change succeeds the page re-renders, so lists, counts
 * and buttons show what's true now (another admin may have acted too).
 */
export async function runAdminForm(fn: () => Promise<FormState>, values?: Record<string, string>): Promise<FormState> {
  const result = await runForm(fn, values);
  if (result.status === "success") refresh();
  return result;
}
