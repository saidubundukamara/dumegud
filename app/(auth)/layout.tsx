import { Wordmark } from "@/components/brand/Wordmark";
import { GiftNotice, SaleChip } from "@/components/marketing/fragments";
import { PageGlow } from "@/components/public/PublicHeader";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1">
      <div className="relative flex flex-1 flex-col">
        <PageGlow />
        <header className="relative px-4 pt-3 sm:px-6 sm:pt-4">
          <Wordmark />
        </header>
        <main id="main" tabIndex={-1} className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 pb-16 pt-8 sm:px-6">
          <div className="flex animate-rise flex-col gap-6">{children}</div>
        </main>
      </div>

      {/* Desktop only: a reminder of what they're signing up for. */}
      <aside
        aria-hidden="true"
        className="relative m-3 hidden w-[44%] max-w-2xl flex-col justify-between overflow-hidden rounded-[2rem] bg-accent p-12 text-white lg:flex"
      >
        <div className="pointer-events-none absolute -bottom-32 -right-24 size-[34rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-secondary)_50%,transparent),transparent)]" />
        <p className="relative text-sm font-semibold uppercase tracking-[0.14em] text-white/60">DuMeGud</p>
        <div className="relative flex flex-col gap-8">
          <p className="font-display text-5xl font-bold leading-[1.02] tracking-[-0.03em]">
            Let your fans support you.
          </p>
          <div className="flex flex-col gap-3 text-text">
            <GiftNotice name="Mohamed" amount="Le 50" note="This song made my day!" className="w-64 animate-float" />
            <SaleChip title="Recipe e-book sold" line="Le 80, file sent" className="ml-12 w-64 animate-float [animation-delay:1.2s]" />
          </div>
        </div>
        <p className="relative text-white/60">Gifts arrive by Orange Money and AfriMoney.</p>
      </aside>
    </div>
  );
}
