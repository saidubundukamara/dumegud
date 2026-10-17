import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { getCachedPublicProfile, getCachedRecentSupporters, getCachedShop, getCachedSupportSettings } from "@/server/queries/public-profile";
import { PageGlow, PublicHeader } from "@/components/public/PublicHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Profile } from "./profile";

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
    <div className="relative flex flex-1 flex-col">
      <PageGlow />
      <PublicHeader />
      <main id="main" tabIndex={-1} className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-28 pt-8 sm:px-6 md:pb-16">
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
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <h1 className="text-title">This page is unavailable</h1>
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

function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="size-28 !rounded-full sm:size-32" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-6 h-96 w-full !rounded-brand-xl" />
    </div>
  );
}
