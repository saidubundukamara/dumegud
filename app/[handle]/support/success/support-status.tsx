"use client";

import { useParams } from "next/navigation";
import { useActionState, useState } from "react";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { ShoutoutFields } from "@/components/shoutout/shoutout-fields";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { initialFormState } from "@/lib/form-state";
import { defaultShoutoutPlatform, isShoutoutPlatform, type ShoutoutPlatform } from "@/lib/shoutout";
import { detectSource } from "@/lib/traffic-source";
import { addShoutout } from "../../actions";

export function SupportStatus({ displayName }: { displayName: string | null }) {
  const { handle } = useParams<{ handle: string }>();
  const name = displayName?.trim().split(/\s+/)[0] || `@${handle}`;
  return (
    <PaymentStatus
      back={{ href: `/${handle}`, label: `Back to @${handle}` }}
      successTitle="Thank you!"
      success={(_libraryUrl, { paymentId, canAddShoutout }) => (
        <>
          <p>Your gift went through. {name} will love this.</p>
          {canAddShoutout ? <ShoutoutPrompt paymentId={paymentId} handle={handle} /> : null}
        </>
      )}
    />
  );
}

/** Shown only to the browser that paid, when it gave no username at checkout. */
function ShoutoutPrompt({ paymentId, handle }: { paymentId: string; handle: string }) {
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
          @{handle} thanks fans in posts. Add your username so they can tag you. Or skip it, that&apos;s fine too.
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
        <p className="text-sm text-muted">By adding it, you agree @{handle} can mention you in thank-you posts.</p>
        <SubmitButton pendingLabel="Saving…" className="w-full">
          Add me to the shout-out
        </SubmitButton>
      </form>
    </section>
  );
}
