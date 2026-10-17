import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  ChatCircleIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  HandHeartIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FeeExample, FeeExampleSkeleton } from "@/components/marketing/FeeExample";
import { Faq } from "@/components/marketing/Faq";
import { FAQ_TOP } from "@/components/marketing/faq-content";
import { PaidNotification, PhoneFrame, SampleCreatorScreen } from "@/components/marketing/PhoneMockup";
import { PhotoSlot } from "@/components/marketing/PhotoSlot";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Eyebrow } from "@/components/ui/Badge";
import { buttonClasses, buttonIconClasses } from "@/components/ui/button-classes";
import { MARKETING_PHOTOS, type PhotoSlotKey } from "@/lib/marketing-images";

export const metadata: Metadata = {
  title: { absolute: "DuMeGud: get paid by the people who love your work" },
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    title: "Make your page",
    body: "Sign up for free. Add your photo, a few words about you and your links. It takes about two minutes.",
  },
  {
    title: "Share your link",
    body: "Put your DuMeGud link in your TikTok, Instagram or WhatsApp. Fans tap it and pay right there.",
  },
  {
    title: "Get your money",
    body: "Gifts go into your DuMeGud wallet. Send the money to your Orange Money or AfriMoney when you want.",
  },
];

const CRAFTS: PhotoSlotKey[] = ["musician", "artist", "writer", "teacher", "comedian", "photographer"];

export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <Hero />
      <HowItWorks />
      <WaysToEarn />
      <WhoItsFor />
      <Fees />
      <Questions />
      <FinalCta />
    </main>
  );
}

