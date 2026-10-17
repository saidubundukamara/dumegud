"use client";

import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { m } from "motion/react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useActionState, useState } from "react";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { CountUp } from "@/components/motion/CountUp";
import { ShoutoutFields } from "@/components/shoutout/shoutout-fields";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { initialFormState } from "@/lib/form-state";
import { defaultShoutoutPlatform, isShoutoutPlatform, type ShoutoutPlatform } from "@/lib/shoutout";
import { detectSource } from "@/lib/traffic-source";
import { addShoutout } from "../../actions";

type Creator = { displayName: string; avatarUrl: string | null } | null;

export function SupportStatus({ creator }: { creator: Creator }) {
  const { handle } = useParams<{ handle: string }>();
  const name = creator?.displayName.trim().split(/\s+/)[0] || `@${handle}`;
  return (
    <PaymentStatus
      back={{ href: `/${handle}`, label: `Back to @${handle}` }}
      successTitle="Thank you!"
      successIcon={creator ? <CreatorBadge creator={creator} /> : undefined}
      success={(_libraryUrl, { paymentId, canAddShoutout, amountMinor }) => (
        <>
          <p>
            {amountMinor ? (
              <>
                You sent <CountUp compact minor={amountMinor} className="font-semibold text-text" /> to {name}.{" "}
              </>
            ) : (
              "Your gift went through. "
            )}
            {name} will love this.
          </p>
          {canAddShoutout ? <ShoutoutPrompt paymentId={paymentId} name={name} /> : null}
        </>
      )}
    />
  );
}

/** The creator's photo (or initial) with a green "done" badge. */
function CreatorBadge({ creator }: { creator: NonNullable<Creator> }) {
  return (
    <m.span
      className="relative block size-20"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 16 }}
    >
      {creator.avatarUrl ? (
        // Already a 400px WebP from our pipeline; skip the optimizer round-trip.
        <Image src={creator.avatarUrl} alt="" width={80} height={80} unoptimized className="size-20 rounded-full object-cover ring-4 ring-surface" />
      ) : (
        <span className="flex size-20 items-center justify-center rounded-full bg-primary font-display text-3xl font-bold text-white ring-4 ring-surface">
          {creator.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-success text-white ring-4 ring-background">
        <CheckIcon weight="bold" className="size-4" />
      </span>
    </m.span>
  );
}

/** Shown only to the browser that paid, when it gave no username at checkout. */
function ShoutoutPrompt({ paymentId, name }: { paymentId: string; name: string }) {
  const [state, action] = useActionState(addShoutout, initialFormState);
  const initial = state.values?.socialPlatform;
  const [platform, setPlatform] = useState<ShoutoutPlatform>(() =>
    isShoutoutPlatform(initial)
      ? initial
      : defaultShoutoutPlatform(typeof navigator === "undefined" ? null : detectSource({ userAgent: navigator.userAgent })),
  );
  const [username, setUsername] = useState(state.values?.socialHandle ?? "");

  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;

  return (
    <section
      aria-labelledby="shoutout-heading"
      className="flex w-full flex-col gap-4 rounded-brand-xl bg-surface p-5 text-left text-base text-text shadow-soft ring-1 ring-border"
    >
      <div className="flex flex-col gap-1">
        <h2 id="shoutout-heading" className="text-lg font-bold">
          Want a shout-out?
        </h2>
        <p className="text-sm text-muted">
          {name} thanks fans in posts. Add your username so they can tag you. Or skip it, that&apos;s fine too.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-3" noValidate>
        <input type="hidden" name="paymentId" value={paymentId} />
        {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <ShoutoutFields
          platform={platform}
          onPlatformChange={setPlatform}
          handle={username}
          onHandleChange={setUsername}
          errors={{ socialPlatform: state.fieldErrors?.socialPlatform, socialHandle: state.fieldErrors?.socialHandle }}
        />
        <p className="text-sm text-muted">By adding it, you agree {name} can mention you in thank-you posts.</p>
        <SubmitButton pendingLabel="Saving…" className="w-full">
          Add me to the shout-out
        </SubmitButton>
      </form>
    </section>
  );
}
