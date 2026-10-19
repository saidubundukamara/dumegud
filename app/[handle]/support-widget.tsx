"use client";

import { useActionState, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { CaretDownIcon, LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { quoteSplit } from "@/lib/fees";
import { initialFormState } from "@/lib/form-state";
import { formatSLECompact, MINOR_PER_MAJOR, parseMajorToMinor } from "@/lib/money";
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
  // Shout-out usernames are asked for after payment (thank-you page); here only name consent.
  const [consent, setConsent] = useState(false);

  const minor = parseMajorToMinor(amount);
  const inRange = minor !== null && minor >= settings.minMinor && minor <= settings.maxMinor;
  // Too much is flagged while typing; too little only after leaving the field, so typing "100"
  // doesn't flash an error at "1".
  const [touched, setTouched] = useState(false);
  const tooHigh = minor !== null && minor > settings.maxMinor;
  const amountError = !amount.trim()
    ? null
    : minor === null
      ? touched
        ? "Type the amount in numbers, for example 50."
        : null
      : tooHigh
        ? `You can send up to ${formatSLECompact(settings.maxMinor)}. Please lower the amount.`
        : minor < settings.minMinor && touched
          ? `The smallest gift is ${formatSLECompact(settings.minMinor)}.`
          : null;
  // Optional extras stay folded away unless the visitor opens them or the server sent one back.
  const errs = state.fieldErrors ?? {};
  const [moreOpen, setMoreOpen] = useState(
    Boolean(
      errs.supporterName || errs.message || state.values?.supporterName || state.values?.message,
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
            <AmountPicker
              options={suggested.map(toMajorText)}
              value={amount}
              onChange={setAmount}
            />
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
              onBlur={() => setTouched(true)}
              hint={amountError ? undefined : `From ${formatSLECompact(settings.minMinor)} to ${formatSLECompact(settings.maxMinor)}.`}
              errors={amountError ? [amountError] : state.fieldErrors?.amount}
              className="[&_input]:!min-h-14 [&_input]:!pl-12 [&_input]:text-xl [&_input]:font-bold"
            />
            <span aria-hidden="true" className="pointer-events-none absolute left-4 top-[2.74rem] text-xl font-bold text-text">
              Le
            </span>
            {tooHigh ? (
              <button
                type="button"
                onClick={() => setAmount(toMajorText(settings.maxMinor))}
                className="mt-1 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              >
                Send {formatSLECompact(settings.maxMinor)} instead
              </button>
            ) : null}
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
              <label className="-mt-1 flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  name="isAnonymous"
                  className="size-5 accent-primary"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                Hide my name
              </label>

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

              {!anonymous && name.trim() ? (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="shoutoutConsent"
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    {firstName} can thank me by name in posts
                    <span className="block text-sm text-muted">You can add your TikTok or Instagram after paying.</span>
                  </span>
                </label>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="min-h-6 text-center text-sm text-muted" aria-live="polite">
              {quote ? (
                <>
                  {firstName} gets about <strong className="text-text">{formatSLECompact(quote.creatorNetMinor)}</strong> after fees.
                </>
              ) : null}
            </p>
            <SubmitButton disabled={!inRange} size="lg" pendingLabel="Opening checkout…" className="w-full">
              {quote
                ? `Send ${formatSLECompact(quote.grossMinor)}`
                : tooHigh
                  ? "Lower the amount to continue"
                  : "Pick an amount"}
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

/**
 * Preset amounts as a radio group (WAI-ARIA pattern): one tab stop, arrow keys move and select.
 * Typing a custom amount clears the selection.
 */
function AmountPicker({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.indexOf(value);
  const tabStop = selected >= 0 ? selected : 0;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Pick an amount" className="grid grid-cols-3 gap-2">
      {options.map((text, i) => {
        const checked = i === selected;
        return (
          <button
            key={text}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(text)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-14 rounded-brand px-2 text-lg font-bold transition-[background-color,box-shadow,transform,color] duration-300 ease-spring active:scale-95 ${
              checked
                ? "scale-[1.03] bg-primary-soft text-primary-pressed ring-2 ring-primary"
                : "bg-surface-muted text-text ring-1 ring-transparent hover:ring-border-strong"
            }`}
          >
            Le {text}
          </button>
        );
      })}
    </div>
  );
}
