import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { GoogleOption } from "../google-button";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "email-verified": "Your email is confirmed. Sign in to continue.",
  "password-reset": "Your password has been updated. Sign in with your new password.",
  "password-changed": "Your password has been changed and every device was signed out. Sign in again.",
  "signed-out-everywhere": "You've been signed out on every device.",
};

// Auth.js redirects here with ?error=<type> when an OAuth sign-in fails.
const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "This email already has a DuMeGud password. Sign in with your email and password instead.",
  AccessDenied: "We couldn't sign you in with Google. Make sure your Google email is verified, or contact support.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="text-muted">Welcome back to DuMeGud.</p>
      </div>
      <Suspense fallback={null}>
        <Notices searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <GoogleOption />
      </Suspense>
      <LoginForm />
      <p className="text-center text-muted">
        New to DuMeGud?{" "}
        <Link href="/register" className="font-semibold text-text underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}

async function Notices({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const notice = NOTICES[one(params.notice) ?? ""];
  const errorType = one(params.error);
  const error = errorType ? (ERRORS[errorType] ?? "We couldn't sign you in. Please try again.") : undefined;
  return (
    <>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </>
  );
}
