// Shape returned by form Server Actions to `useActionState`. Safe for client and server.

export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** The AppError code of a failure (e.g. STEP_UP_REQUIRED), for forms that react to it. */
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echoed non-secret inputs, so a failed submit doesn't wipe what the user typed. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };
