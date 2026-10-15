export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">Coming soon</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">DuMeGud</h1>
      <p className="max-w-xl text-lg leading-8 text-muted">
        Share your DuMeGud link, get support for your work, and sell your digital creations — no app
        needed for your audience.
      </p>
      <div>
        <span className="inline-flex h-12 items-center rounded-brand bg-primary px-6 font-semibold text-primary-foreground">
          Support creators. Fuel good.
        </span>
      </div>
    </main>
  );
}
