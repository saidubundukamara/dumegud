"use client";

import { ArrowCounterClockwiseIcon, CheckIcon, DeviceMobileIcon, QuestionIcon } from "@phosphor-icons/react/dist/ssr";
import { m } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { StatusBlock } from "@/components/checkout/StatusScreen";
import { Confetti } from "@/components/motion/Confetti";
import { buttonClasses } from "@/components/ui/button-classes";

type Status = "processing" | "succeeded" | "failed" | "unknown";

const POLL_MS = 2_000;
const GIVE_UP_MS = 3 * 60_000;

type Props = {
  back: { href: string; label: string };
  /** Words for the retry button when a payment fails. */
  retryLabel?: string;
  /** Heading shown once the payment is verified. */
  successTitle: string;
  /**
   * Shown under the heading once the payment is verified. Receives the library link for
   * purchases, and whether this browser may still add a shout-out username for support (both
   * from the claim cookies).
   */
  success: (libraryUrl: string | null, extra: { paymentId: string; canAddShoutout: boolean }) => ReactNode;
};

/**
 * Polls the payment status. Success appears only once the server has a verified payment
 * (webhook, or Monime itself when polled): arriving on this URL proves nothing.
 */
export function PaymentStatus({ back, retryLabel = "Try again", successTitle, success }: Props) {
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

  const backLink = (variant: "primary" | "secondary") => (
    <Link href={back.href as Route} className={buttonClasses(variant, "w-full", "lg")}>
      {variant === "primary" ? retryLabel : back.label}
    </Link>
  );

  if (status === "succeeded") {
    return (
      <div role="status" className="flex flex-col gap-6">
        <StatusBlock
          tone="success"
          title={successTitle}
          decoration={<Confetti />}
          icon={
            <m.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.1 }}
            >
              <CheckIcon weight="bold" className="size-9" />
            </m.span>
          }
        >
          {success(libraryUrl, { paymentId: paymentId!, canAddShoutout })}
        </StatusBlock>
        {backLink("secondary")}
      </div>
    );
  }
  if (status === "failed") {
    // Calm, not red: nothing bad happened to their money.
    return (
      <div role="alert" className="flex flex-col gap-6">
        <StatusBlock icon={<ArrowCounterClockwiseIcon weight="bold" className="size-8" />} title="Your payment didn't go through">
          <p>No money was taken. You can try again.</p>
        </StatusBlock>
        {backLink("primary")}
      </div>
    );
  }
  if (status === "unknown") {
    return (
      <div className="flex flex-col gap-6">
        <StatusBlock icon={<QuestionIcon weight="bold" className="size-8" />} title="We couldn't find this payment">
          <p>Check that you opened the full link.</p>
        </StatusBlock>
        {backLink("secondary")}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <StatusBlock pulse tone="primary" icon={<DeviceMobileIcon weight="duotone" className="size-9" />} title="Confirming your payment…">
        <p>
          {slow
            ? "This is taking longer than usual. If money left your account, it will be confirmed soon. You can close this page."
            : "Check your phone and approve the payment if you haven't yet. This page updates by itself."}
        </p>
      </StatusBlock>
      {slow ? backLink("secondary") : null}
    </div>
  );
}
