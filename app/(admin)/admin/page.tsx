import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Admin />
      </Suspense>
    </main>
  );
}

async function Admin() {
  await requireRole("staff", "super_admin");
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
      <p className="text-muted">The admin dashboard arrives in Phase 8.</p>
    </>
  );
}
