import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { verifySession } from "@/server/dal/session";
import { leaveAgeGate } from "../../actions";
import { AgeForm } from "./age-form";

export const metadata: Metadata = { title: "Your date of birth", robots: { index: false, follow: false } };

// Google sign-ups land here (verifySession sends them) until they give a date of birth.
export default function AgeGatePage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const session = await verifySession({ allowMissingDateOfBirth: true });
  if (!session.needsDateOfBirth) redirect("/dashboard");
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-title">When were you born?</h1>
        <p className="text-muted">
          Google doesn&apos;t tell us your age, and DuMeGud pages are for people 18 and over.
        </p>
      </div>
      <AgeForm />
      <form action={leaveAgeGate} className="flex justify-center">
        <SubmitButton variant="ghost" pendingLabel="Signing out…">
          Use a different account
        </SubmitButton>
      </form>
    </>
  );
}
