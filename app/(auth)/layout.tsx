import { Wordmark } from "@/components/brand/Wordmark";
import { PaidNotification } from "@/components/marketing/PhoneMockup";
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
        <div className="pointer-events-none absolute -bottom-32 -right-24 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(206_32_42/0.5),transparent)]" />
        <p className="relative text-sm font-semibold uppercase tracking-[0.14em] text-white/60">DuMeGud</p>
        <div className="relative flex flex-col gap-8">
          <p className="font-display text-5xl font-bold leading-[1.02] tracking-[-0.03em]">
            Your fans want to help. Give them a link.
          </p>
          <div className="flex flex-col gap-3 text-text">
            <PaidNotification className="animate-float" />
            <PaidNotification
              className="ml-12 animate-float [animation-delay:1.2s]"
              title="Le 80 from Fatmata"
              line="Bought your recipe e-book"
            />
          </div>
        </div>
        <p className="relative text-white/60">Paid with Orange Money and AfriMoney.</p>
      </aside>
    </div>
  );
}
