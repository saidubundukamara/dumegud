"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button-classes";

/**
 * A bottom bar on phones that brings the main action back into the thumb zone once the visitor
 * has scrolled past it. Hidden on larger screens and while the target is on screen.
 */
export function StickyAction({ targetId, label }: { targetId: string; label: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, [targetId]);

  return (
    <AnimatePresence>
      {show ? (
        <m.div
          className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-safe pt-6 md:hidden"
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          exit={{ y: "110%" }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
        >
          <a href={`#${targetId}`} className={buttonClasses("primary", "w-full", "lg")}>
            {label}
          </a>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
