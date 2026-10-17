import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-24 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">403</p>
      <h1 className="text-3xl font-bold tracking-tight">You don&apos;t have access to this page</h1>
      <Link href="/dashboard" className="font-semibold underline underline-offset-4">
        Go to your dashboard
      </Link>
    </main>
  );
}
