import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircleIcon, ClockIcon, ReceiptIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { StatusChip } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatDate } from "@/lib/dates";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";

export const metadata: Metadata = { title: "Orders" };

// Same vocabulary as Wallet: an icon and a word with every status.
const STATUS = {
  paid: { label: "Paid", tone: "success", Icon: CheckCircleIcon },
  processing: { label: "Processing", tone: "warning", Icon: ClockIcon },
  unpaid: { label: "Not paid", tone: "neutral", Icon: XCircleIcon },
} as const;

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
  if (!orders.length) {
    return (
      <EmptyState
        icon={ReceiptIcon}
        title="No orders yet"
        action={
          <Link href="/dashboard/products" className={buttonClasses("secondary")}>
            Go to your products
          </Link>
        }
      >
        When someone buys one of your products, the order shows up here.
      </EmptyState>
    );
  }
  const money = (minor: number | null, estimated = false) =>
    minor === null ? "Pending" : `${formatSLE(minor)}${estimated ? " (about)" : ""}`;
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => {
        const st = STATUS[o.status];
        return (
          <Panel as="li" key={o.orderRef} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex flex-col">
                <span className="font-semibold">{o.productTitle}</span>
                <span className="text-sm text-muted">
                  {o.buyerName ? `${o.buyerName}, ` : ""}
                  {formatDate(o.at)}
                </span>
              </span>
              <StatusChip tone={st.tone}>
                <st.Icon aria-hidden="true" weight="fill" className="size-4" />
                {st.label}
              </StatusChip>
            </div>
            {o.status === "paid" ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted">Price</dt>
                  <dd className="tabular-nums">{o.priceLabel}</dd>
                </div>
                <div>
                  <dt className="text-muted">Mobile money fee</dt>
                  <dd className="tabular-nums">{money(o.monimeFeeMinor, o.feeEstimated)}</dd>
                </div>
                <div>
                  <dt className="text-muted">DuMeGud fee</dt>
                  <dd className="tabular-nums">{money(o.platformFeeMinor)}</dd>
                </div>
                <div>
                  <dt className="text-muted">You receive</dt>
                  <dd className="font-semibold tabular-nums">{money(o.creatorNetMinor)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted">
                Price {o.priceLabel}.{" "}
                {o.status === "processing"
                  ? "You receive the money once the buyer's payment goes through."
                  : "The buyer didn't finish paying, so nothing was charged."}
              </p>
            )}
            <p className="text-xs text-muted">Order #{o.orderRef}</p>
          </Panel>
        );
      })}
    </ul>
  );
}
