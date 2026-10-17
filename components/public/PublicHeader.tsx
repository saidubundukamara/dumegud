import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";

/** Slim bar for pages fans see. The right-hand link is the growth loop: fans become creators. */
export function PublicHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:pt-4">
      <Wordmark />
      {cta ? (
        <Link
          href="/register"
          className="inline-flex min-h-10 items-center rounded-full bg-surface/80 px-4 text-sm font-semibold shadow-soft ring-1 ring-border backdrop-blur transition-colors hover:ring-border-strong"
        >
          Make your own page
        </Link>
      ) : null}
    </header>
  );
}

/** Soft red wash behind the top of a public page, standing in for a cover photo. */
export function PageGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(70%_60%_at_50%_0%,var(--color-primary-soft),transparent_75%)]"
    />
  );
}
