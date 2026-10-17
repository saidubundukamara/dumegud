import { GoogleLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { isGoogleSignInEnabled } from "@/auth";
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
        <SubmitButton variant="secondary" className="w-full" pendingLabel="Opening Google…">
          <GoogleLogoIcon aria-hidden="true" weight="bold" className="size-5" />
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
