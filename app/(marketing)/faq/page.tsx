import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/marketing/Faq";
import { FAQ_MORE, FAQ_TOP } from "@/components/marketing/faq-content";
import { Reveal } from "@/components/motion/Reveal";
import { Eyebrow } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Questions",
  description: "Simple answers about DuMeGud: fees, payments, withdrawals and selling your work.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <main className="flex flex-1 flex-col px-4 pb-16 pt-28 sm:px-6 md:pt-40">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        <header className="flex animate-rise flex-col gap-5">
          <Eyebrow>Questions</Eyebrow>
          <h1 className="text-display">Questions? Here are the answers.</h1>
        </header>
        <Faq items={[...FAQ_TOP, ...FAQ_MORE]} />
        <Reveal className="flex flex-col items-start gap-4 rounded-brand-xl bg-surface-muted p-6 md:p-8">
          <h2 className="text-2xl font-bold">Still not sure?</h2>
          <p className="text-muted">Make a page and look around. It&apos;s free, and nobody can pay you until you&apos;re ready.</p>
          <Link href="/register" className={buttonClasses("primary", "w-full sm:w-fit", "lg")}>
            Create your free page
          </Link>
        </Reveal>
      </div>
    </main>
  );
}
