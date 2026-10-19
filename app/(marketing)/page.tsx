import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CaretRightIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  EyeIcon,
  HandHeartIcon,
  IdentificationCardIcon,
  MegaphoneIcon,
  UserCircleCheckIcon,
  WalletIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CraftMarquee } from "@/components/marketing/CraftMarquee";
import { FeeExample, FeeExampleSkeleton } from "@/components/marketing/FeeExample";
import { Faq } from "@/components/marketing/Faq";
import { FAQ_TOP } from "@/components/marketing/faq-content";
import {
  GiftList,
  GiftNotice,
  ProductTile,
  SaleChip,
  ShareCard,
  ShoutoutCard,
  WalletCard,
  WithdrawCard,
} from "@/components/marketing/fragments";
import { HowItWorksTabs, type HowStep } from "@/components/marketing/HowItWorksTabs";
import { PhoneFrame, SampleCreatorScreen } from "@/components/marketing/PhoneMockup";
import { Reveal } from "@/components/motion/Reveal";
import { BlurText } from "@/components/reactbits/BlurText";
import { LazyAurora } from "@/components/reactbits/LazyAurora";
import { Magnet } from "@/components/reactbits/Magnet";
import { buttonClasses, buttonIconClasses } from "@/components/ui/button-classes";
import { MARKETING_PHOTOS } from "@/lib/marketing-images";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "DuMeGud: let your fans support you",
    shareTitle: "DuMeGud: let your fans support you",
    description:
      "Make a free page, share your link, and let fans support your work with Orange Money or AfriMoney. You can sell your e-books, music and art there too.",
    path: "/",
  }),
  title: { absolute: "DuMeGud: let your fans support you" },
};

const STEPS: HowStep[] = [
  {
    key: "page",
    tab: "Make your page",
    title: "Your own page in two minutes",
    points: ["Sign up free, no monthly cost", "Add your photo, a few words and your links", "Pick the gift amounts fans can choose from"],
    visual: (
      <PhoneFrame>
        <SampleCreatorScreen />
      </PhoneFrame>
    ),
  },
  {
    key: "share",
    tab: "Share your link",
    title: "Put it where your fans already are",
    points: ["Add it to your TikTok, Instagram or WhatsApp", "Fans tap it and send a gift right there", "No app or account needed for them"],
    visual: <ShareCard />,
  },
  {
    key: "paid",
    tab: "Get your money",
    title: "Money goes to your phone",
    points: ["Every gift and sale lands in your wallet", "Withdraw to Orange Money or AfriMoney", "We check your ID once, so only you can"],
    visual: (
      <div className="flex flex-col gap-4">
        <WalletCard className="w-full" />
        <WithdrawCard />
      </div>
    ),
  },
];

const TRUST = [
  { Icon: UserCircleCheckIcon, title: "Fans need no app", body: "They send a gift straight from your link. No account, no download." },
  { Icon: DeviceMobileIcon, title: "Your money, your number", body: "Withdraw to your own Orange Money or AfriMoney whenever you like." },
  { Icon: EyeIcon, title: "Every fee shown first", body: "You and your fans see the fee before any money moves. Nothing is hidden." },
  { Icon: IdentificationCardIcon, title: "ID checked before payouts", body: "We confirm it's you once, so nobody else can take your money out." },
];

export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      <Hero />
      <HowItWorks />
      <WaysToEarn />
      <WhoItsFor />
      <Trust />
      <Fees />
      <Questions />
      <FinalCta />
    </main>
  );
}

/** The page's one sign-up CTA, with a gentle magnetic pull on desktop. */
function StartButton({ tone = "primary" }: { tone?: "primary" | "light" }) {
  const variant = tone === "light" ? "secondary" : "primary";
  return (
    <Magnet className="w-full sm:w-auto">
      <Link href="/register" className={`${buttonClasses(variant, "w-full sm:w-auto", "lg")} ${tone === "light" ? "!ring-0" : ""}`}>
        Create your free page
        <span className={buttonIconClasses(variant)}>
          <ArrowUpRightIcon aria-hidden="true" weight="bold" className="size-4" />
        </span>
      </Link>
    </Magnet>
  );
}

