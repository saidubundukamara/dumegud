import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { StatusBlock, StatusPage } from "@/components/checkout/StatusScreen";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = { title: "Payment cancelled", robots: { index: false } };

// Changes nothing (anyone can open this URL); Monime's cancel/expiry webhooks update the payment.
export default function PurchaseCancelPage({ params }: PageProps<"/p/[productId]/purchase/cancel">) {
  return (
    <StatusPage>
      <StatusBlock icon={<ArrowCounterClockwiseIcon weight="bold" className="size-8" />} title="Payment cancelled">
        <p>No money was taken. You can try again whenever you like.</p>
      </StatusBlock>
      <Suspense fallback={null}>
        <BackLink params={params} />
      </Suspense>
    </StatusPage>
  );
}

async function BackLink({ params }: Pick<PageProps<"/p/[productId]/purchase/cancel">, "params">) {
  const { productId } = await params;
  return (
    <Link href={`/p/${encodeURIComponent(productId)}`} className={buttonClasses("primary", "w-full", "lg")}>
      Try again
    </Link>
  );
}
