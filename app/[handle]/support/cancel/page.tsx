import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { StatusBlock, StatusPage } from "@/components/checkout/StatusScreen";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = { title: "Payment cancelled", robots: { index: false } };

// Deliberately changes nothing: anyone can open this URL. Monime's checkout_session.cancelled
// or .expired webhook updates the payment.
export default function SupportCancelPage({ params }: PageProps<"/[handle]/support/cancel">) {
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

async function BackLink({ params }: Pick<PageProps<"/[handle]/support/cancel">, "params">) {
  const { handle } = await params;
  return (
    <Link href={`/${encodeURIComponent(handle)}`} className={buttonClasses("primary", "w-full", "lg")}>
      Try again
    </Link>
  );
}
