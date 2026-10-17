import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusPage } from "@/components/checkout/StatusScreen";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { logger } from "@/server/lib/logger";
import { getCachedPublicProfile } from "@/server/queries/public-profile";
import { SupportStatus } from "./support-status";

export const metadata: Metadata = { title: "Confirming your payment", robots: { index: false } };

type Props = PageProps<"/[handle]/support/success">;

export default function SupportSuccessPage({ params }: Props) {
  return (
    <StatusPage>
      <Suspense fallback={<h1 className="text-title text-center">Confirming your payment…</h1>}>
        <WithCreatorName params={params} />
      </Suspense>
    </StatusPage>
  );
}

/** The thank-you shows the creator (name and photo), not just the handle. */
async function WithCreatorName({ params }: Pick<Props, "params">) {
  const { handle } = await params;
  let creator: { displayName: string; avatarUrl: string | null } | null = null;
  if (!handleFormatError(normalizeHandle(handle))) {
    try {
      const result = await getCachedPublicProfile(handle);
      if (result.kind === "found") creator = { displayName: result.profile.displayName, avatarUrl: result.profile.avatarUrl };
    } catch (error) {
      // The name is a nicety: the status poll below is what matters.
      logger.warn("support success: creator name unavailable", { error: String(error) });
    }
  }
  return <SupportStatus creator={creator} />;
}
