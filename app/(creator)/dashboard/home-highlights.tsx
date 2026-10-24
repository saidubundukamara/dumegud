import { CalendarDotsIcon, TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { Confetti } from "@/components/motion/Confetti";
import { Panel } from "@/components/ui/Card";
import { ShareLink } from "@/components/ui/ShareLink";
import { SubmitButton } from "@/components/ui/Button";
import { formatSLECompact } from "@/lib/money";
import { formatMonth } from "@/lib/recap";
import type { VerifiedSession } from "@/server/dal/session";
import { services } from "@/server/services";
import { dismissMilestone, dismissRecap, openMilestone, openRecap } from "./highlights/actions";

const DISMISS = "inline-flex min-h-11 items-center px-2 font-semibold text-muted transition-colors duration-200 hover:text-text";

/**
 * Home's good news, early in the month and after a milestone: one celebration at a time, newest
 * milestone first. Each card goes away once it's opened or dismissed.
 */
export async function HomeHighlights({ actor, pageUrl }: { actor: VerifiedSession["actor"]; pageUrl: string }) {
  const [milestone, recap] = await Promise.all([services.milestones.latestUnseen(actor), services.recaps.home(actor)]);

  if (milestone) {
    return (
      <section
        aria-labelledby="milestone-heading"
        className="relative isolate flex flex-col gap-4 overflow-hidden rounded-brand-xl bg-secondary-soft p-5 ring-1 ring-border sm:flex-row sm:items-center sm:p-6"
      >
        <span aria-hidden="true" className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-soft">
          <TrophyIcon weight="duotone" className="size-7" />
          {/* Bursts from the trophy, not over the words. */}
          <Confetti pieces={20} />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="milestone-heading" className="text-xl font-bold">
            {milestone.you}
          </h2>
          <p className="text-muted">We made you a card for it. Post it and let your fans celebrate with you.</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={openMilestone}>
            <input type="hidden" name="key" value={milestone.key} />
            <SubmitButton pendingLabel="Opening…">Get my card</SubmitButton>
          </form>
          <form action={dismissMilestone}>
            <button type="submit" className={DISMISS}>
              Not now
            </button>
          </form>
        </div>
      </section>
    );
  }

  if (recap?.kind === "recap") {
    const s = recap.recap.stats;
    const month = formatMonth(recap.recap.month);
    const summary = [
      s.supporters ? `${s.supporters} ${s.supporters === 1 ? "person" : "people"} supported you` : null,
      s.productsSold ? `${s.productsSold} ${s.productsSold === 1 ? "sale" : "sales"}` : null,
      s.receivedNetMinor > 0 ? `${formatSLECompact(s.receivedNetMinor)} received` : null,
    ].filter(Boolean);
    return (
      <section
        aria-labelledby="recap-heading"
        className="relative isolate flex flex-col gap-4 overflow-hidden rounded-brand-xl bg-primary p-5 text-primary-foreground shadow-lift sm:flex-row sm:items-center sm:p-6"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-secondary)_55%,transparent),transparent)]"
        />
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="recap-heading" className="text-xl font-bold">
            {s.bestMonth ? `${month} was your best month yet` : `Your ${month} recap is ready`}
          </h2>
          <p className="text-white/85">{summary.join(", ")}. Share the card to thank everyone.</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={openRecap}>
            <input type="hidden" name="recapId" value={recap.recap.id} />
            <input type="hidden" name="month" value={recap.recap.month} />
            <SubmitButton variant="accent" pendingLabel="Opening…">
              See my recap
            </SubmitButton>
          </form>
          <form action={dismissRecap}>
            <input type="hidden" name="recapId" value={recap.recap.id} />
            <button type="submit" className="inline-flex min-h-11 items-center px-2 font-semibold text-white/80 transition-colors duration-200 hover:text-white">
              Not now
            </button>
          </form>
        </div>
      </section>
    );
  }

  if (recap?.kind === "quiet") {
    return (
      <Panel as="section" className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
            <CalendarDotsIcon weight="duotone" className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">{formatMonth(recap.month)} was quiet</h2>
            <p className="text-muted">That happens. Posting your link again this week is the quickest way back.</p>
          </div>
        </div>
        <ShareLink url={pageUrl} />
      </Panel>
    );
  }

  return null;
}
