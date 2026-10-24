import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { ReviewForms } from "./review-forms";

export const metadata: Metadata = { title: "Product review" };

export default function ProductReviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Products waiting for review</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Queue />
      </Suspense>
    </main>
  );
}

async function Queue() {
  const { actor } = await requireRole("staff", "super_admin");
  const pending = await services.productReview.listPending(actor);
  if (!pending.length) return <p className="text-muted">Nothing to review.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {pending.map((p) => (
        <li key={p.id} className="flex flex-col gap-3 rounded-brand border border-border p-4">
          <div>
            <h2 className="text-xl font-bold">{p.title}</h2>
            <p className="text-muted">{formatSLE(p.priceMinor)}</p>
          </div>
          {p.description ? <p className="whitespace-pre-line">{p.description}</p> : null}
          <ul className="text-sm">
            {p.files.map((f, i) => (
              <li key={i}>
                {f.filename} · {f.mimeType} · {Math.ceil(f.sizeBytes / 1024)} KB{f.sha256 ? ` · sha256 ${f.sha256.slice(0, 12)}…` : ""}
              </li>
            ))}
          </ul>
          <ReviewForms productId={p.id} version={p.version} />
        </li>
      ))}
    </ul>
  );
}
