import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { ResetPasswordForm } from "../token-form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
        <p className="text-muted">You&apos;ll be signed out on every device.</p>
      </div>
      <Suspense fallback={null}>
        <TokenGate searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TokenGate({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) {
    return (
      <Alert tone="danger">
        This link is incomplete.{" "}
        <Link href="/forgot-password" className="font-semibold underline underline-offset-4">
          Request a new reset link
        </Link>
        .
      </Alert>
    );
  }
  return <ResetPasswordForm token={token} />;
}
