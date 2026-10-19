"use client";

// Adapted from React Bits "BlurText" (https://reactbits.dev, MIT). Trimmed to the "blur" effect on
// scroll-into-view, using `m.*` (the app runs LazyMotion strict) and rendering any heading tag.

import { m, useInView } from "motion/react";
import { useRef, type ElementType } from "react";

type Props = {
  text: string;
  as?: ElementType;
  className?: string;
  /** Gap between words, in ms. */
  delay?: number;
  blur?: number;
  distance?: number;
};

const EASE = [0.33, 1, 0.68, 1] as const;

/**
 * Words resolve from a soft blur as the heading scrolls into view. Screen readers get the plain
 * text once; the animated words are hidden from them. With reduced motion the global MotionConfig
 * drops the movement and only the fade remains.
 */
export function BlurText({ text, as: Tag = "h2", className = "", delay = 70, blur = 10, distance = 14 }: Props) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const words = text.split(" ");

  return (
    <Tag ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <m.span
            key={`${word}-${i}`}
            className="inline-block will-change-[transform,filter,opacity]"
            initial={{ filter: `blur(${blur}px)`, opacity: 0, y: distance }}
            animate={
              inView
                ? { filter: ["blur(" + blur + "px)", `blur(${blur / 2}px)`, "blur(0px)"], opacity: [0, 0.5, 1], y: [distance, -distance / 10, 0] }
                : undefined
            }
            transition={{ duration: 0.7, times: [0, 0.5, 1], ease: EASE, delay: (i * delay) / 1000 }}
          >
            {word}
            {i < words.length - 1 ? " " : null}
          </m.span>
        ))}
      </span>
    </Tag>
  );
}
