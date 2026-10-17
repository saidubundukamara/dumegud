"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { buttonClasses } from "@/components/ui/button-classes";

export function PurchaseStatus() {
  const { productId } = useParams<{ productId: string }>();
  return (
    <PaymentStatus
      back={{ href: `/p/${productId}`, label: "Back to the product" }}
      success={(libraryUrl) => (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Thank you for your purchase!</h1>
          {libraryUrl ? (
            <Link href={new URL(libraryUrl).pathname as Route} className={buttonClasses("primary", "self-start")}>
              Open your downloads
            </Link>
          ) : null}
          <p>We&apos;ve emailed you a receipt with your download link. Keep it: the link is your access.</p>
        </>
      )}
    />
  );
}
