"use client";

import { useState } from "react";
import { quoteSplit } from "@/lib/fees";
import { formatSLE, formatSLECompact, parseMajorToMinor } from "@/lib/money";

type Settings = { minMinor: number; maxMinor: number; platformFeeBps: number; monimeBpsEstimate: number };

const PRESETS = [2000, 5000, 10000, 50000];

function percent(bps: number) {
  const p = bps / 100;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

/** "If a fan sends Le X, you get Le Y", with the same fee math the server settles with. */
export function FeeCalculator({ settings }: { settings: Settings }) {
  const [amount, setAmount] = useState("100");
  const minor = parseMajorToMinor(amount);
  const inRange = minor !== null && minor >= settings.minMinor && minor <= settings.maxMinor;
  const split = inRange ? quoteSplit(minor, settings.monimeBpsEstimate, settings.platformFeeBps) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label htmlFor="fee-amount" className="font-medium">
          If a fan sends you
        </label>
        <div className="flex items-center gap-2 rounded-2xl bg-surface-muted px-4 ring-1 ring-control-border focus-within:bg-surface focus-within:ring-2 focus-within:ring-focus">
          <span className="text-2xl font-semibold text-muted">Le</span>
          <input
            id="fee-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-describedby="fee-range"
            className="min-h-16 w-full bg-transparent text-3xl font-semibold tracking-[-0.03em] tabular-nums outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p / 100))}
              aria-pressed={minor === p}
              className="min-h-11 rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-border transition-colors hover:ring-border-strong aria-pressed:bg-primary-soft aria-pressed:text-primary aria-pressed:ring-primary"
            >
              {formatSLECompact(p)}
            </button>
          ))}
        </div>
        <p id="fee-range" className="text-sm text-muted">
          Gifts can be from {formatSLECompact(settings.minMinor)} to {formatSLECompact(settings.maxMinor)}.
        </p>
      </div>

      <dl aria-live="polite" className="flex flex-col">
        {split ? (
          <>
            <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
              <dt className="text-muted">Mobile money fee (about)</dt>
              <dd className="font-semibold tabular-nums">− {formatSLE(split.monimeFeeMinor)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-border py-3">
              <dt className="text-muted">DuMeGud fee ({percent(settings.platformFeeBps)})</dt>
              <dd className="font-semibold tabular-nums">− {formatSLE(split.platformFeeMinor)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 pt-4">
              <dt className="font-semibold">You get</dt>
              <dd className="text-4xl font-semibold tracking-[-0.04em] text-primary tabular-nums">{formatSLE(split.creatorNetMinor)}</dd>
            </div>
          </>
        ) : (
          <p className="py-3 text-muted">Enter an amount in that range to see what you get.</p>
        )}
      </dl>
    </div>
  );
}
