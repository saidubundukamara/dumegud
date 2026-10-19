import { connection } from "next/server";
import { CountUp } from "@/components/reactbits/CountUp";
import { quoteSplit } from "@/lib/fees";
import { formatSLE } from "@/lib/money";
import { logger } from "@/server/lib/logger";
import { getCachedSupportSettings } from "@/server/queries/public-profile";

const EXAMPLE_MINOR = 100_00; // Le 100

function percent(bps: number) {
  const p = bps / 100;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

async function loadFees() {
  await connection(); // fees live in the database; read at request time (cached), never at build
  try {
    return await getCachedSupportSettings();
  } catch (error) {
    logger.warn("marketing fee example unavailable", { error: String(error) });
    return null;
  }
}

/** "A fan sends Le 100, you get Le X", from the live platform settings and the real fee math. */
export async function FeeExample({ tone = "light" }: { tone?: "light" | "dark" }) {
  const settings = await loadFees();
  const dim = tone === "dark" ? "text-white/65" : "text-muted";
  if (!settings) {
    return <p className={dim}>You always see the fee before anyone pays. Nothing is hidden.</p>;
  }
  const split = quoteSplit(EXAMPLE_MINOR, settings.monimeBpsEstimate, settings.platformFeeBps);
  const rows = [
    { label: "A fan sends you", value: formatSLE(split.grossMinor) },
    { label: "Mobile money fee (about)", value: `− ${formatSLE(split.monimeFeeMinor)}` },
    { label: `DuMeGud fee (${percent(settings.platformFeeBps)})`, value: `− ${formatSLE(split.platformFeeMinor)}` },
  ];
  return (
    <dl className="flex flex-col">
      {rows.map((r) => (
        <div key={r.label} className={`flex items-baseline justify-between gap-4 border-b py-3 ${tone === "dark" ? "border-white/10" : "border-border"}`}>
          <dt className={dim}>{r.label}</dt>
          <dd className="font-semibold">{r.value}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 pt-4">
        <dt className="font-semibold">You get</dt>
        <dd className="font-display text-4xl font-bold tracking-tight text-primary tabular-nums">
          <CountUp to={split.creatorNetMinor} from={split.grossMinor} format="sle" />
        </dd>
      </div>
    </dl>
  );
}

export function FeeExampleSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-shimmer h-11 rounded-brand-sm opacity-60" />
      ))}
      <div className="animate-shimmer ml-auto h-12 w-40 rounded-brand-sm opacity-60" />
    </div>
  );
}
