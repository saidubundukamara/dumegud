"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatSLE, formatSLECompact } from "@/lib/money";

/**
 * Counts a money amount up from zero when it scrolls into view. The final value is rendered on the
 * server and kept for screen readers, so nothing is lost without JS.
 */
export function CountUp({ minor, className, compact = false }: { minor: number; className?: string; compact?: boolean }) {
  const format = compact ? formatSLECompact : formatSLE;
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(minor);

  useEffect(() => {
    if (!inView || reduce || minor <= 0) return;
    const controls = animate(0, minor, {
      duration: 1.1,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce, minor]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(minor)}</span>
    </span>
  );
}
