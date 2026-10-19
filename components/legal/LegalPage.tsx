import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { LEGAL } from "@/lib/legal";

type Section = { id: string; title: string; body: ReactNode };

/**
 * A legal document: title, date, a contents list, then numbered sections. Written to be read on
 * a phone, so it's one column with short paragraphs and a readable measure.
 */
export function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-16 pt-28 sm:px-6 md:pt-36">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-title">{title}</h1>
          <p className="text-sm text-muted">Last updated {LEGAL.updated}</p>
          <div className="text-lg text-muted">{intro}</div>
        </header>

        <Alert tone="warning">
          This is a working draft. It will be reviewed by a lawyer before DuMeGud handles real money, and we&apos;ll tell
          account holders by email if anything important changes.
        </Alert>

        <nav aria-label="On this page" className="rounded-brand-lg bg-surface-muted p-5">
          <h2 className="mb-2 text-sm font-semibold text-muted">On this page</h2>
          <ol className="grid gap-1 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex min-h-9 items-center font-medium hover:text-primary">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="flex scroll-mt-28 flex-col gap-3">
            <h2 id={`${s.id}-h`} className="text-xl font-bold">
              {i + 1}. {s.title}
            </h2>
            <div className="flex max-w-[65ch] flex-col gap-3 leading-relaxed [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
      </article>
    </main>
  );
}
