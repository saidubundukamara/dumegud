import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusPage } from "@/components/checkout/StatusScreen";
import { PurchaseStatus } from "./purchase-status";

export const metadata: Metadata = { title: "Confirming your payment", robots: { index: false } };

export default function PurchaseSuccessPage() {
  return (
    <StatusPage>
      <Suspense fallback={<h1 className="text-title text-center">Confirming your payment…</h1>}>
        <PurchaseStatus />
      </Suspense>
    </StatusPage>
  );
}
