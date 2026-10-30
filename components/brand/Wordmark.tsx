import type { Route } from "next";
import Link from "next/link";
import { WORDMARK_ACCENT_PATHS, WORDMARK_BASE_PATHS, WORDMARK_VIEWBOX } from "@/lib/brand-logo";

type Props = { href?: Route | null; className?: string; tone?: "ink" | "light" };

/**
 * The DuMeGud wordmark. "Du" and "Gud" take the primary colour (white on dark surfaces) and "Me"
 * the secondary, through the token utilities, so the logo follows styles/tokens.css. Sized by
 * height; pass a height utility in `className` to change it.
 */
export function Wordmark({ href = "/", className = "", tone = "ink" }: Props) {
  const mark = (
    <svg
      viewBox={WORDMARK_VIEWBOX}
      className={`block h-[1.625rem] w-auto shrink-0 ${className}`}
      {...(href ? { "aria-hidden": true } : { role: "img", "aria-label": "DuMeGud" })}
    >
      <g className={tone === "light" ? "fill-white" : "fill-primary"}>
        {WORDMARK_BASE_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className="fill-secondary">
        {WORDMARK_ACCENT_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
  if (!href) return mark;
  return (
    <Link href={href} aria-label="DuMeGud home" className="inline-flex min-h-11 items-center rounded-full">
      {mark}
    </Link>
  );
}
