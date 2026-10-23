import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = { title: "Come back when you're 18", robots: { index: false, follow: false } };

export default function UnderAgePage() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-title">Come back when you&apos;re 18</h1>
        <p className="text-muted">
          DuMeGud pages are for people 18 and over, so we&apos;ve cancelled your sign-up and deleted the details Google
          sent us. We didn&apos;t keep your date of birth either.
        </p>
        <p className="text-muted">
          You can still support creators you like, as long as a parent or guardian says it&apos;s OK.
        </p>
      </div>
      <Link href="/" className={buttonClasses("secondary", "w-full")}>
        Back to DuMeGud
      </Link>
    </>
  );
}
