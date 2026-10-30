import { MARK_PATHS, MARK_VIEWBOX } from "@/lib/brand-logo";

type Props = { className?: string; label?: string };

/**
 * The DuMeGud logomark (the "M" with two dots). It takes the current text colour, so set it with a
 * `text-*` utility. Decorative unless a `label` is given.
 */
export function Logomark({ className = "", label }: Props) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={`block w-auto shrink-0 fill-current ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
