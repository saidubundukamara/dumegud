"use client";

import { CheckIcon, ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";

/** Icon-only share for a list row: the native share sheet on phones, else copy to clipboard. */
export function CopyLinkButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator.share === "function") {
      await navigator.share({ url, title }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked; nothing else to fall back to without a dialog.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={`Share ${title}`}
      className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-secondary-soft hover:text-secondary-foreground"
    >
      {copied ? <CheckIcon aria-hidden="true" weight="bold" className="size-5 text-success" /> : <ShareNetworkIcon aria-hidden="true" className="size-5" />}
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </button>
  );
}
