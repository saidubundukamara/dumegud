import Image from "next/image";
import Link from "next/link";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { PhoneFrame } from "@/components/marketing/PhoneMockup";
import { ShareLink } from "@/components/ui/ShareLink";
import { formatSLECompact } from "@/lib/money";
import { getCachedPublicProfile } from "@/server/queries/public-profile";
import type { OwnProfileDTO } from "@/server/services/CreatorService";
import { PublishControls } from "./forms";

const LINK_ROW = "inline-flex min-h-11 items-center gap-1.5 font-semibold text-white/85 transition-colors duration-200 hover:text-white";

/**
 * Home's hero once the page is live: the link to share on the left, and on the right a small phone
 * showing the creator's real page, so they see what their fans see. Brand maroon with the orange
 * glow, the same language as the Wallet balance card.
 */
export async function LivePageCard({ profile, host, base, shareTitle }: { profile: OwnProfileDTO; host: string; base: string; shareTitle?: string }) {
  const cached = await getCachedPublicProfile(profile.handle);
  const page = cached.kind === "found" ? cached.profile : null;
  const preview = {
    displayName: page?.displayName ?? profile.displayName,
    handle: profile.handle,
    bio: page?.bio ?? profile.bio,
    avatarUrl: page?.avatarUrl ?? profile.avatarUrl,
    categoryName: page?.categoryName ?? null,
    amounts: page?.suggestedAmountsMinor ?? [2000, 5000, 10000],
  };

  return (
    <section
      aria-labelledby="live-page-heading"
      className="relative isolate grid overflow-hidden rounded-brand-xl bg-primary text-primary-foreground shadow-lift md:grid-cols-[1fr_auto]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 -top-56 -z-10 size-[28rem] rounded-full md:-right-24 md:-top-32 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-secondary)_60%,transparent),transparent)]"
      />

      <div className="flex min-w-0 flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          {/* Phones don't get the preview, so the creator's face carries it here. */}
          <span className="md:hidden">
            <MiniAvatar name={preview.displayName} url={preview.avatarUrl} />
          </span>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            <span aria-hidden="true" className="size-2 rounded-full bg-success-surface ring-4 ring-success-surface/25" />
            Your page is live
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <h2 id="live-page-heading" className="font-display tracking-tight">
            <Link href={`/${profile.handle}`} className="group flex flex-col leading-tight" aria-label={`Open my page, ${host}/${profile.handle}`}>
              <span className="text-lg font-semibold text-white/70">{host}/</span>
              <span className="break-all text-3xl font-bold underline-offset-[6px] group-hover:underline sm:text-4xl">{profile.handle}</span>
            </Link>
          </h2>
          <p className="max-w-[40ch] text-white/85">Post it on TikTok, Instagram or WhatsApp. Fans tap it to send you a gift.</p>
        </div>

        <ShareLink url={`${base}/${profile.handle}`} title={shareTitle} variant="accent" />

        <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-white/15 pt-3">
          <Link href="/dashboard/profile" className={LINK_ROW}>
            <PencilSimpleIcon aria-hidden="true" weight="bold" className="size-4" />
            Edit page
          </Link>
          <PublishControls published canPublish tone="onBrand" />
        </div>
      </div>

      {/* What fans see, drawn from the real page data. Decorative: the link above is the action. */}
      <div aria-hidden="true" className="hidden h-[23rem] w-[16rem] self-end overflow-hidden md:block">
        <div className="origin-top translate-y-6 rotate-3 scale-[0.82] transition-transform duration-200 motion-safe:hover:rotate-0">
          <PhoneFrame>
            <OwnPagePreview {...preview} />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}

function MiniAvatar({ name, url }: { name: string; url: string | null }) {
  const ring = "size-11 rounded-full ring-2 ring-white/40";
  return url ? (
    <Image src={url} alt="" width={44} height={44} unoptimized className={`object-cover ${ring}`} />
  ) : (
    <span aria-hidden="true" className={`flex items-center justify-center bg-secondary font-display text-lg font-bold text-secondary-foreground ${ring}`}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A miniature of the creator's public page (same layout as /[handle]). */
function OwnPagePreview(p: { displayName: string; handle: string; bio: string; avatarUrl: string | null; categoryName: string | null; amounts: number[] }) {
  const firstName = p.displayName.trim().split(/\s+/)[0] || p.displayName;
  const amounts = p.amounts.slice(0, 3);
  const picked = amounts[Math.min(1, amounts.length - 1)];
  return (
    <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-12 text-center text-text">
      {p.avatarUrl ? (
        <Image src={p.avatarUrl} alt="" width={80} height={80} unoptimized className="size-20 rounded-full object-cover ring-4 ring-surface" />
      ) : (
        <span className="flex size-20 items-center justify-center rounded-full bg-primary font-display text-3xl font-bold text-white ring-4 ring-surface">
          {p.displayName.trim().slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="flex flex-col">
        <span className="font-display text-xl font-bold tracking-tight">{p.displayName}</span>
        <span className="text-xs text-muted">
          @{p.handle}
          {p.categoryName ? `, ${p.categoryName.toLowerCase()}` : ""}
        </span>
      </div>
      {p.bio ? <span className="line-clamp-3 text-[0.8rem] leading-snug text-muted">{p.bio}</span> : null}
      <div className="mt-1 w-full rounded-[1.4rem] bg-surface p-3 text-left shadow-soft ring-1 ring-border">
        <span className="mb-2 block text-xs font-semibold">Send {firstName} a gift</span>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {amounts.map((a) => (
            <span
              key={a}
              className={`rounded-full py-2 text-sm font-semibold ${a === picked ? "bg-primary-soft text-primary-pressed ring-2 ring-primary" : "bg-surface-muted"}`}
            >
              {formatSLECompact(a)}
            </span>
          ))}
        </div>
        <span className="mt-2.5 flex h-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
          Send {formatSLECompact(picked)}
        </span>
      </div>
    </div>
  );
}
