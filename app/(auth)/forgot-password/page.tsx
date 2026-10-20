import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h1 className="text-title">Reset your password</h1>
        <p className="text-muted">Enter your account email and we&apos;ll send you a reset link.</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-muted">
        <Link href="/login" className="font-semibold text-text underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
