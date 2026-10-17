import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <Link href="/" className="text-xl font-bold tracking-tight">
        DuMeGud
      </Link>
      <Suspense fallback={null}>
        <DownloadError searchParams={searchParams} />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Lost your download link?</h1>
        <p className="text-muted">Enter the email you used when buying and we&apos;ll send your links again.</p>
      </div>
      <RecoverForm />
    </main>
  );
}

async function DownloadError({ searchParams }: Pick<PageProps<"/library">, "searchParams">) {
  const { download } = await searchParams;
  const message = typeof download === "string" ? DOWNLOAD_ERRORS[download] : undefined;
  return message ? <Alert tone="danger">{message}</Alert> : null;
}