function StartButton({ className = "" }: { className?: string }) {
  return (
    <Link href="/register" className={buttonClasses("primary", className, "lg")}>
      Create your free page
      <span className={buttonIconClasses("primary")}>
        <ArrowUpRightIcon aria-hidden="true" weight="bold" className="size-4" />
      </span>
    </Link>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-28 sm:px-6 md:pb-32 md:pt-40">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-primary-soft),transparent)] opacity-80"
      />
      <div className="relative mx-auto grid max-w-5xl items-center gap-16 md:grid-cols-[1.15fr_0.85fr] md:gap-10">
        <div className="flex flex-col items-start gap-6">
          <div className="animate-rise">
            <Eyebrow>For Sierra Leone&apos;s creators</Eyebrow>
          </div>
          <h1 className="text-display animate-rise [animation-delay:60ms]">
            Get paid by fans who <span className="text-primary">love</span> your work.
          </h1>
          <p className="max-w-lg animate-rise text-lg text-muted [animation-delay:120ms] sm:text-xl">
            Make a free page and share the link. Your fans send you money with Orange Money or AfriMoney. They
            don&apos;t need an app.
          </p>
          <div className="flex w-full animate-rise flex-col gap-3 [animation-delay:180ms] sm:w-auto sm:flex-row">
            <StartButton className="w-full sm:w-auto" />
            <Link href="/#how" className={buttonClasses("secondary", "w-full sm:w-auto", "lg")}>
              See how it works
            </Link>
          </div>
          <p className="animate-rise text-sm text-muted [animation-delay:240ms]">Free to join. No monthly cost.</p>
        </div>

        <div className="relative animate-rise [animation-delay:200ms]">
          <PhoneFrame className="md:rotate-[2deg]">
            <SampleCreatorScreen />
          </PhoneFrame>
          {/* Sits over the phone's bottom edge so it never hides the creator's face. */}
          <div className="absolute inset-x-0 -bottom-7 flex justify-center md:-left-24 md:right-auto">
            <PaidNotification className="animate-float" />
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 px-4 py-20 sm:px-6 md:py-32">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <Reveal className="flex max-w-xl flex-col gap-4">
          <Eyebrow tone="neutral">How it works</Eyebrow>
          <h2 className="text-title">Three steps. That&apos;s all.</h2>
        </Reveal>
        <Stagger as="ul" className="relative grid items-start gap-4 md:grid-cols-3 md:gap-6" gap={0.12}>
          {/* The thread that ties the steps together on phones. */}
          <span aria-hidden="true" className="absolute bottom-10 left-[2.4rem] top-10 w-px bg-border-strong md:hidden" />
          {STEPS.map((step, i) => (
            <StaggerItem
              as="li"
              key={step.title}
              className={`relative flex gap-5 rounded-brand-xl bg-surface p-5 shadow-soft ring-1 ring-border md:flex-col md:p-7 ${i === 1 ? "md:mt-12" : i === 2 ? "md:mt-24" : ""}`}
            >
              <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-white shadow-primary">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function WaysToEarn() {
  return (
    <section className="px-4 py-20 sm:px-6 md:py-32">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <Eyebrow tone="neutral">What you can do</Eyebrow>
          <h2 className="text-title">One link does it all.</h2>
          <p className="text-lg text-muted">Fans send gifts or buy your work, you thank them, and the money goes to your phone.</p>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-6 md:gap-5">
          <Reveal className="md:col-span-4">
            <BentoCard
              icon={<HandHeartIcon weight="duotone" className="size-6" />}
              title="Get gifts from fans"
              body="Fans pick an amount and can leave you a kind message. Every gift lands in your wallet."
            >
              <ul className="mt-6 flex flex-col gap-2">
                {[
                  { who: "Fatmata", amount: "Le 100", msg: "Your videos make me laugh every day" },
                  { who: "Ibrahim", amount: "Le 50", msg: "Keep going, bro!" },
                ].map((g) => (
                  <li key={g.who} className="flex items-center gap-3 rounded-brand bg-surface-muted p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface font-semibold">
                      {g.who.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {g.who} sent {g.amount}
                      </span>
                      <span className="block truncate text-sm text-muted">{g.msg}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </BentoCard>
          </Reveal>

          <Reveal className="md:col-span-2" delay={0.08}>
            <BentoCard
              icon={<DownloadSimpleIcon weight="duotone" className="size-6" />}
              title="Sell your work"
              body="E-books, songs, beats, art. Buyers get the file right after they pay."
            >
              <ul className="mt-6 flex flex-col gap-2">
                {[
                  ["Beat pack", "Le 150"],
                  ["Recipe e-book", "Le 80"],
                ].map(([name, price]) => (
                  <li key={name} className="flex items-center justify-between rounded-brand bg-surface-muted px-3 py-2.5 text-sm">
                    <span className="font-semibold">{name}</span>
                    <span className="rounded-full bg-surface px-2.5 py-0.5 font-semibold">{price}</span>
                  </li>
                ))}
              </ul>
            </BentoCard>
          </Reveal>

          <Reveal className="md:col-span-2">
            <BentoCard
              icon={<MegaphoneIcon weight="duotone" className="size-6" />}
              title="Thank fans in public"
              body="Fans can add their TikTok or Instagram name. We make a thank-you post you can share."
            >
              <p className="mt-6 rounded-brand bg-surface-muted p-3 text-sm leading-relaxed">
                Big thank you to <span className="font-semibold text-primary">@fatmata.sl</span> and{" "}
                <span className="font-semibold text-primary">@ibrahim_k</span> for the support this week!
              </p>
            </BentoCard>
          </Reveal>

          <Reveal className="md:col-span-4" delay={0.08}>
            <div className="flex h-full flex-col justify-between gap-8 rounded-brand-xl bg-accent p-6 text-white md:p-8">
              <div className="flex flex-col gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-white/10">
                  <DeviceMobileIcon weight="duotone" className="size-6" />
                </span>
                <h3 className="text-2xl font-bold">Your money goes to your phone</h3>
                <p className="max-w-md text-white/70">
                  Withdraw to your own Orange Money or AfriMoney number. We check your ID once, so only you can take
                  your money out.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <ShieldCheckIcon aria-hidden="true" className="size-4" /> ID check keeps it safe
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
                  <ChatCircleIcon aria-hidden="true" className="size-4" /> Real people to help you
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function BentoCard({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-brand-xl bg-surface p-6 shadow-soft ring-1 ring-border md:p-8">
      <span aria-hidden="true" className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon}
      </span>
      <h3 className="text-2xl font-bold">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
      {children}
    </div>
  );
}

function WhoItsFor() {
  return (
    <section className="px-4 py-20 sm:px-6 md:py-32">
      <Reveal className="mx-auto flex max-w-5xl flex-col gap-4">
        <Eyebrow tone="neutral">Who it&apos;s for</Eyebrow>
        <h2 className="text-title max-w-2xl">If people enjoy what you make, this is for you.</h2>
      </Reveal>
      {/* Bleeds to the screen edge on phones so the rail reads as swipeable. */}
      <ul aria-label="Kinds of creators" className="no-scrollbar -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-auto md:max-w-5xl md:px-0">
        {CRAFTS.map((slot) => (
          <li key={slot} className="relative w-56 shrink-0 snap-start overflow-hidden rounded-brand-xl shadow-soft md:w-64">
            <PhotoSlot slot={slot} className="aspect-[4/5]" sizes="256px" />
            <span className="absolute inset-x-3 bottom-3 rounded-full bg-surface/90 px-4 py-2 text-center font-semibold backdrop-blur">
              {MARKETING_PHOTOS[slot].name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fees() {
  return (
    <section className="px-4 py-20 sm:px-6 md:py-32">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal className="flex flex-col gap-4">
          <Eyebrow tone="neutral">Fees</Eyebrow>
          <h2 className="text-title">Free to join. We earn only when you do.</h2>
          <p className="text-lg text-muted">
            No monthly bill. We take a small cut of each payment, and you see it before anyone pays.
          </p>
          <Link href="/pricing" className="inline-flex min-h-11 w-fit items-center gap-2 font-semibold text-primary hover:underline">
            See all the fees <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="rounded-brand-xl bg-text/[0.035] p-1.5 ring-1 ring-border">
            <div className="rounded-[calc(var(--radius-brand-xl)-0.375rem)] bg-surface p-6 shadow-soft md:p-8">
              <Suspense fallback={<FeeExampleSkeleton />}>
                <FeeExample />
              </Suspense>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section className="px-4 py-20 sm:px-6 md:py-32">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
        <Reveal className="flex flex-col gap-4">
          <Eyebrow tone="neutral">Questions</Eyebrow>
          <h2 className="text-title">Things people ask us.</h2>
          <Link href="/faq" className="inline-flex min-h-11 w-fit items-center gap-2 font-semibold text-primary hover:underline">
            See more answers <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <Faq items={FAQ_TOP} />
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-3 py-10 sm:px-6">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-accent px-6 py-16 text-center text-white md:py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(206_32_42/0.45),transparent)]"
        />
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-6">
          <h2 className="text-title">Your fans want to help. Give them a link.</h2>
          <p className="text-lg text-white/70">It&apos;s free, and your page can be ready in two minutes.</p>
          <StartButton />
        </div>
      </Reveal>
    </section>
  );
}
