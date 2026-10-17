"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { initialFormState } from "@/lib/form-state";
import { markShoutoutPosted } from "./actions";

/** Editable caption with a copy button. Edits stay in the browser: the creator posts it themselves. */
export function CaptionEditor({ caption }: { caption: string }) {
  const [text, setText] = useState(caption);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="caption" className="font-semibold">
        Caption
      </label>
      <textarea
        id="caption"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCopied(false);
        }}
        rows={Math.min(14, text.split("\n").length + 2)}
        className="min-h-12 w-full rounded-brand bg-surface-muted px-4 text-[1.0625rem] ring-1 ring-transparent transition-[box-shadow,background-color] duration-200 ease-brand hover:ring-border-strong focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus py-2"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClasses("primary")}
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
          {copied ? "Copied. Paste it into your post." : ""}
        </span>
      </div>
    </div>
  );
}

type MarkPostedProps = {
  period: string;
  platform: string;
  style: string;
  includeTop: boolean;
  exclude: string[];
  reviewed: string[];
};

/** "I've posted it": clears the waiting list for everyone reviewed here. */
export function MarkPostedForm({ period, platform, style, includeTop, exclude, reviewed }: MarkPostedProps) {
  const [state, action] = useActionState(markShoutoutPosted, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="style" value={style} />
      {includeTop ? <input type="hidden" name="includeTop" value="1" /> : null}
      {exclude.map((id) => (
        <input key={`x-${id}`} type="hidden" name="exclude" value={id} />
      ))}
      {reviewed.map((id) => (
        <input key={`r-${id}`} type="hidden" name="reviewed" value={id} />
      ))}
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SubmitButton variant="secondary" pendingLabel="Saving…" className="self-start">
        I&apos;ve posted it
      </SubmitButton>
      <p className="text-sm text-muted">These supporters stop showing as waiting for a thank-you.</p>
    </form>
  );
}
