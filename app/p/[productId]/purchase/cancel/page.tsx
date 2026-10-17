import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Payment cancelled", robots: { index: false } };

// Changes nothing (anyone can open this URL); Monime's cancel/expiry webhooks update the payment.
export default function PurchaseCancelPage({ params }: PageProps<"/p/[productId]/purchase/cancel">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Payment cancelled</h1>
      <p>No money was taken.</p>
      <Suspense fallback={null}>
        <BackLink params={params} />
      </Suspense>
    </main>
  );
}

async function BackLink({ params }: Pick<PageProps<"/p/[productId]/purchase/cancel">, "params">) {
  const { productId } = await params;
  return (
    <Link href={`/p/${encodeURIComponent(productId)}`} className="font-semibold underline underline-offset-4">
      Try again
    </Link>
  );
}
