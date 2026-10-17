import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/server/dal/session";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import { AvatarUploader } from "./avatar-uploader";
import { ProfileForm } from "./profile-form";
import { PageSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Your page" };

export default function ProfilePage() {
  return (
    <>
      <h1 className="text-title">Your page</h1>
      <Suspense fallback={<PageSkeleton />}>
        <ProfileEditor />
      </Suspense>
    </>
  );
}

async function ProfileEditor() {
  const { actor } = await verifySession();
  const [profile, categories, account] = await Promise.all([
    services.creators.getOwnProfile(actor),
    services.creators.listCategories(),
    services.auth.getAccount(actor),
  ]);
  const appHost = new URL(getEnv().APP_BASE_URL).host;

  return (
    <>
      {profile && services.avatars ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Photo</h2>
          <AvatarUploader avatarUrl={profile.avatarUrl} displayName={profile.displayName} />
        </section>
      ) : null}
      <ProfileForm
        isNew={!profile}
        categories={categories}
        appHost={appHost}
        handleLockedUntil={profile?.handleLockedUntil ? profile.handleLockedUntil.toISOString().slice(0, 10) : null}
        initial={{
          handle: profile?.handle ?? "",
          displayName: profile?.displayName ?? account?.name ?? "",
          bio: profile?.bio ?? "",
          categoryId: profile?.categoryId ?? "",
          supportMessageEnabled: profile?.supportMessageEnabled ?? true,
          links: profile?.links ?? [],
        }}
      />
    </>
  );
}
