import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";

export const metadata: Metadata = { title: "Creators", robots: { index: false } };

export default function CreatorsPage({ searchParams }: PageProps<"/admin/creators">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Creators</h1>
      <form className="flex flex-wrap gap-2" role="search">
        <input
          name="q"
          aria-label="Search by handle, email or user id"
          placeholder="Handle, email or user id"
          className="min-h-12 flex-1 rounded-brand border border-border bg-background px-3"
        />
        <button className="min-h-12 rounded-brand border border-border px-4 font-semibold">Search</button>
      </form>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/admin/creators">, "searchParams">) {
  const { actor } = await requireRole("staff", "super_admin");
  const { q } = await searchParams;
  const rows = await services.admin.searchCreators(actor, typeof q === "string" ? q : "");
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.userId}>
          <Link href={`/admin/creators/${r.userId}`} className="flex flex-wrap justify-between gap-2 rounded-brand border border-border p-3 hover:bg-surface">
            <span className="font-semibold">{r.handle ? `@${r.handle}` : r.email}</span>
            <span className="text-sm text-muted">
              {r.email} · {r.role} · {r.status}
              {r.profileStatus ? ` · page ${r.profileStatus}` : ""}
              {r.riskTier ? ` · risk ${r.riskTier}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
