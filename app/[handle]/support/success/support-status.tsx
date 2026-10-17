"use client";

import { useParams } from "next/navigation";
import { PaymentStatus } from "@/components/checkout/payment-status";

export function SupportStatus() {
  const { handle } = useParams<{ handle: string }>();
  return (
    <PaymentStatus
      back={{ href: `/${handle}`, label: `Back to @${handle}` }}
      success={() => (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Thank you!</h1>
          <p>Your support went through. It means a lot.</p>
        </>
      )}
    />
  );
}
