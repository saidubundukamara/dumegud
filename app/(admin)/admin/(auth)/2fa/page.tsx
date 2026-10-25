import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { adminHref } from "@/lib/admin-host";
import { readPendingAdmin } from "@/server/dal/admin-session";
import { AdminCodeForm } from "@/app/(admin)/admin/auth-forms";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default function AdminTwoFactorPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <RequirePending />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Enter your code</h1>
        <p className="text-muted">Open your authenticator app and enter the 6-digit code for DuMeGud admin.</p>
      </div>
      <AdminCodeForm />
    </main>
  );
}

/** Straight back to the password step when it hasn't been passed (or timed out). */
async function RequirePending() {
  if (!(await readPendingAdmin("2fa"))) redirect(adminHref("/admin/login"));
  return null;
}
