import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { PLATFORM_LABELS } from "@/lib/social";
import { formatSLE } from "@/lib/money";
import { getCachedPublicProfile, getCachedRecentSupporters, getCachedShop, getCachedSupportSettings } from "@/server/queries/public-profile";
import type { PublicProfileDTO } from "@/server/services/CreatorService";
import { SupportWidget } from "./support-widget";

type Props = PageProps<"/[handle]">;

async function load(params: Props["params"]) {
  const { handle } = await params;
  if (handleFormatError(normalizeHandle(handle))) return { kind: "not_found" as const };
  return getCachedPublicProfile(handle);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await load(params);
  if (result.kind !== "found") return { title: "Page not found", robots: { index: false } };
  const { displayName, bio, handle, avatarUrl } = result.profile;
  const description = bio ? bio.slice(0, 160) : `Support ${displayName} on DuMeGud.`;
  return {
    title: displayName,
    description,
    alternates: { canonical: `/${handle}` },
    openGraph: { type: "profile", title: `${displayName} on DuMeGud`, description, images: avatarUrl ? [avatarUrl] : [] },
  };
}

export default function CreatorPage({ params }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          DuMeGud
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-16 pt-4 sm:px-6">
        <Suspense fallback={<ProfileSkeleton />}>
          <CreatorProfile params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function CreatorProfile({ params }: Pick<Props, "params">) {
  const result = await load(params);
  switch (result.kind) {
    case "not_found":
      notFound();
    case "redirect":
      permanentRedirect(`/${result.handle}`);
    case "unavailable":
      return (
        <div className="flex flex-col gap-2 py-12 text-center">
          <h1 className="text-2xl font-bold">This page is unavailable</h1>
          <p className="text-muted">It can&apos;t be viewed right now.</p>
        </div>
      );
    case "found": {
      const [settings, supporters, shop] = await Promise.all([
        getCachedSupportSettings(),
        getCachedRecentSupporters(result.profile.id),
        getCachedShop(result.profile.id, result.profile.ownerId),
      ]);
      return <Profile profile={result.profile} settings={settings} supporters={supporters} shop={shop} />;
    }
  }
}

function Profile({
  profile,
  settings,
  supporters,
  shop,
}: {
  profile: PublicProfileDTO;
  settings: Awaited<ReturnType<typeof getCachedSupportSettings>>;
  supporters: string[];
  shop: Awaited<ReturnType<typeof getCachedShop>>;
}) {
  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar profile={profile} />
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">{profile.displayName}</h1>
          <p className="text-muted">
            @{profile.handle}
            {profile.categoryName ? ` · ${profile.categoryName}` : null}
          </p>
        </div>
      </div>

      {profile.bio ? <p className="whitespace-pre-line text-lg leading-7">{profile.bio}</p> : null}

      {profile.links.length ? (
        <ul className="flex flex-col gap-2">
          {profile.links.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="flex min-h-12 items-center justify-center rounded-brand border border-border px-4 font-semibold hover:bg-surface"
              >
                {PLATFORM_LABELS[link.platform]}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Published pages always have an active wallet (publish checklist); start() re-checks. */}
      <SupportWidget
        handle={profile.handle}
        displayName={profile.displayName}
        suggestedAmountsMinor={profile.suggestedAmountsMinor}
        supportMessageEnabled={profile.supportMessageEnabled}
        settings={settings}
      />

      {shop.length ? (
        <section aria-labelledby="shop-heading" className="flex flex-col gap-3">
          <h2 id="shop-heading" className="text-xl font-bold">
            Shop
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shop.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.id}`}
                  className="flex h-full flex-col gap-1 rounded-brand border border-border p-4 hover:bg-surface"
                >
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-muted">{formatSLE(p.priceMinor)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-center text-sm">
        <Link href={`/report?type=creator&id=${profile.id}`} className="text-muted underline underline-offset-4" prefetch={false}>
          Report this page
        </Link>
      </p>

      {supporters.length ? (
        <section aria-labelledby="supporters-heading" className="flex flex-col gap-2">
          <h2 id="supporters-heading" className="text-lg font-bold">
            Recent supporters
          </h2>
          <ul className="flex flex-wrap gap-2">
            {supporters.map((name, i) => (
              <li key={`${name}-${i}`} className="rounded-brand bg-surface px-3 py-1">
                {name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function Avatar({ profile }: { profile: PublicProfileDTO }) {
  if (!profile.avatarUrl) {
    return (
      <div
        aria-hidden="true"
        className="flex size-28 items-center justify-center rounded-full bg-surface text-4xl font-bold text-muted"
      >
        {profile.displayName.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <Image
      src={profile.avatarUrl}
      alt=""
      width={112}
      height={112}
      // Already a 400px WebP from our pipeline; skip the optimizer round-trip.
      unoptimized
      fetchPriority="high"
      className="size-28 rounded-full object-cover"
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3" aria-busy="true" aria-label="Loading">
      <div className="size-28 rounded-full bg-surface" />
      <div className="h-8 w-48 rounded-brand bg-surface" />
    </div>
  );
}
