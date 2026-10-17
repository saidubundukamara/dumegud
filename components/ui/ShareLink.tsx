"use client";

import { AnimatePresence, m } from "motion/react";
import { CheckIcon, CopyIcon, ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr";
import { useState, useSyncExternalStore } from "react";
import { buttonClasses, type ButtonVariant } from "./button-classes";

const noSubscribe = () => () => {};
const canShare = () => typeof navigator.share === "function";

/**
 * Copy a link, and on phones that support it open the native share sheet (WhatsApp, TikTok…).
 * Shows a short "Copied" confirmation in place, announced to screen readers.
 */
export function ShareLink({
  url,
  title,
  text,
  variant = "secondary",
  className = "",
  label = "Copy link",
}: {
  url: string;
  title?: string;
  text?: string;
  variant?: ButtonVariant;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const share = useSyncExternalStore(noSubscribe, canShare, () => false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (in-app browsers): fall back to selecting via prompt-free share.
      if (share) void navigator.share({ url }).catch(() => {});
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <button type="button" onClick={copy} className={buttonClasses(variant, "relative min-w-36")}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={copied ? "done" : "copy"}
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {copied ? <CheckIcon aria-hidden="true" weight="bold" className="size-5" /> : <CopyIcon aria-hidden="true" className="size-5" />}
            {copied ? "Copied" : label}
          </m.span>
        </AnimatePresence>
        <span className="sr-only" aria-live="polite">
          {copied ? "Link copied" : ""}
        </span>
      </button>
      {share ? (
        <button
          type="button"
          onClick={() => void navigator.share({ url, title, text }).catch(() => {})}
          className={buttonClasses(variant === "primary" ? "dark" : "primary")}
        >
          <ShareNetworkIcon aria-hidden="true" className="size-5" />
          Share
        </button>
      ) : null}
    </div>
  );
}