function Hero() {
  const photo = MARKETING_PHOTOS.heroCutout;
  return (
    <section className="px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[2rem] bg-surface-muted px-4 pt-24 sm:rounded-[2.5rem] sm:pt-32">
        {/* Soft daylight from above; the stage is the only tinted surface on the page. */}
        {/* Two soft lights wander very slowly, under a static grain for a tactile surface. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] top-[8%] size-[38rem] animate-drift rounded-full bg-[radial-gradient(closest-side,var(--color-primary-soft),transparent)] opacity-90 blur-2xl" />
          <div className="absolute -right-[12%] bottom-[2%] size-[34rem] animate-drift rounded-full bg-[radial-gradient(closest-side,var(--color-secondary-soft),transparent)] opacity-80 blur-2xl [animation-delay:-14s] [animation-duration:52s]" />
          <div className="absolute inset-x-0 top-0 h-[70%] bg-[radial-gradient(60%_80%_at_50%_0%,var(--color-surface),transparent)]" />
          <div className="bg-grain absolute inset-0 opacity-[0.04] mix-blend-multiply" />
        </div>

        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Link
            href="/#earn"
            className="inline-flex animate-rise items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 text-sm font-medium shadow-soft ring-1 ring-border transition-shadow hover:ring-border-strong"
          >
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">New</span>
            Sell your e-books and beats
            <CaretRightIcon aria-hidden="true" weight="bold" className="size-3.5 text-muted" />
          </Link>
          <h1 className="text-display animate-rise [animation-delay:60ms]">
            Let your fans{" "}
            <span className="inline-block rounded-full bg-primary-soft px-[0.24em] pb-[0.04em] text-primary ring-1 ring-primary/10">support</span> you.
          </h1>
          <p className="max-w-xl animate-rise text-lg text-muted [animation-delay:120ms] sm:text-xl">
            Make a free page, share the link, and fans can support your work with Orange Money or AfriMoney.
          </p>
          <div className="flex w-full animate-rise flex-col gap-3 [animation-delay:180ms] sm:w-auto sm:flex-row">
            <StartButton />
            <Link href="/#how" className={buttonClasses("secondary", "w-full sm:w-auto", "lg")}>
              See how it works
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-10 h-[21rem] max-w-5xl animate-rise [animation-delay:220ms] sm:mt-14 sm:h-[30rem] md:h-[34rem]">
          {photo.src ? (
            <Image
              src={photo.src}
              alt={photo.alt}
              width={1000}
              height={1000}
              priority
              sizes="(min-width: 768px) 544px, 336px"
              className="absolute bottom-0 left-1/2 h-full w-auto -translate-x-1/2 object-contain object-bottom [mask-composite:intersect] [mask-image:linear-gradient(to_bottom,black_62%,transparent),linear-gradient(to_right,transparent,black_16%,black_84%,transparent)]"
            />
          ) : null}

          {/* Desktop: a faded stack of gifts on the left, the wallet and a sale on the right. */}
          <div className="absolute left-0 top-10 hidden animate-rise flex-col items-start gap-2 [animation-delay:320ms] md:flex lg:left-6">
            <GiftNotice name="Abu" amount="Le 20" dim className="w-60" />
            <GiftNotice name="Mohamed" amount="Le 50" note="This song made my day!" className="ml-6 w-64" />
            <GiftNotice name="Fatu" amount="Le 100" dim className="w-60" />
          </div>
          <div className="absolute right-0 top-4 hidden animate-rise [animation-delay:380ms] md:block lg:right-6">
            <WalletCard className="rotate-[3deg] animate-float" />
          </div>
          <div className="absolute bottom-24 right-16 hidden animate-rise [animation-delay:460ms] md:block">
            <SaleChip className="-rotate-2 animate-float [animation-delay:-3s] [animation-duration:8s]" />
          </div>

          {/* Phones: two chips over the photo's lower edge, nothing rotated. */}
          <GiftNotice name="Mohamed" amount="Le 50" note="This song made my day!" className="absolute bottom-20 left-0 w-60 md:hidden" />
          <SaleChip className="absolute bottom-5 right-0 md:hidden" />
        </div>
      </div>
    </section>
  );
}

/** Section title that resolves word by word from a blur, then its line fades in. */
function SectionHeading({ title, children, center = false }: { title: string; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`flex flex-col gap-4 ${center ? "mx-auto max-w-2xl items-center text-center" : "max-w-2xl"}`}>
      <BlurText text={title} className="text-title" />
      {children ? (
        <Reveal delay={0.25}>
          <p className="text-lg text-muted">{children}</p>
        </Reveal>
      ) : null}
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 px-4 py-24 sm:px-6 md:py-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <SectionHeading title="From sign-up to your first gift" center>
          Every step works from your phone.
        </SectionHeading>
        <Reveal delay={0.08}>
          <HowItWorksTabs steps={STEPS} />
        </Reveal>
      </div>
    </section>
  );
}

