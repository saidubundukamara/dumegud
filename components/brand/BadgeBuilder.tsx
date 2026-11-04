"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { CONTROL } from "@/components/ui/Field";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { BADGE_METRICS, badgeAlt, type BadgeSize } from "@/lib/badge";

const noSubscribe = () => () => {};
const handleFromUrl = () => new URLSearchParams(window.location.search).get("handle") ?? "";

const SIZES: { value: BadgeSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "lg", label: "Large" },
];

/**
 * Lets a creator type their handle and copy a badge for a GitHub README (Markdown), any web page
 * (HTML) or their own site (the script button). The preview shows a sample until the handle is a
 * real, published page.
 */
export function BadgeBuilder({ origin, samples }: { origin: string; samples: Record<BadgeSize, string> }) {
  const inputId = useId();
  // The dashboard links here with ?handle=, so the creator lands on their own badge. Read on the
  // client only: /brand is a static page, so the URL isn't known when it renders.
  const fromUrl = useSyncExternalStore(noSubscribe, handleFromUrl, () => "");
  const [edited, setInput] = useState<string | null>(null);
  const input = edited ?? fromUrl;
  // The section's reveal animation moves the layout after the browser has jumped to the anchor,
  // so jump again once mounted.
  useEffect(() => {
    if (window.location.hash === "#brand-badge") document.getElementById("brand-badge")?.scrollIntoView({ block: "start" });
  }, []);
  const [size, setSize] = useState<BadgeSize>("sm");
  const handle = normalizeHandle(input);
  const formatError = handle ? handleFormatError(handle) : null;
  const valid = Boolean(handle) && !formatError;

  // Wait for typing to pause before asking the server for the live badge.
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setLive(valid ? handle : null), 400);
    return () => clearTimeout(t);
  }, [handle, valid]);
  const [missing, setMissing] = useState<string | null>(null);

  const shown = valid ? handle : "yourhandle";
  const page = `${origin}/${shown}?via=badge`;
  const sizeQuery = size === "sm" ? "" : "?size=lg";
  const image = `${origin}/api/badge/${shown}${sizeQuery}`;
  const alt = badgeAlt(shown);
  const height = BADGE_METRICS[size].height;
  const snippets = [
    { id: "markdown", title: "Markdown", note: "For GitHub READMEs and docs.", code: `[![${alt}](${image})](${page})` },
    {
      id: "html",
      title: "HTML",
      note: "For any web page, blog or email signature.",
      code: `<a href="${page}" target="_blank" rel="noopener"><img src="${image}" alt="${alt}" height="${height}"></a>`,
    },
    {
      id: "script",
      title: "Website button",
      note: "For your own website. GitHub doesn't run scripts, so use the Markdown there.",
      code: `<script src="${origin}/embed/button.js" data-handle="${shown}" data-size="${size}" async></script>`,
    },
  ];

  const preview = live && live === handle && missing !== live ? `${origin}/api/badge/${live}${sizeQuery}` : samples[size];
  const notFound = live !== null && live === handle && missing === live;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-5 rounded-brand-lg bg-surface p-6 ring-1 ring-border">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[0.9375rem] font-semibold">
            Your DuMeGud handle
          </label>
          <input
            id={inputId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="@yourhandle"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={formatError ? true : undefined}
            aria-describedby={formatError ? `${inputId}-error` : undefined}
            className={`${CONTROL} min-h-13`}
          />
          {formatError ? (
            <p id={`${inputId}-error`} className="text-sm font-medium text-danger">
              {formatError}
            </p>
          ) : null}
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[0.9375rem] font-semibold">Size</legend>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSize(s.value)}
                aria-pressed={size === s.value}
                className="min-h-11 rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-border transition-colors hover:ring-border-strong aria-pressed:bg-primary-soft aria-pressed:text-primary aria-pressed:ring-primary"
              >
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-brand bg-surface-muted p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG badge, shown exactly as it embeds. */}
          <img
            src={preview}
            alt={notFound ? "" : alt}
            height={height}
            onError={() => setMissing(live)}
            style={{ height }}
            className="w-auto"
          />
          <p aria-live="polite" className="text-center text-sm text-muted">
            {notFound
              ? "We couldn't find a published page with that handle. Check the spelling, or publish your page first."
              : live && live === handle
                ? "This is your live badge."
                : "Preview. Type your handle to see yours."}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-4">
        {snippets.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-brand-lg bg-surface p-5 ring-1 ring-border">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted">{s.note}</p>
              </div>
              <CopyButton text={s.code} label={`Copy ${s.title}`} />
            </div>
            <pre className="overflow-x-auto rounded-brand bg-surface-muted p-4 font-mono text-sm leading-relaxed">
              <code>{s.code}</code>
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the code is still there to select by hand.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-muted px-3.5 text-sm font-semibold transition-colors hover:bg-primary-soft hover:text-primary"
    >
      {copied ? <CheckIcon aria-hidden="true" weight="bold" className="size-4" /> : <CopyIcon aria-hidden="true" className="size-4" />}
      {copied ? "Copied" : "Copy"}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
