// Inbound fee waterfall (implementation.md §3.2). Isomorphic: the server uses it to settle and
// the support widget uses it for the quote, so both always agree. Integer minor units only;
// every fee is floored per payment (never floor a sum).
//
//   gross        what the supporter pays (the listed amount)
//   − monimeFee  reported by Monime (fees[] summed), else an estimate
//   = arrived    what lands in the platform account
//   − platformFee = floor(arrived × platformFeeBps / 10 000)
//   = creatorNet  transferred to the creator's wallet

import { assertMinor, bpsOf, type Minor } from "./money";

export type Split = {
  grossMinor: Minor;
  monimeFeeMinor: Minor;
  arrivedMinor: Minor;
  platformFeeMinor: Minor;
  creatorNetMinor: Minor;
};

/** Split a payment given the Monime fee that was actually taken (or the estimate). */
export function computeSplit(grossMinor: Minor, monimeFeeMinor: Minor, platformFeeBps: number): Split {
  assertMinor(grossMinor, "gross");
  assertMinor(monimeFeeMinor, "monimeFee");
  if (grossMinor <= 0) throw new RangeError("gross must be positive");
  if (monimeFeeMinor < 0 || monimeFeeMinor > grossMinor) throw new RangeError("monimeFee must be within [0, gross]");
  const arrivedMinor = grossMinor - monimeFeeMinor;
  const platformFeeMinor = bpsOf(arrivedMinor, platformFeeBps);
  return { grossMinor, monimeFeeMinor, arrivedMinor, platformFeeMinor, creatorNetMinor: arrivedMinor - platformFeeMinor };
}

/** Monime fee estimate used before (or instead of) the reported fee. */
export function estimateMonimeFee(grossMinor: Minor, monimeBpsEstimate: number): Minor {
  return bpsOf(grossMinor, monimeBpsEstimate);
}

/** The pre-checkout quote: "You pay Le X. Creator receives ≈ Le Y after fees." */
export function quoteSplit(grossMinor: Minor, monimeBpsEstimate: number, platformFeeBps: number): Split {
  return computeSplit(grossMinor, estimateMonimeFee(grossMinor, monimeBpsEstimate), platformFeeBps);
}
