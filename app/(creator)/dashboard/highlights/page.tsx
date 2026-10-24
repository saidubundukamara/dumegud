import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  CalendarCheckIcon,
  CalendarDotsIcon,
  CoinsIcon,
  ShoppingBagIcon,
  SparkleIcon,
  TrophyIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { CountUp } from "@/components/motion/CountUp";
import { Card, Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/dates";
import { isMilestoneKey, isMoneyMilestone, milestoneCaption, MILESTONES, type MilestoneKey, type MilestoneMetric } from "@/lib/milestones";
import { formatMonth, formatMonthYear, isMonthKey, recapCaption, type RecapStats } from "@/lib/recap";
import { TRAFFIC_SOURCE_LABELS } from "@/lib/traffic-source";
import { verifySession } from "@/server/dal/session";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import type { MilestoneDTO, MilestoneOverviewDTO } from "@/server/services/MilestoneService";
import type { RecapDTO } from "@/server/services/RecapService";
import { ShareStudio } from "./share-studio";

export const metadata: Metadata = { title: "Highlights" };

const METRIC_ICONS: Record<MilestoneMetric, typeof UsersThreeIcon> = {
  supporters: UsersThreeIcon,
  receivedNetMinor: CoinsIcon,
  productsSold: ShoppingBagIcon,
  daysOnDuMeGud: CalendarCheckIcon,
};

export default function HighlightsPage({ searchParams }: PageProps<"/dashboard/highlights">) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Highlights</h1>
        <p className="text-muted">Your month and your milestones, made into cards you can post.</p>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Highlights searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Highlights({ searchParams }: Pick<PageProps<"/dashboard/highlights">, "searchParams">) {
  const { actor } = await verifySession();
  const [recaps, milestones, profile, query] = await Promise.all([
    services.recaps.list(actor),
    services.milestones.overview(actor),
    services.creators.getOwnProfile(actor),
    searchParams,
  ]);
  const pageUrl = `${new URL(getEnv().APP_BASE_URL).host}/${profile?.handle ?? ""}`;
  const wanted = typeof query.month === "string" && isMonthKey(query.month) ? query.month : null;
  const recap = recaps.find((r) => r.month === wanted) ?? recaps[0] ?? null;
  const wantedKey = typeof query.milestone === "string" && isMilestoneKey(query.milestone) ? query.milestone : null;
  const milestone = milestones.reached.find((m) => m.key === wantedKey) ?? milestones.reached[0] ?? null;

  return (
    <>
      {recaps.length > 1 ? <MonthPicker recaps={recaps} current={recap?.month ?? null} /> : null}

      {recap ? (
        <RecapSection recap={recap} pageUrl={pageUrl} />
      ) : (
        <EmptyState icon={CalendarDotsIcon} title="Your first recap comes on the 1st">
          After a month with gifts or sales, we add up who supported you and make you a card to share.
        </EmptyState>
      )}

      <MilestonesSection overview={milestones} selected={milestone} pageUrl={pageUrl} />
    </>
  );
}

function RecapSection({ recap, pageUrl }: { recap: RecapDTO; pageUrl: string }) {
  const s = recap.stats;
  const month = formatMonth(recap.month);
  return (
    <Card as="section" inner="flex flex-col gap-6 p-5 sm:p-7" id="recap">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Your {formatMonthYear(recap.month)}</h2>
        {s.bestMonth ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">
            <TrophyIcon aria-hidden="true" weight="fill" className="size-4" />
            Your best month yet
          </span>
        ) : null}
      </div>

      <RecapBento stats={s} />

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold">Share your {month}</h3>
          <p className="text-muted">Thank everyone at once, and remind new fans where to find you.</p>
        </div>
        <ShareStudio
          imagePath={`/api/recaps/image?month=${recap.month}`}
          fileName={`dumegud-${recap.month}`}
          caption={recapCaption(s, { showAmounts: false, pageUrl })}
          captionWithAmounts={s.receivedNetMinor > 0 ? recapCaption(s, { showAmounts: true, pageUrl }) : undefined}
          alt={`Your ${month} on DuMeGud, as a card to share`}
        />
      </div>
    </Card>
  );
}

