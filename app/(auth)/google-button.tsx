import { connection } from "next/server";
import { isGoogleSignInEnabled } from "@/auth";
import { GoogleLogo } from "@/components/icons/GoogleLogo";
import { SubmitButton } from "@/components/ui/Button";
import { signInWithGoogle } from "./actions";
import { NextField } from "./next-field";

/** "Continue with Google" plus divider, rendered only when Google credentials are configured. */
export async function GoogleOption() {
  await connection(); // runtime env read
  if (!isGoogleSignInEnabled()) return null;
  return (
    <>
      <form action={signInWithGoogle}>
        <NextField />
        <SubmitButton
          variant="secondary"
          className="w-full hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_color-mix(in_srgb,var(--color-text)_35%,transparent)] motion-reduce:hover:translate-y-0"
          pendingLabel="Opening Google…"
        >
          <GoogleLogo className="size-5 transition-transform duration-300 ease-brand group-hover/btn:scale-110 motion-reduce:group-hover/btn:scale-100" />
          Continue with Google
        </SubmitButton>
      </form>
      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
