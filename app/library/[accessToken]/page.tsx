import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { services } from "@/server/services";
import { DownloadButton } from "../forms";

// The URL itself is the credential: never indexed, never sent as a referrer.
export const metadata: Metadata = { title: "Your downloads", robots: { index: false }, referrer: "no-referrer" };

export default function LibraryPage({ params }: PageProps<"/library/[accessToken]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <Link href="/" className="text-xl font-bold tracking-tight">
        DuMeGud
      </Link>
      <Suspense fallback={<p className="text-muted">Loading your downloads…</p>}>
        <Library params={params} />
      </Suspense>
    </main>
  );
}

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function Library({ params }: Pick<PageProps<"/library/[accessToken]">, "params">) {
  const { accessToken } = await params;
  const library = await services.orders.getLibrary(accessToken);
  if (!library) notFound();

  const notices: Record<Exclude<typeof library.status, "active">, string> = {
    processing: "Your payment is still being confirmed. Refresh this page in a minute.",
    expired: "Your access to these downloads has ended.",
    revoked: "Access to these downloads has been withdrawn. Contact support if you think this is a mistake.",
    limit_reached: "You've used all your downloads for this purchase.",
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{library.productTitle}</h1>
        <p className="text-muted">Order #{library.orderRef}</p>
      </div>
      {library.status !== "active" ? <Alert tone="warning">{notices[library.status]}</Alert> : null}
      {library.status === "active" ? (
        <>
          <p>
            {library.downloadLimit - library.downloadsUsed} of {library.downloadLimit} downloads left
            {library.expiresAt ? `, until ${library.expiresAt.toISOString().slice(0, 10)}` : ""}.
          </p>
          <ul className="flex flex-col gap-4">
            {library.files.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 rounded-brand border border-border p-4">
                <span className="font-semibold">{f.filename}</span>
                <span className="text-sm text-muted">{size(f.sizeBytes)}</span>
                <DownloadButton accessToken={accessToken} assetId={f.id} label={f.filename} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="text-sm text-muted">Keep this page&apos;s link private: anyone with it can use your downloads.</p>
    </>
  );
}
