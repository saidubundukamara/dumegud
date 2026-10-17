"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * One provider for the whole app. `LazyMotion` + `m.*` components keep the shipped feature set to
 * `domAnimation` (no layout/drag bundle unless a component asks for it), and every animation obeys
 * the visitor's reduced-motion setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.9 }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
