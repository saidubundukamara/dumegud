import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="action" placeholder="Action prefix (e.g. payout.)" aria-label="Action" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <input name="targetType" placeholder="Target type" aria-label="Target type" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <input name="targetId" placeholder="Target id" aria-label="Target id" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <input name="actorId" placeholder="Actor user id" aria-label="Actor id" className="min-h-10 rounded-brand border border-border bg-background px-3" />
        <button className="min-h-10 rounded-brand border border-border px-4 font-semibold">Filter</button>
      </form>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Entries searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Entries({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const { actor } = await requireRole("staff", "super_admin");
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined);
  const filter = {
    action: str(sp.action),
    targetType: str(sp.targetType),
    targetId: str(sp.targetId),
    actorId: str(sp.actorId) && UUID.test(String(sp.actorId)) ? String(sp.actorId) : undefined,
  };
  const rows = await services.admin.auditLog(actor, filter);
  const query = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])));
  return (
    <>
      {actor.role === "super_admin" ? (
        // A plain link: the export is a GET download handled by an authenticated route.
        <a href={`/api/admin/audit/export?${query}`} className="self-start font-semibold underline underline-offset-4">
          Export CSV (super admin, needs step-up, is itself audited)
        </a>
      ) : null}
      <ul className="flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="rounded-brand border border-border p-2">
            <span className="font-semibold">{r.action}</span> · {r.targetType} {r.targetId ?? ""} · by {r.actorRole ?? "system"} {r.actorId?.slice(0, 8) ?? ""} ·{" "}
            {r.createdAt.toISOString().slice(0, 19).replace("T", " ")}
            {r.before || r.after ? <pre className="mt-1 overflow-x-auto text-xs">{JSON.stringify({ before: r.before, after: r.after })}</pre> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
