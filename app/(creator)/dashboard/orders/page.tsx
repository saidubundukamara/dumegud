import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { PageSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <>
      <h1 className="text-title">Orders</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Orders />
      </Suspense>
    </>
  );
}

async function Orders() {
  const { actor } = await verifySession();
  const orders = await services.orders.listForCreator(actor);
  if (!orders.length) return <p className="text-muted">No orders yet.</p>;
  const label = { paid: "Paid", processing: "Processing", unpaid: "Not paid" } as const;
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => (
        <li key={o.orderRef} className="flex flex-col gap-2 rounded-brand-lg bg-surface shadow-soft ring-1 ring-border p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold">{o.productTitle}</span>
            <span className="text-sm">{label[o.status]}</span>
          </div>
          <p className="text-sm text-muted">
            #{o.orderRef}
            {o.buyerName ? ` · ${o.buyerName}` : ""} · {o.at.toISOString().slice(0, 10)}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Price</dt>
              <dd>{o.priceLabel}</dd>
            </div>
            <div>
              <dt className="text-muted">Payment fee</dt>
              <dd>{o.monimeFeeMinor === null ? "pending" : `${formatSLE(o.monimeFeeMinor)}${o.feeEstimated ? " (est.)" : ""}`}</dd>
            </div>
            <div>
              <dt className="text-muted">DuMeGud fee</dt>
              <dd>{o.platformFeeMinor === null ? "pending" : formatSLE(o.platformFeeMinor)}</dd>
            </div>
            <div>
              <dt className="text-muted">You receive</dt>
              <dd className="font-semibold">{o.creatorNetMinor === null ? "pending" : formatSLE(o.creatorNetMinor)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
