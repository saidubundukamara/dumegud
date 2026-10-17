import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";

export const metadata: Metadata = { title: "Transactions", robots: { index: false } };

const STATUSES = ["created", "pending", "succeeded", "failed", "canceled", "expired", "reversed", "under_review"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function TransactionsPage({ searchParams }: PageProps<"/admin/transactions">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
      <form className="flex flex-wrap gap-2 text-sm">
        <select name="status" aria-label="Status" className="min-h-10 rounded-brand border border-border bg-background px-3">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="kind" aria-label="Kind" className="min-h-10 rounded-brand border border-border bg-background px-3">
          <option value="">Any kind</option>
          <option value="contribution">Contribution</option>
          <option value="order">Order</option>
        </select>
        <input name="creator" aria-label="Creator user id" placeholder="Creator user id" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <input name="from" type="date" aria-label="From" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <input name="to" type="date" aria-label="To" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <button className="min-h-10 rounded-brand border border-border px-4 font-semibold">Filter</button>
      </form>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: Pick<PageProps<"/admin/transactions">, "searchParams">) {
  const { actor } = await requireRole("staff", "super_admin");
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const date = (v: unknown) => (str(v) && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T00:00:00Z`) : undefined);
  const status = str(sp.status);
  const rows = await services.admin.listPayments(actor, {
    status: STATUSES.includes(status as (typeof STATUSES)[number]) ? (status as (typeof STATUSES)[number]) : undefined,
    kind: sp.kind === "contribution" || sp.kind === "order" ? sp.kind : undefined,
    creatorId: str(sp.creator) && UUID.test(String(sp.creator)) ? String(sp.creator) : undefined,
    from: date(sp.from),
    to: date(sp.to),
  });
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((p) => (
        <li key={p.id}>
          <Link href={`/admin/transactions/${p.id}`} className="flex flex-wrap justify-between gap-2 rounded-brand border border-border p-3 hover:bg-surface">
            <span>
              {p.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {p.kind} · {formatSLE(p.grossMinor)}
            </span>
            <span>
              {p.status} · transfer {p.transferStatus}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
