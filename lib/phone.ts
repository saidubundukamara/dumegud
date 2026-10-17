// Sierra Leone mobile numbers (implementation.md Phase 6). Isomorphic. Monime wants
// `232XXXXXXXX` (no "+"); people type "076 123 456", "+232 76 123456" or "76123456".

export type Operator = "m17" | "m18"; // Orange Money, AfriMoney

export const OPERATOR_LABELS: Record<Operator, string> = { m17: "Orange Money", m18: "AfriMoney" };

/** `232` + 8 digits, or null if it isn't a Sierra Leone mobile number. */
export function normalizeSlPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("232")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^\d{8}$/.test(digits) ? `232${digits}` : null;
}

/** Operator from the two-digit prefix, using the admin-managed prefix table. */
export function detectOperator(msisdn: string, prefixes: Record<Operator, string[]>): Operator | null {
  const prefix = msisdn.slice(3, 5);
  for (const op of ["m17", "m18"] as const) if (prefixes[op]?.includes(prefix)) return op;
  return null;
}

/** "+232 ••• •• 456" for display. */
export function maskMsisdn(last3: string): string {
  return `+232 ••• •• ${last3}`;
}

/** Fee charged on top of a payout, floored. */
export function payoutFee(amountMinor: number, payoutFeeBps: number): number {
  return Math.floor((amountMinor * payoutFeeBps) / 10_000);
}

/** Largest amount whose amount + fee fits in `available` (§3.3), verified against the floor. */
export function maxWithdrawableMinor(availableMinor: number, payoutFeeBps: number): number {
  if (availableMinor <= 0) return 0;
  let amount = Math.floor((availableMinor * 10_000) / (10_000 + payoutFeeBps));
  while (amount > 0 && amount + payoutFee(amount, payoutFeeBps) > availableMinor) amount--;
  while (amount + 1 + payoutFee(amount + 1, payoutFeeBps) <= availableMinor) amount++;
  return amount;
}
