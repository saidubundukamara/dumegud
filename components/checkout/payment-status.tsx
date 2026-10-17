"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Status = "processing" | "succeeded" | "failed" | "unknown";

const POLL_MS = 2_000;
const GIVE_UP_MS = 3 * 60_000;

type Props = {
  back: { href: string; label: string };
  /**
   * Shown once the payment is verified. Receives the library link for purchases, and whether this
   * browser may still add a shout-out username for support (both from the claim cookies).
   */
  success: (libraryUrl: string | null, extra: { paymentId: string; canAddShoutout: boolean }) => ReactNode;
};

/**
 * Polls the payment status. Success appears only once the server has a verified payment
 * (webhook, or Monime itself when polled): arriving on this URL proves nothing.
 */
export function PaymentStatus({ back, success }: Props) {
  const paymentId = useSearchParams().get("p");
  const [status, setStatus] = useState<Status>(paymentId ? "processing" : "unknown");
  const [libraryUrl, setLibraryUrl] = useState<string | null>(null);
  const [canAddShoutout, setCanAddShoutout] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!paymentId) return;
    let stopped = false;
    const started = Date.now();
    async function poll() {
      while (!stopped) {
        try {
          const res = await fetch(`/api/payments/${encodeURIComponent(paymentId!)}/status`, { cache: "no-store" });
          if (res.status === 404) return setStatus("unknown");
          if (res.ok) {
            const body = (await res.json()) as { status: Status; libraryUrl?: string; canAddShoutout?: boolean };
            if (body.status !== "processing") {
              setLibraryUrl(body.libraryUrl ?? null);
              setCanAddShoutout(body.canAddShoutout === true);
              return setStatus(body.status);
            }
          }
        } catch {
          // offline for a moment: keep trying
        }
        if (Date.now() - started > GIVE_UP_MS) return setSlow(true);
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }
    void poll();
    return () => {
      stopped = true;
    };
  }, [paymentId]);

  const backLink = (
    <Link href={back.href as Route} className="font-semibold underline underline-offset-4">
      {back.label}
    </Link>
  );

  if (status === "succeeded") {
    return (
      <div role="status" className="flex flex-col gap-3">
        {success(libraryUrl, { paymentId: paymentId!, canAddShoutout })}
        {backLink}
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div role="alert" className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Your payment didn&apos;t go through</h1>
        <p>No money was taken. You can try again.</p>
        {backLink}
      </div>
    );
  }
  if (status === "unknown") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">We couldn&apos;t find this payment</h1>
        {backLink}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold tracking-tight">Confirming your payment…</h1>
      <p className="text-muted">
        {slow
          ? "This is taking longer than usual. If money left your account, it will be confirmed shortly. You can close this page."
          : "Approve the payment on your phone if you haven't yet. This page updates by itself."}
      </p>
      {slow ? backLink : null}
    </div>
  );
}
