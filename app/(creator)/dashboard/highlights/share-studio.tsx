"use client";

import { ArrowClockwiseIcon, CaretDownIcon, DownloadSimpleIcon, ShareNetworkIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { CONTROL } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/button-classes";

type Size = "story" | "square";

const SIZES: { value: Size; label: string; hint: string }[] = [
  { value: "story", label: "Story", hint: "Status, Stories, TikTok" },
  { value: "square", label: "Square", hint: "Posts and chats" },
];

type Card = { src: string; url: string; file: File };

/**
 * Preview, format and share for one highlight card. The PNG is fetched once per format and kept
 * as a File, so Share opens the phone's share sheet straight from the tap (browsers only allow
 * that for a moment after it; waiting on a slow download first would lose it). Without file
 * sharing the card downloads instead. Amounts are off until the creator turns them on.
 */
export function ShareStudio({
  imagePath,
  fileName,
  caption,
  captionWithAmounts,
  alt,
}: {
  /** The image route with its own query, e.g. `/api/recaps/image?month=2026-09`. */
  imagePath: string;
  fileName: string;
  caption: string;
  /** Omit when the card has no amounts to show; the switch is hidden then. */
  captionWithAmounts?: string;
  alt: string;
}) {
  const uid = useId();
  const [size, setSize] = useState<Size>("story");
  const [amounts, setAmounts] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // The caption follows the amounts switch until the creator edits it; after that it's theirs.
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const src = `${imagePath}&size=${size}&amounts=${amounts ? 1 : 0}`;
  const file = `${fileName}-${size}.png`;
  const text = edited ?? (amounts && captionWithAmounts ? captionWithAmounts : caption);
  const ready = card?.src === src;

  // Every card fetched so far, by URL, so flipping formats back never downloads one twice.
  // Object URLs are released when the studio unmounts.
  const cards = useRef(new Map<string, Card>());
  useEffect(() => {
    const all = cards.current;
    return () => all.forEach((c) => URL.revokeObjectURL(c.url));
  }, []);

  useEffect(() => {
    let live = true;
    const known = cards.current.get(src);
    if (known) {
      setCard(known);
      return;
    }
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        if (!live) return;
        const next = { src, url: URL.createObjectURL(blob), file: new File([blob], file, { type: "image/png" }) };
        cards.current.set(src, next);
        setCard(next);
        setFailed(null);
      })
      .catch(() => live && setFailed(src));
    return () => {
      live = false;
    };
  }, [src, file, attempt]);

  async function share() {
    if (!card || !ready) return;
    setStatus("");
    if (!navigator.canShare?.({ files: [card.file] })) {
      Object.assign(document.createElement("a"), { href: card.url, download: card.file.name }).click();
      setStatus("Saved. Look in your Downloads folder to post it.");
      return;
    }
    setBusy(true);
    try {
      await navigator.share({ files: [card.file], text });
    } catch (err) {
      const name = (err as { name?: string }).name;
      // Closing the share sheet isn't a failure.
      if (name === "NotAllowedError") setStatus("Your phone needs one more tap. Press Share again.");
      else if (name !== "AbortError") setStatus("Sharing didn't work this time. Download the card and post it from your phone.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:items-start">
      <div
        className={`relative mx-auto w-full overflow-hidden rounded-brand-lg bg-primary shadow-lift ring-1 ring-border transition-[aspect-ratio] duration-300 ease-brand ${
          size === "story" ? "aspect-[9/16] max-w-[11rem] md:max-w-[15rem]" : "aspect-square max-w-[15rem]"
        }`}
      >
        {card ? (
          // eslint-disable-next-line @next/next/no-img-element -- an in-memory PNG (object URL) from our own route
          <img
            src={card.url}
            alt={alt}
            className={`size-full object-cover transition-opacity duration-300 ease-brand ${ready ? "opacity-100" : "opacity-50"}`}
          />
        ) : null}
        {failed === src ? (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm font-semibold text-primary-foreground"
          >
            <ArrowClockwiseIcon aria-hidden="true" weight="bold" className="size-6" />
            Couldn&apos;t load the card. Tap to try again.
          </button>
        ) : ready ? null : (
          <span role="status" aria-label="Making your card" className="absolute inset-0 flex items-center justify-center text-primary-foreground">
            <Spinner className="size-6" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Format</legend>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1">
            {SIZES.map((s) => (
              <label
                key={s.value}
                className={`flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-full px-3 py-1.5 text-center transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                  size === s.value ? "bg-surface shadow-soft" : "text-muted hover:text-text"
                }`}
              >
                <input type="radio" name={`${uid}-size`} value={s.value} checked={size === s.value} onChange={() => setSize(s.value)} className="sr-only" />
                <span className="text-sm font-semibold leading-tight">{s.label}</span>
                <span className="text-xs leading-tight text-muted">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {captionWithAmounts ? (
          <label className="flex items-start gap-3">
            <input type="checkbox" role="switch" className="mt-1 size-5" checked={amounts} onChange={(e) => setAmounts(e.target.checked)} />
            <span>
              <span className="font-semibold">Show amounts</span>
              <span className="block text-sm text-muted">Off by default. Your fans see counts, not money.</span>
            </span>
          </label>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={share} disabled={!ready || busy} aria-disabled={!ready || busy} className={buttonClasses("primary", "w-full sm:w-auto")}>
            {busy ? <Spinner /> : <ShareNetworkIcon aria-hidden="true" weight="bold" className="size-5" />}
            Share
          </button>
          <a
            href={card && ready ? card.url : src}
            download={file}
            className={buttonClasses("secondary", "w-full sm:w-auto")}
          >
            <DownloadSimpleIcon aria-hidden="true" weight="bold" className="size-5" />
            Download
          </a>
        </div>
        <p aria-live="polite" className="-mt-2 min-h-5 text-sm text-muted">
          {status}
        </p>

        <details className="details-smooth group border-t border-border pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            Caption to post with it
            <CaretDownIcon aria-hidden="true" weight="bold" className="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-sm text-muted">WhatsApp Status sometimes drops the caption, so copy it first and paste it if it&apos;s missing.</p>
            <label htmlFor={`${uid}-caption`} className="sr-only">
              Caption
            </label>
            <textarea
              id={`${uid}-caption`}
              value={text}
              onChange={(e) => {
                setEdited(e.target.value);
                setCopied(false);
              }}
              rows={4}
              className={`min-h-12 py-2 ${CONTROL}`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={buttonClasses("secondary")}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                Copy caption
              </button>
              <span aria-live="polite" className="text-sm text-muted">
                {copied ? "Copied." : ""}
              </span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
