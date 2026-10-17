import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusPage } from "@/components/checkout/StatusScreen";
import { Alert } from "@/components/ui/Alert";
import { RecoverForm } from "./forms";

export const metadata: Metadata = { title: "Your downloads", robots: { index: false } };

const DOWNLOAD_ERRORS: Record<string, string> = {
  expired: "That download link expired (they last a minute). Open your library link again and press Download.",
  limit: "You've used all your downloads for this purchase.",
  unavailable: "That download isn't available any more.",
  invalid: "That download link isn't valid.",
};

export default function LibraryRecoveryPage({ searchParams }: PageProps<"/library">) {
  return (
    <StatusPage align="top">
      <Suspense fallback={null}>
        <DownloadError searchParams={searchParams} />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h1 className="text-title">Lost your download link?</h1>
        <p className="text-muted">Enter the email you used when buying and we&apos;ll send your links again.</p>
      </div>
      <RecoverForm />
    </StatusPage>
  );
}

async function DownloadError({ searchParams }: Pick<PageProps<"/library">, "searchParams">) {
  const { download } = await searchParams;
  const message = typeof download === "string" ? DOWNLOAD_ERRORS[download] : undefined;
  return message ? <Alert tone="danger">{message}</Alert> : null;
}
