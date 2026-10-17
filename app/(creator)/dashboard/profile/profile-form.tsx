"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { HANDLE_MAX } from "@/lib/handle";
import { MAX_SOCIAL_LINKS, PLATFORM_LABELS, SOCIAL_PLATFORMS, type Platform } from "@/lib/social";
import { saveProfile } from "./actions";

const BIO_MAX = 500;

export type ProfileFormValues = {
  handle: string;
  displayName: string;
  bio: string;
  categoryId: string;
  supportMessageEnabled: boolean;
  links: { platform: Platform; url: string }[];
};

type Props = {
  initial: ProfileFormValues;
  categories: { id: string; name: string }[];
  appHost: string;
  /** ISO date, when a handle change is on cooldown. */
  handleLockedUntil: string | null;
  isNew: boolean;
};

// Controlled inputs: React resets uncontrolled forms after every action, which would wipe
// the creator's edits whenever the server rejects a field.
export function ProfileForm({ initial, categories, appHost, handleLockedUntil, isNew }: Props) {
  const [state, action] = useActionState(saveProfile, initialFormState);
  const [values, setValues] = useState(initial);
  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setLink = (i: number, patch: Partial<ProfileFormValues["links"][number]>) =>
    set("links", values.links.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      <Field
        label="Display name"
        name="displayName"
        required
        maxLength={60}
        autoComplete="name"
        value={values.displayName}
        onChange={(e) => set("displayName", e.target.value)}
        errors={state.fieldErrors?.displayName}
      />

      <Field
        label="Handle"
        name="handle"
        required
        maxLength={HANDLE_MAX}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={values.handle}
        onChange={(e) => set("handle", e.target.value)}
        disabled={Boolean(handleLockedUntil)}
        hint={
          handleLockedUntil
            ? `You can change your handle again on ${handleLockedUntil}.`
            : `Your page: ${appHost}/${values.handle.trim().replace(/^@/, "").toLowerCase() || "yourname"}. ${
                isNew ? "" : "You can change it once every 30 days; the old link keeps working for 90 days."
              }`
        }
        errors={state.fieldErrors?.handle}
      />
      {/* A disabled input isn't submitted; send the current handle unchanged. */}
      {handleLockedUntil ? <input type="hidden" name="handle" value={values.handle} /> : null}

      <TextAreaField
        label="Bio"
        name="bio"
        maxLength={BIO_MAX}
        rows={5}
        value={values.bio}
        onChange={(e) => set("bio", e.target.value)}
        hint={`${values.bio.length}/${BIO_MAX}. Tell supporters what you make and what their support helps with.`}
        errors={state.fieldErrors?.bio}
      />

      <SelectField
        label="Category"
        name="categoryId"
        value={values.categoryId}
        onChange={(e) => set("categoryId", e.target.value)}
        errors={state.fieldErrors?.categoryId}
      >
        <option value="">Choose a category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="supportMessageEnabled"
          className="mt-1 size-5"
          checked={values.supportMessageEnabled}
          onChange={(e) => set("supportMessageEnabled", e.target.checked)}
        />
        <span>
          <span className="font-semibold">Let supporters add a message</span>
          <span className="block text-sm text-muted">Messages show on your dashboard, not publicly.</span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">Links</legend>
        {values.links.map((link, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row">
            <select
              name="linkPlatform"
              aria-label={`Link ${i + 1} platform`}
              className="min-h-12 rounded-brand border border-border bg-background px-3 sm:w-44"
              value={link.platform}
              onChange={(e) => setLink(i, { platform: e.target.value as Platform })}
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
            <input
              name="linkUrl"
              type="url"
              inputMode="url"
              aria-label={`Link ${i + 1} address`}
              placeholder="https://"
              className="min-h-12 flex-1 rounded-brand border border-border bg-background px-3"
              value={link.url}
              onChange={(e) => setLink(i, { url: e.target.value })}
            />
            <button
              type="button"
              className="min-h-12 px-3 font-semibold underline-offset-4 hover:underline"
              onClick={() => set("links", values.links.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        {state.fieldErrors?.links?.length ? (
          <ul className="text-sm text-danger">
            {state.fieldErrors.links.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        {values.links.length < MAX_SOCIAL_LINKS ? (
          <button
            type="button"
            className="self-start font-semibold underline underline-offset-4"
            onClick={() => set("links", [...values.links, { platform: "instagram", url: "" }])}
          >
            Add a link
          </button>
        ) : null}
      </fieldset>

      <SubmitButton className="self-start" pendingLabel="Saving…">
        {isNew ? "Create my page" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
