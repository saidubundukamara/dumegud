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

export function SupportStatus() {
  const { handle } = useParams<{ handle: string }>();
  return (
    <PaymentStatus
      back={{ href: `/${handle}`, label: `Back to @${handle}` }}
      success={(_libraryUrl, { paymentId, canAddShoutout }) => (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Thank you!</h1>
          <p>Your support went through. It means a lot.</p>
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
    <section aria-labelledby="shoutout-heading" className="flex flex-col gap-3 rounded-brand bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 id="shoutout-heading" className="text-lg font-bold">
          Want a shout-out? 🎉
        </h2>
        <p className="text-sm text-muted">
          @{handle} thanks supporters in posts. Add your username and they can tag you. Skip it to stay off shout-outs.
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
        <SubmitButton pendingLabel="Saving…" className="self-start">
          Add me to the shout-out
        </SubmitButton>
      </form>
    </section>
  );
}
