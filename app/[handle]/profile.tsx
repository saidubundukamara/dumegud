import { DownloadSimpleIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SOCIAL_ICONS } from "@/components/public/social-icons";
import { StickyAction } from "@/components/public/StickyAction";
import { formatSLE } from "@/lib/money";
import { SHOUTOUT_PLATFORM_LABELS } from "@/lib/shoutout";
import { PLATFORM_LABELS } from "@/lib/social";
import type { getCachedShop, getCachedSupportSettings } from "@/server/queries/public-profile";
import type { PublicSupporterDTO } from "@/server/services/ContributionService";
import type { PublicProfileDTO } from "@/server/services/CreatorService";
import { SupportWidget } from "./support-widget";

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

export function Profile({
  profile,
  settings,
  supporters,
  shop,
}: {
  profile: PublicProfileDTO;
  settings: Awaited<ReturnType<typeof getCachedSupportSettings>>;
  supporters: PublicSupporterDTO[];
  shop: Awaited<ReturnType<typeof getCachedShop>>;
}) {
  return (
    <article className="flex flex-col gap-8">
      <header className="flex animate-rise flex-col items-center gap-4 text-center">
        <Avatar profile={profile} />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-title">{profile.displayName}</h1>
          <p className="flex flex-wrap items-center justify-center gap-2 text-muted">
            <span>@{profile.handle}</span>
            {profile.categoryName ? (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-sm font-semibold text-text shadow-soft ring-1 ring-border">
                {profile.categoryName}
              </span>
            ) : null}
          </p>
        </div>
        {profile.bio ? <p className="max-w-md whitespace-pre-line text-lg leading-relaxed">{profile.bio}</p> : null}
        {profile.links.length ? (
          <ul className="flex flex-wrap justify-center gap-2">
            {profile.links.map((link) => {
              const Icon = SOCIAL_ICONS[link.platform];
              return (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-semibold shadow-soft ring-1 ring-border transition-[box-shadow,transform] duration-300 ease-brand hover:ring-border-strong active:scale-[0.97]"
                  >
                    <Icon aria-hidden="true" weight="fill" className="size-5" />
                    {PLATFORM_LABELS[link.platform]}
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </header>

      {/* Published pages always have an active wallet (publish checklist); start() re-checks. */}
      <div className="animate-rise [animation-delay:120ms]">
        <SupportWidget
          handle={profile.handle}
          displayName={profile.displayName}
          suggestedAmountsMinor={profile.suggestedAmountsMinor}
          supportMessageEnabled={profile.supportMessageEnabled}
          settings={settings}
        />
      </div>
      <StickyAction targetId="support" label={`Support ${firstName(profile.displayName)}`} />

      {shop.length ? (
        <section aria-labelledby="shop-heading" className="flex flex-col gap-4">
          <h2 id="shop-heading" className="text-2xl font-bold">
            Shop
          </h2>
          <Stagger as="ul" className="grid grid-cols-2 gap-3">
            {shop.map((p) => (
              <StaggerItem as="li" key={p.id}>
                <Link
                  href={`/p/${p.id}`}
                  className="group flex h-full flex-col gap-3 rounded-brand-lg bg-surface p-4 shadow-soft ring-1 ring-border transition-[box-shadow,transform] duration-300 ease-brand hover:shadow-lift active:scale-[0.98]"
                >
                  <span className="flex size-11 items-center justify-center rounded-brand bg-primary-soft text-primary transition-transform duration-300 ease-brand group-hover:-translate-y-0.5">
                    <DownloadSimpleIcon aria-hidden="true" weight="duotone" className="size-6" />
                  </span>
                  <span className="line-clamp-2 font-semibold leading-snug">{p.title}</span>
                  <span className="mt-auto w-fit rounded-full bg-surface-muted px-2.5 py-0.5 text-sm font-semibold">
                    {formatSLE(p.priceMinor)}
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      ) : null}

      {supporters.length ? (
        <section aria-labelledby="supporters-heading" className="flex flex-col gap-4">
          <h2 id="supporters-heading" className="text-2xl font-bold">
            Recent supporters
          </h2>
          <Stagger as="ul" className="flex flex-wrap gap-2" gap={0.04}>
            {supporters.map((s, i) => {
              const label = s.handle && s.platform ? `@${s.handle}` : s.name || "Someone";
              return (
                <StaggerItem
                  as="li"
                  key={i}
                  className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3.5 shadow-soft ring-1 ring-border"
                >
                  <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-pressed">
                    {label.replace(/^@/, "").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium">{label}</span>
                  {s.handle && s.platform ? <span className="text-sm text-muted">{SHOUTOUT_PLATFORM_LABELS[s.platform]}</span> : null}
                </StaggerItem>
              );
            })}
          </Stagger>
        </section>
      ) : null}

      <footer className="flex flex-col items-center gap-3 pt-6 text-center text-sm text-muted">
        <Link href="/register" className="inline-flex min-h-11 items-center font-semibold text-text hover:text-primary">
          Want a page like this? Make one for free
        </Link>
        <Link
          href={`/report?type=creator&id=${profile.id}`}
          className="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:underline"
          prefetch={false}
        >
          <FlagIcon aria-hidden="true" className="size-4" />
          Report this page
        </Link>
      </footer>
    </article>
  );
}

function Avatar({ profile }: { profile: PublicProfileDTO }) {
  const ring = "size-28 rounded-full shadow-lift ring-4 ring-surface sm:size-32";
  if (!profile.avatarUrl) {
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center bg-primary font-display text-5xl font-bold text-white ${ring}`}
      >
        {profile.displayName.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={profile.avatarUrl}
      alt=""
      width={128}
      height={128}
      // Already a 400px WebP from our pipeline; skip the optimizer round-trip.
      unoptimized
      fetchPriority="high"
      className={`object-cover ${ring}`}
    />
  );
}

