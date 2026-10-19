"use client";

// Adapted from React Bits "Magnet" (https://reactbits.dev, MIT). Reworked onto Motion springs:
// one pointermove listener per magnet, no scroll listener, no per-frame React state.

import { m, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** How far outside the element (px) the pull starts. */
  padding?: number;
  /** Higher is weaker: the offset is the pointer distance divided by this. */
  strength?: number;
  className?: string;
};

const SPRING = { stiffness: 170, damping: 16, mass: 0.6 };

/** Pulls its child gently toward a nearby mouse cursor. Off for touch and reduced motion. */
export function Magnet({ children, padding = 60, strength = 6, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const near = Math.abs(dx) < r.width / 2 + padding && Math.abs(dy) < r.height / 2 + padding;
      x.set(near ? dx / strength : 0);
      y.set(near ? dy / strength : 0);
    };
    const reset = () => {
      x.set(0);
      y.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", reset);
    };
  }, [reduce, padding, strength, x, y]);

  return (
    <m.div ref={ref} style={{ x, y }} className={`inline-flex ${className}`}>
      {children}
    </m.div>
  );
}
