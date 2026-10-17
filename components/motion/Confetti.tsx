"use client";

import { m, useReducedMotion } from "motion/react";
import { useMemo } from "react";

const COLORS = ["var(--color-primary)", "var(--color-celebrate)", "var(--color-accent)", "var(--color-primary-soft)"];

/** A short, one-shot burst of brand-coloured paper. Decorative only; skipped for reduced motion. */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  // Deterministic spread (no Math.random) so server and client markup agree.
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2;
        const dist = 90 + ((i * 37) % 70);
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.7 - 40,
          r: ((i * 53) % 360) - 180,
          color: COLORS[i % COLORS.length],
          w: i % 3 === 0 ? 10 : 6,
          delay: (i % 6) * 0.025,
        };
      }),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible">
      {bits.map((b, i) => (
        <m.span
          key={i}
          className="absolute block h-2.5 rounded-[2px]"
          style={{ width: b.w, background: b.color }}
          initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], x: b.x, y: [0, b.y, b.y + 120], rotate: b.r, scale: 1 }}
          transition={{ duration: 1.6, delay: 0.15 + b.delay, ease: [0.22, 0.8, 0.3, 1], times: [0, 0.15, 0.6, 1] }}
        />
      ))}
    </div>
  );
}
