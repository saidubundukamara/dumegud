"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { quoteSplit } from "@/lib/fees";
import { formatSLECompact, parseMajorToMinor } from "@/lib/money";

export type PricingSettings = { feeBps: number; monimeBpsEstimate: number; minMinor: number; maxMinor: number };

/** Price input with a live take-home estimate, from the same fee math settlement uses. */
export function PriceField({ defaultValue, errors, pricing }: { defaultValue: string; errors?: string[]; pricing: PricingSettings }) {
  const [price, setPrice] = useState(defaultValue);
  const minor = parseMajorToMinor(price);
  const inRange = minor !== null && minor >= pricing.minMinor && minor <= pricing.maxMinor;
  const quote = inRange ? quoteSplit(minor, pricing.monimeBpsEstimate, pricing.feeBps) : null;

  return (
    <Field
      label="Price (Le)"
      name="price"
      inputMode="decimal"
      autoComplete="off"
      required
      value={price}
      onChange={(e) => setPrice(e.target.value)}
      errors={errors}
      hint={
        <span aria-live="polite">
          {quote ? (
            <>
              You get about <span className="font-semibold text-text tabular-nums">{formatSLECompact(quote.creatorNetMinor)}</span> per sale, after
              fees.
            </>
          ) : (
            <>
              Between {formatSLECompact(pricing.minMinor)} and {formatSLECompact(pricing.maxMinor)}. Buyers pay this; fees come out of it.
            </>
          )}
        </span>
      }
    />
  );
}
