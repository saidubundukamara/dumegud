import { formatSLECompact, MINOR_PER_MAJOR, type Minor } from "./money";

// Milestones a creator can reach. Pure and isomorphic: the server decides which are reached, the
// dashboard and the share card print the same words.

export type MilestoneMetric = "supporters" | "receivedNetMinor" | "productsSold" | "daysOnDuMeGud";

export type MilestoneTotals = Record<MilestoneMetric, number>;

type Definition = {
  metric: MilestoneMetric;
  threshold: number;
  /** Shown in lists: "First supporter". */
  title: string;
  /** The big line on the card, in the creator's voice. */
  headline: string;
  /** The same news told to the creator: dashboard and email. */
  you: string;
  /** The card's big figure and the words under it: "10" / "people support me". */
  figure: string;
  line: string;
};

const le = (major: number): Minor => major * MINOR_PER_MAJOR;

export const MILESTONES = {
  first_supporter: { metric: "supporters", threshold: 1, title: "First supporter", headline: "My first supporter", you: "You have your first supporter", figure: "1st", line: "supporter on DuMeGud" },
  supporters_10: { metric: "supporters", threshold: 10, title: "10 supporters", headline: "10 people support me", you: "10 people support you now", figure: "10", line: "people support me" },
  supporters_25: { metric: "supporters", threshold: 25, title: "25 supporters", headline: "25 people support me", you: "25 people support you now", figure: "25", line: "people support me" },
  supporters_50: { metric: "supporters", threshold: 50, title: "50 supporters", headline: "50 people support me", you: "50 people support you now", figure: "50", line: "people support me" },
  supporters_100: { metric: "supporters", threshold: 100, title: "100 supporters", headline: "100 people support me", you: "100 people support you now", figure: "100", line: "people support me" },
  received_100: { metric: "receivedNetMinor", threshold: le(100), title: "First Le 100", headline: "My first Le 100", you: "Your first Le 100 is in", figure: "Le 100", line: "from my fans so far" },
  received_1000: { metric: "receivedNetMinor", threshold: le(1_000), title: "Le 1,000 received", headline: "Le 1,000 from my fans", you: "Le 1,000 from your fans", figure: "Le 1,000", line: "from my fans so far" },
  received_10000: { metric: "receivedNetMinor", threshold: le(10_000), title: "Le 10,000 received", headline: "Le 10,000 from my fans", you: "Le 10,000 from your fans", figure: "Le 10,000", line: "from my fans so far" },
  first_sale: { metric: "productsSold", threshold: 1, title: "First sale", headline: "I made my first sale", you: "You made your first sale", figure: "1st", line: "sale on DuMeGud" },
  sales_10: { metric: "productsSold", threshold: 10, title: "10 sales", headline: "10 sales and counting", you: "10 sales and counting", figure: "10", line: "sales and counting" },
  sales_50: { metric: "productsSold", threshold: 50, title: "50 sales", headline: "50 sales and counting", you: "50 sales and counting", figure: "50", line: "sales and counting" },
  one_year: { metric: "daysOnDuMeGud", threshold: 365, title: "One year on DuMeGud", headline: "One year on DuMeGud", you: "One year on DuMeGud", figure: "1 year", line: "on DuMeGud" },
} as const satisfies Record<string, Definition>;

export type MilestoneKey = keyof typeof MILESTONES;

export const MILESTONE_KEYS = Object.keys(MILESTONES) as MilestoneKey[];

export function isMilestoneKey(value: unknown): value is MilestoneKey {
  return typeof value === "string" && Object.hasOwn(MILESTONES, value);
}

/** Money milestones say how much, so they're hidden from a card that hides amounts. */
export function isMoneyMilestone(key: MilestoneKey): boolean {
  return MILESTONES[key].metric === "receivedNetMinor";
}

/** Every milestone the totals have reached, in definition order. */
export function reachedMilestones(totals: MilestoneTotals): MilestoneKey[] {
  return MILESTONE_KEYS.filter((key) => totals[MILESTONES[key].metric] >= MILESTONES[key].threshold);
}

/**
 * The closest milestone not reached yet, with how far there is to go. Money milestones count in
 * minor units; `remaining` is already formatted for people.
 */
export function nextMilestone(totals: MilestoneTotals, reached: ReadonlySet<MilestoneKey>): { key: MilestoneKey; progress: number; remaining: string } | null {
  let best: { key: MilestoneKey; progress: number; remaining: string } | null = null;
  for (const key of MILESTONE_KEYS) {
    const m = MILESTONES[key];
    const have = totals[m.metric];
    if (reached.has(key) || m.metric === "daysOnDuMeGud" || have >= m.threshold) continue;
    const progress = Math.min(have / m.threshold, 0.99);
    if (best && best.progress >= progress) continue;
    best = { key, progress, remaining: remainingText(m.metric, m.threshold - have) };
  }
  return best;
}

function remainingText(metric: MilestoneMetric, left: number): string {
  switch (metric) {
    case "supporters":
      return left === 1 ? "1 more supporter" : `${left} more supporters`;
    case "productsSold":
      return left === 1 ? "1 more sale" : `${left} more sales`;
    case "receivedNetMinor":
      return `${formatSLECompact(left)} to go`;
    case "daysOnDuMeGud":
      return left === 1 ? "1 more day" : `${left} more days`;
  }
}

/** The caption to paste under the card. A money milestone only names the amount when asked. */
export function milestoneCaption(key: MilestoneKey, pageUrl: string, { showAmounts = true }: { showAmounts?: boolean } = {}): string {
  const news = isMoneyMilestone(key) && !showAmounts ? "My fans just helped me reach a new milestone on DuMeGud" : MILESTONES[key].headline;
  return `${news}! Thank you to everyone who got me here. Want to support me too? ${pageUrl}`;
}
