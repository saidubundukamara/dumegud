import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Creator terms" };

// Placeholder until the reviewed legal text lands (implementation.md Phase 10, "Legal & content").
export default function CreatorTermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12 sm:px-6">
      <Link href="/" className="text-xl font-bold tracking-tight">
        DuMeGud
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Creator terms</h1>
      <p className="rounded-brand bg-warning-surface px-4 py-3">
        Draft: the final creator terms will be published before launch. By accepting now you agree to use DuMeGud
        honestly, to only sell work you own, and to follow our content policy.
      </p>
    </main>
  );
}
