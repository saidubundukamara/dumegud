import "server-only";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { toActionResult } from "./errors";

/** Read a text field from FormData ("" when missing or a file). */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function invalidForm(error: z.ZodError, values?: Record<string, string>): FormState {
  return {
    status: "error",
    message: "Please check the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
    values,
  };
}

/**
 * Run a form action body. AppErrors become an error FormState with their public message;
 * redirect()/forbidden() pass through untouched (via toActionResult).
 */
export async function runForm(fn: () => Promise<FormState>, values?: Record<string, string>): Promise<FormState> {
  const result = await toActionResult(fn);
  if (result.ok) return result.data;
  return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
}
