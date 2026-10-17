"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import { quoteSplit } from "@/lib/fees";
import { initialFormState } from "@/lib/form-state";
import { formatSLE, MINOR_PER_MAJOR, parseMajorToMinor } from "@/lib/money";
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

/** The page's only client island. The quote uses the same fee math the server settles with. */
export function SupportWidget({ handle, displayName, suggestedAmountsMinor, supportMessageEnabled, settings }: Props) {
  const [state, action] = useActionState(startSupport, initialFormState);
  const suggested = suggestedAmountsMinor.filter((a) => a >= settings.minMinor && a <= settings.maxMinor);
  const [amount, setAmount] = useState(state.values?.amount ?? (suggested[1] ? toMajorText(suggested[1]) : ""));
  const [anonymous, setAnonymous] = useState(false);

  const minor = parseMajorToMinor(amount);
  const inRange = minor !== null && minor >= settings.minMinor && minor <= settings.maxMinor;
  const quote = inRange ? quoteSplit(minor, settings.monimeBpsEstimate, settings.platformFeeBps) : null;

  return (
    <section aria-labelledby="support-heading" className="flex flex-col gap-4 rounded-brand border border-border p-4 sm:p-6">
      <h2 id="support-heading" className="text-xl font-bold">
        Support {displayName}
      </h2>
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="handle" value={handle} />
        {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}

        {suggested.length ? (
          <fieldset className="flex flex-wrap gap-2">
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
                  className={`min-h-12 rounded-brand border px-4 font-semibold ${
                    selected ? "border-text bg-primary text-primary-foreground" : "border-border hover:bg-surface"
                  }`}
                >
                  {formatSLE(a)}
                </button>
              );
            })}
          </fieldset>
        ) : null}

        <Field
          label="Amount (Le)"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Between ${formatSLE(settings.minMinor)} and ${formatSLE(settings.maxMinor)}.`}
          errors={state.fieldErrors?.amount}
        />

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="isAnonymous"
            className="size-5"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          Support anonymously
        </label>
        {!anonymous ? (
          <Field
            label="Your name (optional)"
            name="supporterName"
            maxLength={60}
            autoComplete="name"
            defaultValue={state.values?.supporterName}
            errors={state.fieldErrors?.supporterName}
          />
        ) : null}
        {supportMessageEnabled ? (
          <TextAreaField
            label="Message (optional)"
            name="message"
            maxLength={280}
            rows={3}
            defaultValue={state.values?.message}
            hint={`Only ${displayName} sees it.`}
            errors={state.fieldErrors?.message}
          />
        ) : null}

        {quote ? (
          <p className="rounded-brand bg-surface px-4 py-3" aria-live="polite">
            You pay <strong>{formatSLE(quote.grossMinor)}</strong>. {displayName} receives about{" "}
            <strong>{formatSLE(quote.creatorNetMinor)}</strong> after fees.
          </p>
        ) : null}

        <SubmitButton disabled={!inRange} pendingLabel="Opening checkout…">
          {quote ? `Support with ${formatSLE(quote.grossMinor)}` : "Support"}
        </SubmitButton>
        <p className="text-sm text-muted">You&apos;ll pay with Orange Money or AfriMoney on Monime&apos;s secure checkout.</p>
      </form>
    </section>
  );
}