function Tile({ icon, title, body, children, className = "" }: { icon: ReactNode; title: string; body: string; children: ReactNode; className?: string }) {
  return (
    <div className={`group flex h-full flex-col gap-8 overflow-hidden rounded-[2rem] bg-surface-muted p-6 sm:p-8 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex max-w-sm flex-col gap-2">
          <h3 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h3>
          <p className="text-muted">{body}</p>
        </div>
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-primary shadow-soft transition-transform duration-500 ease-spring group-hover:-rotate-6 group-hover:scale-110"
        >
          {icon}
        </span>
      </div>
      {/* The product fragment lifts a little when the tile is hovered. */}
      <div className="mt-auto transition-transform duration-500 ease-brand group-hover:-translate-y-1.5">{children}</div>
    </div>
  );
}

function WaysToEarn() {
  return (
    <section id="earn" className="scroll-mt-24 px-4 pb-24 sm:px-6 md:pb-32">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <SectionHeading title="One link for support and sales">Gifts, sales and shout-outs all come through the same page.</SectionHeading>
        <div className="grid gap-4 md:grid-cols-12 md:gap-5">
          <Reveal className="md:col-span-7">
            <Tile icon={<HandHeartIcon weight="fill" className="size-5" />} title="Gifts from fans" body="Fans pick an amount and can leave a kind message.">
              <div className="mx-auto max-w-md">
                <GiftList />
              </div>
            </Tile>
          </Reveal>
          <Reveal className="md:col-span-5" delay={0.06}>
            <Tile icon={<DownloadSimpleIcon weight="bold" className="size-5" />} title="Sell your work" body="E-books, songs, beats and art. Buyers get the file right away.">
              <div className="mx-auto max-w-xs">
                <ProductTile />
              </div>
            </Tile>
          </Reveal>
          <Reveal className="md:col-span-5">
            <Tile icon={<MegaphoneIcon weight="fill" className="size-5" />} title="Thank fans in public" body="We write a thank-you post with their TikTok or Instagram names.">
              <ShoutoutCard />
            </Tile>
          </Reveal>
          <Reveal className="md:col-span-7" delay={0.06}>
            <Tile
              icon={<WalletIcon weight="fill" className="size-5" />}
              title="Cash out to mobile money"
              body="Move your money to Orange Money or AfriMoney when you want."
              className="bg-[linear-gradient(160deg,var(--color-primary-soft),var(--color-surface-muted)_60%)]"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <WalletCard className="w-full" />
                <WithdrawCard />
              </div>
            </Tile>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function WhoItsFor() {
  return (
    <section className="pb-24 md:pb-32">
      <div className="mx-auto mb-10 max-w-6xl px-4 sm:px-6">
        <SectionHeading title="Made for people who make things">
          Singers, painters, writers, teachers, comedians and photographers already have fans. DuMeGud gives those fans an easy way to support them.
        </SectionHeading>
      </div>
      <CraftMarquee />
    </section>
  );
}

function Trust() {
  return (
    <section className="px-4 pb-24 sm:px-6 md:pb-32">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:gap-20">
        <div className="flex flex-col gap-6">
          <SectionHeading title="Built for how Sierra Leone pays">Fans send gifts with mobile money and you withdraw to mobile money. Every price is in leones.</SectionHeading>
          <ul className="flex flex-wrap gap-2">
            {["Orange Money", "AfriMoney", "Prices in leones", "Help from real people"].map((c) => (
              <li key={c} className="rounded-full bg-surface px-4 py-2 text-sm font-medium ring-1 ring-border">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <Reveal as="ul" delay={0.08} className="flex flex-col gap-8">
          {TRUST.map(({ Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 border-l-2 border-primary pl-6">
              <h3 className="flex items-center gap-2.5 text-xl font-semibold tracking-[-0.02em]">
                <Icon aria-hidden="true" weight="duotone" className="size-5 text-primary" />
                {title}
              </h3>
              <p className="max-w-md text-muted">{body}</p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function Fees() {
  return (
    <section className="px-4 pb-24 sm:px-6 md:pb-32">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-10">
        <SectionHeading title="Free to join. We earn only when you do." center>
            No monthly bill. We take a small share of each gift or sale, and you always see it first.
          </SectionHeading>
        <Reveal delay={0.08} className="w-full">
          <div className="rounded-[2rem] bg-surface p-6 shadow-lift ring-1 ring-border sm:p-10">
            <Suspense fallback={<FeeExampleSkeleton />}>
              <FeeExample />
            </Suspense>
          </div>
        </Reveal>
        <Link href="/pricing" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">
          Try your own amount <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section className="px-4 pb-24 sm:px-6 md:pb-32">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <SectionHeading title="Questions people ask us" center />
        <Reveal delay={0.08}>
          <Faq items={FAQ_TOP} />
        </Reveal>
        <Link href="/faq" className="mx-auto inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline">
          See more answers <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-2 pb-4 sm:px-3">
      <Reveal className="relative isolate mx-auto max-w-[1400px] overflow-hidden rounded-[2rem] bg-primary px-6 py-20 text-center text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] sm:rounded-[2.5rem] md:py-28">
        {/* A quiet aurora (React Bits) drifts along the top; the scrim keeps the white text readable. */}
        <LazyAurora className="absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_50%,color-mix(in_srgb,var(--color-primary)_55%,transparent),transparent)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
          <BlurText text="Make your page today. It's free." className="text-title" />
          <p className="text-lg text-white/85">It takes about two minutes, and fans can support you as soon as it&apos;s live.</p>
          <StartButton tone="light" />
        </div>
      </Reveal>
    </section>
  );
}
