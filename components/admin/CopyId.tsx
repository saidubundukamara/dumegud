"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

/** A monospaced id with a copy button. Shows the short form unless `full`. */
export function CopyId({ value, full = false, label = "Copy" }: { value: string; full?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the id is still selectable.
    }
  }
  return (
    <span className="relative z-10 inline-flex min-w-0 max-w-full items-center gap-1 align-middle">
      <code title={value} className={`min-w-0 font-mono text-[0.8125rem] text-text ${full ? "break-all" : "truncate"}`}>
        {full ? value : value.slice(0, 8)}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `${label} ${value}`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-brand-sm text-muted transition-colors hover:bg-surface-muted hover:text-text"
      >
        {copied ? <CheckIcon aria-hidden="true" weight="bold" className="size-3.5 text-success" /> : <CopyIcon aria-hidden="true" className="size-3.5" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
