import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { adminHref } from "@/lib/admin-host";
import { getAdminSession } from "@/server/dal/admin-session";
import { AdminLoginForm } from "@/app/(admin)/admin/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Admin sign-in</h1>
        <p className="text-muted">Staff only. You&apos;ll need your authenticator app too.</p>
      </div>
      <AdminLoginForm />
    </main>
  );
}

async function RedirectIfSignedIn() {
  if (await getAdminSession()) redirect(adminHref("/admin"));
  return null;
}
