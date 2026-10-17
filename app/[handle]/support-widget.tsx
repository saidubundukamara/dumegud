"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { ShoutoutFields } from "@/components/shoutout/shoutout-fields";
import { CaretDownIcon, LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { quoteSplit } from "@/lib/fees";
import { initialFormState } from "@/lib/form-state";
import { formatSLE, MINOR_PER_MAJOR, parseMajorToMinor } from "@/lib/money";
import { defaultShoutoutPlatform, isShoutoutPlatform, type ShoutoutPlatform } from "@/lib/shoutout";
import { detectSource, type TrafficSource } from "@/lib/traffic-source";
import { startSupport } from "./actions";

type Props = {
  handle: string;
  displayName: string;
  suggestedAmountsMinor: number[];
  supportMessageEnabled: boolean;
  settings: { minMinor: number; maxMinor: number; platformFeeBps: number; monimeBpsEstimate: number };
};

const toMajorText = (minor: number) =>
  minor % MINOR_PER_MAJOR === 0 ? String(minor / MINOR_PER_MAJOR) : (minor / MINOR_PER_MAJOR).toFixed(2);

const noSubscribe = () => () => {};

/**
 * Read in the browser so the public page stays cached. In-app browsers rarely send a referrer,
 * so the creator's `?via=` share link is the main signal.
 */
function detectBrowserSource(): TrafficSource {
  return detectSource({
    via: new URLSearchParams(window.location.search).get("via"),
    userAgent: navigator.userAgent,
    referrer: document.referrer,
    ownHost: window.location.hostname,
  });
}

/** The page's only client island. The quote uses the same fee math the server settles with. */
export function SupportWidget({ handle: creatorHandle, displayName, suggestedAmountsMinor, supportMessageEnabled, settings }: Props) {
  const [state, action] = useActionState(startSupport, initialFormState);
  const suggested = suggestedAmountsMinor.filter((a) => a >= settings.minMinor && a <= settings.maxMinor);
  const [amount, setAmount] = useState(state.values?.amount ?? (suggested[1] ? toMajorText(suggested[1]) : ""));
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState(state.values?.supporterName ?? "");
  const source = useSyncExternalStore(noSubscribe, detectBrowserSource, () => null);
  const [pickedPlatform, setPlatform] = useState<ShoutoutPlatform | null>(null);
  const echoedPlatform = state.values?.socialPlatform;
  const platform = pickedPlatform ?? (isShoutoutPlatform(echoedPlatform) ? echoedPlatform : defaultShoutoutPlatform(source));
  const [handle, setHandle] = useState(state.values?.socialHandle ?? "");
  // Consent follows the username until the supporter decides for themselves.
  const [consent, setConsent] = useState<boolean | null>(null);
  const consentChecked = consent ?? handle.trim() !== "";

  const minor = parseMajorToMinor(amount);
  const inRange = minor !== null && minor >= settings.minMinor && minor <= settings.maxMinor;
  // Optional extras stay folded away unless the visitor opens them or the server sent one back.
  const errs = state.fieldErrors ?? {};
  const [moreOpen, setMoreOpen] = useState(
    Boolean(
      errs.supporterName || errs.socialHandle || errs.socialPlatform || errs.message ||
        state.values?.supporterName || state.values?.socialHandle || state.values?.message,
    ),
  );
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  const quote = inRange ? quoteSplit(minor, settings.monimeBpsEstimate, settings.platformFeeBps) : null;

  return (
    <Card inner="p-5 sm:p-7">
      <section id="support" className="flex scroll-mt-6 flex-col gap-5" aria-labelledby="support-heading">
        <div className="flex flex-col gap-1">
          <h2 id="support-heading" className="text-2xl font-bold">
            Support {firstName}
          </h2>
          <p className="text-muted">Send a gift to say thank you. Pick an amount.</p>
        </div>
        <form action={action} className="flex flex-col gap-5" noValidate>
          <input type="hidden" name="handle" value={creatorHandle} />
          {source ? <input type="hidden" name="source" value={source} /> : null}
          {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}

          {suggested.length ? (
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="sr-only">Suggested amounts</legend>
              {suggested.map((a) => {
                const text = toMajorText(a);
                const selected = amount === text;
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAmount(text)}
                    className={`min-h-14 rounded-brand px-2 text-lg font-bold transition-[background-color,box-shadow,transform,color] duration-300 ease-spring active:scale-95 ${
                      selected
                        ? "scale-[1.03] bg-primary-soft text-primary-pressed ring-2 ring-primary"
                        : "bg-surface-muted text-text ring-1 ring-transparent hover:ring-border-strong"
                    }`}
                  >
                    Le {text}
                  </button>
                );
              })}
            </fieldset>
          ) : null}

          <div className="relative">
            <Field
              label={suggested.length ? "Or type your own amount" : "Amount"}
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint={`From ${formatSLE(settings.minMinor)} to ${formatSLE(settings.maxMinor)}.`}
              errors={state.fieldErrors?.amount}
              className="[&_input]:!min-h-14 [&_input]:!pl-12 [&_input]:text-xl [&_input]:font-bold"
            />
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-[2.74rem] text-xl font-bold text-muted">
              Le
            </span>
          </div>

          <div className="flex flex-col gap-4 rounded-brand bg-surface-muted/60 p-1">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="support-extras"
              onClick={() => setMoreOpen((o) => !o)}
              className="flex min-h-12 items-center justify-between gap-3 rounded-[calc(var(--radius-brand)-0.25rem)] px-4 text-left font-semibold"
            >
              Add your name or a message
              <CaretDownIcon
                aria-hidden="true"
                weight="bold"
                className={`size-4 transition-transform duration-300 ease-brand ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
            {/* Kept in the form while folded so nothing typed is ever lost. */}
            <div id="support-extras" hidden={!moreOpen} className="flex animate-rise flex-col gap-4 px-3 pb-3">
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="isAnonymous"
                  className="size-5 accent-primary"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                Keep my name private
              </label>
              {!anonymous ? (
                <Field
                  label="Your name"
                  name="supporterName"
                  maxLength={60}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  errors={state.fieldErrors?.supporterName}
                />
              ) : null}

              {supportMessageEnabled ? (
                <TextAreaField
                  label="Message"
                  name="message"
                  maxLength={280}
                  rows={3}
                  defaultValue={state.values?.message}
                  hint={`Only ${firstName} can see it.`}
                  errors={state.fieldErrors?.message}
                />
              ) : null}

              {!anonymous ? (
                <fieldset className="flex flex-col gap-3 rounded-brand bg-surface p-4 shadow-soft">
                  <legend className="sr-only">Shout-out</legend>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold">Want a shout-out?</p>
                    <p className="text-sm text-muted">
                      {firstName} thanks fans in posts. Add your username so they can tag you.
                    </p>
                  </div>
                  <ShoutoutFields
                    platform={platform}
                    onPlatformChange={setPlatform}
                    handle={handle}
                    onHandleChange={setHandle}
                    errors={{ socialPlatform: state.fieldErrors?.socialPlatform, socialHandle: state.fieldErrors?.socialHandle }}
                  />
                  {handle.trim() || name.trim() ? (
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="shoutoutConsent"
                        className="mt-0.5 size-5 shrink-0 accent-primary"
                        checked={consentChecked}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        {firstName} can mention me in thank-you posts
                        <span className="block text-sm text-muted">Untick to stay out of posts. Your gift still counts.</span>
                      </span>
                    </label>
                  ) : null}
                </fieldset>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="min-h-6 text-center text-sm text-muted" aria-live="polite">
              {quote ? (
                <>
                  {firstName} gets about <strong className="text-text">{formatSLE(quote.creatorNetMinor)}</strong> after fees.
                </>
              ) : null}
            </p>
            <SubmitButton disabled={!inRange} size="lg" pendingLabel="Opening checkout…" className="w-full">
              {quote ? `Send ${formatSLE(quote.grossMinor)}` : "Pick an amount"}
            </SubmitButton>
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-muted">
              <LockKeyIcon aria-hidden="true" className="size-4 shrink-0" />
              Pay with Orange Money or AfriMoney. Safe checkout by Monime.
            </p>
          </div>
        </form>
      </section>
    </Card>
  );
}