/** The month at a glance. Every tile is real data; a zero never gets a tile. */
function RecapBento({ stats: s }: { stats: RecapStats }) {
  const tiles: { key: string; node: React.ReactNode; tone: string }[] = [];
  if (s.receivedNetMinor > 0) {
    tiles.push({
      key: "received",
      tone: "bg-secondary-soft",
      node: (
        <>
          <CountUp minor={s.receivedNetMinor} compact className="font-display text-3xl font-bold tracking-tight tabular-nums" />
          <span className="text-sm text-muted">reached you after fees</span>
        </>
      ),
    });
  }
  if (s.productsSold) {
    tiles.push({
      key: "sold",
      tone: "bg-surface-muted",
      node: (
        <>
          <span className="font-display text-3xl font-bold tracking-tight tabular-nums">{s.productsSold}</span>
          <span className="text-sm text-muted">{s.productsSold === 1 ? "product sold" : "products sold"}</span>
        </>
      ),
    });
  }
  if (s.topSource && s.topSource !== "direct" && s.topSource !== "other") {
    tiles.push({
      key: "source",
      tone: "bg-surface-muted",
      node: (
        <>
          <span className="font-display text-2xl font-bold tracking-tight">{TRAFFIC_SOURCE_LABELS[s.topSource]}</span>
          <span className="text-sm text-muted">brought you the most support</span>
        </>
      ),
    });
  }

  const lead = (
    <div className="relative isolate flex min-h-40 flex-1 flex-col justify-end gap-1 overflow-hidden rounded-brand-lg bg-primary p-5 text-primary-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 -z-10 size-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-secondary)_55%,transparent),transparent)]"
      />
      {s.supporters ? (
        <>
          <span className="font-display text-6xl font-bold leading-none tracking-tighter tabular-nums">{s.supporters}</span>
          <span className="text-lg font-semibold">{s.supporters === 1 ? "person supported you" : "people supported you"}</span>
          {s.newSupporters && s.newSupporters !== s.supporters ? (
            <span className="text-sm text-white/80">{s.newSupporters} of them for the first time</span>
          ) : s.supporters > 1 && s.newSupporters === s.supporters ? (
            <span className="text-sm text-white/80">All of them new to your page</span>
          ) : null}
        </>
      ) : (
        <>
          <span className="font-display text-6xl font-bold leading-none tracking-tighter tabular-nums">{s.productsSold}</span>
          <span className="text-lg font-semibold">{s.productsSold === 1 ? "sale this month" : "sales this month"}</span>
        </>
      )}
    </div>
  );

  // The lead tile is drawn from supporters, or from sales when nobody sent a gift.
  const rest = s.supporters ? tiles : tiles.filter((t) => t.key !== "sold");
  if (!rest.length) return <div className="flex">{lead}</div>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.15fr_1fr]">
      <div className="col-span-2 flex sm:col-span-1" style={{ gridRow: `span ${rest.length}` }}>
        {lead}
      </div>
      {rest.map((t, i) => (
        <div
          key={t.key}
          className={`flex flex-col justify-center gap-0.5 rounded-brand-lg p-4 ${t.tone} ${rest.length % 2 === 1 && i === rest.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}
        >
          {t.node}
        </div>
      ))}
    </div>
  );
}

function MonthPicker({ recaps, current }: { recaps: RecapDTO[]; current: string | null }) {
  return (
    <nav aria-label="Months" className="-mx-4 flex flex-col gap-2 px-4">
      <h2 className="sr-only">Months</h2>
      <ul className="no-scrollbar flex snap-x gap-2 overflow-x-auto pb-1">
        {recaps.map((r) => {
          const active = r.month === current;
          return (
            <li key={r.month} className="snap-start">
              <Link
                href={`/dashboard/highlights?month=${r.month}#recap` as Route}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 font-semibold transition-colors duration-200 ${
                  active ? "bg-text text-background" : "bg-surface ring-1 ring-border hover:bg-surface-muted"
                }`}
              >
                {formatMonthYear(r.month)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MilestonesSection({ overview, selected, pageUrl }: { overview: MilestoneOverviewDTO; selected: MilestoneDTO | null; pageUrl: string }) {
  const { reached, next } = overview;
  return (
    <section id="milestones" aria-labelledby="milestones-heading" className="flex scroll-mt-24 flex-col gap-4">
      <h2 id="milestones-heading" className="text-2xl font-bold tracking-tight">
        Milestones
      </h2>

      {next ? (
        <Panel className="flex items-center gap-4 p-5">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <SparkleIcon weight="duotone" className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p>
              <span className="font-semibold">Next: {MILESTONES[next.key].title}.</span> <span className="text-muted">{next.remaining}.</span>
            </p>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${Math.max(0.04, next.progress)})` }} />
            </div>
          </div>
        </Panel>
      ) : null}

      {selected ? (
        <Card inner="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-bold">{selected.you}</h3>
            <p className="text-muted">Reached on {formatDate(selected.achievedAt)}.</p>
          </div>
          <ShareStudio
            key={selected.key}
            imagePath={`/api/milestones/image?key=${selected.key}`}
            fileName={`dumegud-${selected.key.replace(/_/g, "-")}`}
            caption={milestoneCaption(selected.key, pageUrl, { showAmounts: false })}
            captionWithAmounts={isMoneyMilestone(selected.key) ? milestoneCaption(selected.key, pageUrl) : undefined}
            alt={`${MILESTONES[selected.key].title}, as a card to share`}
          />
        </Card>
      ) : (
        <EmptyState icon={TrophyIcon} title="Your first milestone is one gift away">
          When someone supports you for the first time, it shows up here with a card to share.
        </EmptyState>
      )}

      {reached.length > 1 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {reached.map((m) => (
            <MilestoneItem key={m.key} milestone={m} active={m.key === selected?.key} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MilestoneItem({ milestone: m, active }: { milestone: MilestoneDTO; active: boolean }) {
  const Icon = METRIC_ICONS[MILESTONES[m.key as MilestoneKey].metric];
  return (
    <li>
      <Link
        href={`/dashboard/highlights?milestone=${m.key}#milestones` as Route}
        aria-current={active ? "true" : undefined}
        className={`flex min-h-16 items-center gap-3 rounded-brand-lg bg-surface p-3 pr-4 shadow-soft ring-1 transition-[box-shadow,transform] duration-200 ease-brand active:scale-[0.99] ${
          active ? "ring-2 ring-primary" : "ring-border hover:shadow-lift"
        }`}
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-text">
          <Icon weight="duotone" className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 font-semibold">
            <span className="truncate">{m.title}</span>
            {m.isNew ? <span className="rounded-full bg-secondary px-2 py-px text-xs font-bold text-secondary-foreground">New</span> : null}
          </span>
          <time dateTime={m.achievedAt.toISOString()} className="text-sm text-muted">
            {formatDate(m.achievedAt)}
          </time>
        </span>
      </Link>
    </li>
  );
}
