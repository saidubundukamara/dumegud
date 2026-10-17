import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-12 sm:px-6">
      <Link href="/" className="text-xl font-bold tracking-tight">
        DuMeGud
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Report a problem</h1>
        <p className="text-muted">Reports are confidential. We review every one.</p>
      </div>
      <Suspense fallback={null}>
        <Target searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Target({ searchParams }: Pick<PageProps<"/report">, "searchParams">) {
  const { type, id } = await searchParams;
  if ((type !== "creator" && type !== "product") || typeof id !== "string" || !UUID.test(id)) notFound();
  return <ReportForm targetType={type} targetId={id} />;
}
