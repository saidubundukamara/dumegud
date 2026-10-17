"use client";

import { m, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "./easing";

const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_OUT } },
};

type Props = { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "ul" };

/** Fades content up once as it scrolls into view. Use below the fold only (see animate-rise). */
export function Reveal({ children, className, delay = 0, as = "div" }: Props) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={item}
      transition={{ delay }}
    >
      {children}
    </Tag>
  );
}

/** A parent that staggers its `<StaggerItem>` children. */
export function Stagger({ children, className, as = "div", gap = 0.08 }: Props & { gap?: number }) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "div" }: Omit<Props, "delay">) {
  const Tag = m[as];
  return (
    <Tag className={className} variants={item}>
      {children}
    </Tag>
  );
}
