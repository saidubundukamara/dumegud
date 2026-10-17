import { CheckIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FeeExample, FeeExampleSkeleton } from "@/components/marketing/FeeExample";
import { Reveal } from "@/components/motion/Reveal";
import { Eyebrow } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Fees",
  description: "DuMeGud is free to join. We take a small cut of each payment, and you always see it first.",
  alternates: { canonical: "/pricing" },
};

const FREE = [
  "Making your page",
  "Adding products to your shop",
  "Your thank-you shout-out posts",
  "Help from our team",
];

export default function PricingPage() {
  return (
    <main className="flex flex-1 flex-col px-4 pb-16 pt-28 sm:px-6 md:pt-40">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16">
        <header className="flex max-w-2xl animate-rise flex-col gap-5">
          <Eyebrow>Fees</Eyebrow>
          <h1 className="text-display">Free to start. Simple to understand.</h1>
          <p className="text-lg text-muted sm:text-xl">
            There is no monthly bill. When a fan pays you, a small part goes to the mobile money network and a small
            part goes to us. The rest is yours.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-brand-xl bg-text/[0.035] p-1.5 ring-1 ring-border">
              <div className="h-full rounded-[calc(var(--radius-brand-xl)-0.375rem)] bg-surface p-6 shadow-soft md:p-8">
                <h2 className="mb-4 text-2xl font-bold">When a fan sends Le 100</h2>
                <Suspense fallback={<FeeExampleSkeleton />}>
                  <FeeExample />
                </Suspense>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="flex h-full flex-col gap-5 rounded-brand-xl bg-surface p-6 shadow-soft ring-1 ring-border md:p-8">
              <h2 className="text-2xl font-bold">Always free</h2>
              <ul className="flex flex-col gap-3">
                {FREE.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-surface text-success">
                      <CheckIcon aria-hidden="true" weight="bold" className="size-4" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal className="flex flex-col gap-4 rounded-brand-xl bg-surface-muted p-6 md:p-8">
          <h2 className="text-2xl font-bold">Taking your money out</h2>
          <p className="max-w-2xl text-muted">
            When you withdraw to your mobile money, the network charges a small fee. We show it on the screen before
            you confirm, so you always know how much will arrive.
          </p>
          <Link href="/register" className={buttonClasses("primary", "mt-2 w-full sm:w-fit", "lg")}>
            Create your free page
          </Link>
        </Reveal>
      </div>
    </main>
  );
}
