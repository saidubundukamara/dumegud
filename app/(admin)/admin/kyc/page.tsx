import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { KycReviewForm } from "./review-form";

export const metadata: Metadata = { title: "KYC review", robots: { index: false } };

export default function KycReviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Identity verification queue</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Queue />
      </Suspense>
    </main>
  );
}

const DOC_LABELS = { id_front: "ID front", id_back: "ID back", selfie: "Selfie with ID" } as const;

async function Queue() {
  const { actor } = await requireRole("staff", "super_admin");
  const pending = await services.kyc.listPending(actor);
  if (!pending.length) return <p className="text-muted">Nothing to review.</p>;
  return (
    <ul className="flex flex-col gap-6">
      {pending.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 rounded-brand border border-border p-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Legal name</dt>
            <dd className="font-semibold">{s.legalName}</dd>
            <dt className="text-muted">Date of birth</dt>
            <dd>{s.dateOfBirth}</dd>
            <dt className="text-muted">ID type</dt>
            <dd>{s.idType}</dd>
            <dt className="text-muted">Submitted</dt>
            <dd>{s.submittedAt.toISOString().slice(0, 16).replace("T", " ")}</dd>
          </dl>
          <div className="grid gap-3 sm:grid-cols-3">
            {s.docs.map((doc) => (
              <figure key={doc} className="flex flex-col gap-1">
                {/* Streamed through the authenticated viewer route; not a public URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/kyc/${s.id}/${doc}`} alt={DOC_LABELS[doc]} className="w-full rounded border border-border" />
                <figcaption className="text-sm text-muted">{DOC_LABELS[doc]}</figcaption>
              </figure>
            ))}
          </div>
          <KycReviewForm submissionId={s.id} />
        </li>
      ))}
    </ul>
  );
}
