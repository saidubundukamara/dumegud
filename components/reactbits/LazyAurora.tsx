"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const Aurora = dynamic(() => import("./Aurora"), { ssr: false });

type Colors = { stops: string[]; fine: boolean };

/**
 * A quiet aurora behind a panel, loaded only when the panel comes near the viewport (it is WebGL and
 * sits at the bottom of the page). Colours come from the brand tokens, so a palette change carries
 * over. Until it loads, or without WebGL2, the panel's own background shows through.
 */
export function LazyAurora({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<Colors | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let idle = 0;
    const hasIdle = typeof window.requestIdleCallback === "function"; // missing in older Safari
    const start = () => {
      const css = getComputedStyle(document.documentElement);
      const token = (name: string) => css.getPropertyValue(name).trim();
      setColors({
        stops: [token("--dmg-secondary"), token("--dmg-primary-soft"), token("--dmg-secondary")],
        fine: window.matchMedia("(pointer: fine)").matches,
      });
    };
    // Compiling the shader blocks the main thread for a moment, so begin well before the panel is
    // on screen and only when the browser is idle, never in the middle of a scroll frame.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        idle = hasIdle ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 200);
      },
      { rootMargin: "1000px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`}>
      {colors ? (
        <div className="size-full animate-[dmg-fade-in_1.2s_var(--dmg-ease-out)_both]">
          <Aurora
            colorStops={colors.stops}
            amplitude={0.7}
            blend={0.7}
            speed={0.45}
            height={0.32}
            glow={0.4}
            brightness={0.7}
            opacity={0.5}
            layers={2}
            mouseInteraction={colors.fine}
          />
        </div>
      ) : null}
    </div>
  );
}
