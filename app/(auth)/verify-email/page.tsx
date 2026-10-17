import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { VerifyEmailForm } from "../token-form";

export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" };

export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Confirm your email</h1>
        <p className="text-muted">One tap and you&apos;re set.</p>
      </div>
      <Suspense fallback={null}>
        <TokenGate searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TokenGate({ searchParams }: Pick<PageProps<"/verify-email">, "searchParams">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) {
    return (
      <Alert tone="danger">
        This link is incomplete. Open the link from your email again, or{" "}
        <Link href="/login" className="font-semibold underline underline-offset-4">
          sign in
        </Link>{" "}
        to request a new one.
      </Alert>
    );
  }
  return <VerifyEmailForm token={token} />;
}
