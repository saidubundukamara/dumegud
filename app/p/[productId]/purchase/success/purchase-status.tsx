"use client";

import type { Route } from "next";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { buttonClasses } from "@/components/ui/button-classes";

export function PurchaseStatus() {
  const { productId } = useParams<{ productId: string }>();
  return (
    <PaymentStatus
      back={{ href: `/p/${productId}`, label: "Back to the product" }}
      successTitle="It's yours!"
      success={(libraryUrl) => (
        <>
          <p>We also emailed you a receipt with your download link. Keep that email: the link is how you get your file.</p>
          {libraryUrl ? (
            <Link href={new URL(libraryUrl).pathname as Route} className={buttonClasses("primary", "w-full", "lg")}>
              <DownloadSimpleIcon aria-hidden="true" weight="bold" className="size-5" />
              Get your download
            </Link>
          ) : null}
        </>
      )}
    />
  );
}
