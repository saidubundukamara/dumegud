"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The scrolling tab row: on load it brings the current tab into view (phones hide the later ones). */
export function TabStrip({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    // Scroll the strip only, never the page.
    const n = nav.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2;
  });
  return (
    <nav ref={ref} aria-label={label} className={className}>
      {children}
    </nav>
  );
}
