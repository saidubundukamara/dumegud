import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Payment cancelled", robots: { index: false } };

// Deliberately changes nothing: anyone can open this URL. Monime's checkout_session.cancelled
// or .expired webhook updates the payment.
export default function SupportCancelPage({ params }: PageProps<"/[handle]/support/cancel">) {
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

async function BackLink({ params }: Pick<PageProps<"/[handle]/support/cancel">, "params">) {
  const { handle } = await params;
  return (
    <Link href={`/${encodeURIComponent(handle)}`} className="font-semibold underline underline-offset-4">
      Try again
    </Link>
  );
}
