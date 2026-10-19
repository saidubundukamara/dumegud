import { ArrowUpRightIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FeeCalculator } from "@/components/marketing/FeeCalculator";
import { FeeExampleSkeleton } from "@/components/marketing/FeeExample";
import { Reveal } from "@/components/motion/Reveal";
import { BlurText } from "@/components/reactbits/BlurText";
import { buttonClasses, buttonIconClasses } from "@/components/ui/button-classes";
import { logger } from "@/server/lib/logger";
import { getCachedSupportSettings } from "@/server/queries/public-profile";

export const metadata: Metadata = pageMetadata({
  title: "Fees",
  description: "DuMeGud is free to join. We take a small share of each gift or sale, and you always see it first.",
  path: "/pricing",
});

const FREE = [
  { title: "Making your page", body: "Your page, your link and your shop cost nothing to set up." },
  { title: "Adding products", body: "Put your e-books, songs and other files in your shop." },
  { title: "Thank-you shout-outs", body: "We make the post for you to share." },
  { title: "Help from our team", body: "Our team helps when you get stuck." },
];

export default function PricingPage() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-8 pt-28 sm:px-6 md:pt-36">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 md:gap-28">
        <header className="mx-auto flex max-w-2xl animate-rise flex-col items-center gap-5 text-center">
          <h1 className="text-display">Free to start. Simple to understand.</h1>
          <p className="text-lg text-muted sm:text-xl">
            No monthly bill. When a fan sends you a gift, a small part goes to the mobile money network and a small part to us. The rest is yours.
          </p>
        </header>

        <div className="grid items-start gap-12 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
          <div className="animate-rise rounded-[2rem] bg-surface p-6 shadow-lift ring-1 ring-border [animation-delay:100ms] sm:p-10">
            <Suspense fallback={<FeeExampleSkeleton />}>
              <Calculator />
            </Suspense>
          </div>
          <Reveal className="flex flex-col gap-8 md:pt-6">
            <BlurText text="Always free" className="text-title" />
            <ul className="flex flex-col gap-8">
              {FREE.map((f) => (
                <li key={f.title} className="flex flex-col gap-1.5 border-l-2 border-primary pl-6">
                  <h3 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
                    <CheckIcon aria-hidden="true" weight="bold" className="size-4 text-primary" />
                    {f.title}
                  </h3>
                  <p className="text-muted">{f.body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <BlurText text="Taking your money out" className="text-title" />
          <p className="text-lg text-muted">
            When you withdraw to your mobile money, the network charges a small fee. We show it before you confirm, so you always know how much
            will arrive.
          </p>
          <Link href="/register" className={buttonClasses("primary", "mt-2 w-full sm:w-auto", "lg")}>
            Create your free page
            <span className={buttonIconClasses("primary")}>
              <ArrowUpRightIcon aria-hidden="true" weight="bold" className="size-4" />
            </span>
          </Link>
        </Reveal>
      </div>
    </main>
  );
}

async function Calculator() {
  await connection(); // fees live in the database; read at request time (cached), never at build
  const settings = await getCachedSupportSettings().catch((error) => {
    logger.warn("pricing fee calculator unavailable", { error: String(error) });
    return null;
  });
  if (!settings) return <p className="text-muted">You always see the fee before anyone pays. Nothing is hidden.</p>;
  return <FeeCalculator settings={settings} />;
}
