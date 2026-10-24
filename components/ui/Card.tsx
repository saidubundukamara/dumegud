import type { ReactNode } from "react";

type Props = { children: ReactNode; className?: string; inner?: string; id?: string; as?: "div" | "section" | "article" | "li" | "ul" | "ol" };

/**
 * "Double-bezel" card: a faint outer tray with a white core inside it, concentric radii. Use for
 * the one or two hero objects on a screen (support card, balance); plain lists use `Panel`.
 */
export function Card({ children, className = "", inner = "", id, as: Tag = "div" }: Props) {
  return (
    <Tag id={id} className={`rounded-brand-xl bg-text/[0.035] p-1.5 ring-1 ring-border ${className}`}>
      <div className={`rounded-[calc(var(--radius-brand-xl)-0.375rem)] bg-surface shadow-soft ${inner}`}>{children}</div>
    </Tag>
  );
}

/** Flat white surface with a soft shadow, for lists, forms and secondary content. */
export function Panel({ children, className = "", id, as: Tag = "div" }: Omit<Props, "inner">) {
  return <Tag id={id} className={`rounded-brand-lg bg-surface shadow-soft ring-1 ring-border ${className}`}>{children}</Tag>;
}
