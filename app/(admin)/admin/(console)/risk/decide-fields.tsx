"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/Field";
import { NoteArea } from "@/app/(admin)/admin/action-form";

const DECISIONS = [
  { value: "dismiss", label: "Close with no action", effect: "Closes the case. Nothing changes for the creator." },
  { value: "request_info", label: "Ask the creator for information", effect: "Keeps the case open while you wait for them." },
  { value: "pause_feature", label: "Pause one feature", effect: "Blocks one feature until it’s lifted, and closes the case. Needs an authenticator code." },
  { value: "restrict", label: "Restrict the whole account", effect: "Blocks receiving, withdrawals, publishing and uploads, and closes the case. Needs an authenticator code." },
  { value: "escalate", label: "Escalate", effect: "Keeps the case open, marked escalated. Nothing changes for the creator." },
  { value: "restore", label: "Lift restrictions", effect: "Lifts every active restriction on this creator and closes the case. Needs an authenticator code." },
] as const;

/**
 * The decision inputs for a case (inside an ActionForm posting to decideCase). One choice at a
 * time: the feature picker shows only for "Pause one feature", and the chosen option says what
 * it will do before the confirm dialog.
 */
export function DecideFields({ pending }: { pending?: { decision: string; feature?: string } | null }) {
  const [decision, setDecision] = useState<string>(pending?.decision ?? "dismiss");
  const chosen = DECISIONS.find((d) => d.value === decision);
  return (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 text-sm font-medium">Decision</legend>
        {DECISIONS.map((d) => (
          <label key={d.value} className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm">
            <input type="radio" name="decision" value={d.value} checked={decision === d.value} onChange={() => setDecision(d.value)} className="size-4 accent-primary" />
            {d.label}
          </label>
        ))}
      </fieldset>
      {chosen ? <p className="text-sm text-muted">{chosen.effect}</p> : null}
      {decision === "pause_feature" ? (
        <SelectField compact name="feature" label="Feature to pause" defaultValue={pending?.feature ?? "receive"}>
          <option value="receive">Receiving support and sales</option>
          <option value="withdraw">Withdrawals</option>
          <option value="publish">Publishing</option>
          <option value="upload">Uploads</option>
        </SelectField>
      ) : null}
      <NoteArea name="notes" label="Notes kept on the case" rows={2} />
    </>
  );
}
