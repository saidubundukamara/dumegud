import { CompassIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBlock, StatusPage } from "@/components/checkout/StatusScreen";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <StatusPage>
      <StatusBlock icon={<CompassIcon weight="bold" className="size-8" />} title="This page could not be found">
        <p>The link may be wrong, or the page was moved.</p>
      </StatusBlock>
      <Link href="/" className={buttonClasses("primary", "w-full", "lg")}>
        Go to the home page
      </Link>
    </StatusPage>
  );
}
