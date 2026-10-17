import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import type { FaqItem } from "./faq-content";

/** Accordion built on native <details>: works without JS and opens smoothly where supported. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <details
          key={item.q}
          className="details-smooth group rounded-brand-lg bg-surface shadow-soft ring-1 ring-border open:ring-border-strong"
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-[1.0625rem] font-semibold [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted transition-transform duration-500 ease-brand group-open:rotate-45 group-open:bg-primary-soft group-open:text-primary">
              <PlusIcon aria-hidden="true" weight="bold" className="size-4" />
            </span>
          </summary>
          <p className="px-5 pb-5 text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
