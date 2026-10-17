import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchaseStatus } from "./purchase-status";

export const metadata: Metadata = { title: "Confirming your payment", robots: { index: false } };

export default function PurchaseSuccessPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <Suspense fallback={<h1 className="text-3xl font-bold tracking-tight">Confirming your payment…</h1>}>
        <PurchaseStatus />
      </Suspense>
    </main>
  );
}
