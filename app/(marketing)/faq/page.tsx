import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/marketing/Faq";
import { FAQ_MORE, FAQ_TOP } from "@/components/marketing/faq-content";
import { Reveal } from "@/components/motion/Reveal";
import { BlurText } from "@/components/reactbits/BlurText";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Questions",
  description: "Simple answers about DuMeGud: fees, payments, withdrawals and selling your work.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-16 pt-28 sm:px-6 md:pt-36">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        <header className="flex animate-rise flex-col items-center gap-5 text-center">
          <h1 className="text-display">Answers to common questions</h1>
          <p className="max-w-xl text-lg text-muted">Fees, payments, withdrawals and selling your work, in plain words.</p>
        </header>
        <Faq items={[...FAQ_TOP, ...FAQ_MORE]} />
        <Reveal className="flex flex-col items-center gap-4 rounded-[2rem] bg-primary px-6 py-12 text-center text-primary-foreground sm:px-10">
          <BlurText text="Still not sure?" className="text-title" />
          <p className="max-w-md text-white/80">Make a page and look around. It&apos;s free, and nobody can see it until you publish it.</p>
          <Link href="/register" className={`${buttonClasses("secondary", "mt-2 w-full sm:w-auto", "lg")} !ring-0`}>
            Create your free page
          </Link>
        </Reveal>
      </div>
    </main>
  );
}
