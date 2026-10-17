import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusPage } from "@/components/checkout/StatusScreen";
import { ReportForm } from "./report-form";

export const metadata: Metadata = { title: "Report", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ReportPage({ searchParams }: PageProps<"/report">) {
  return (
    <StatusPage align="top">
      <div className="flex flex-col gap-2">
        <h1 className="text-title">Report a problem</h1>
        <p className="text-muted">Reports are confidential. We review every one.</p>
      </div>
      <Suspense fallback={null}>
        <Target searchParams={searchParams} />
      </Suspense>
    </StatusPage>
  );
}

async function Target({ searchParams }: Pick<PageProps<"/report">, "searchParams">) {
  const { type, id } = await searchParams;
  if ((type !== "creator" && type !== "product") || typeof id !== "string" || !UUID.test(id)) notFound();
  return <ReportForm targetType={type} targetId={id} />;
}
