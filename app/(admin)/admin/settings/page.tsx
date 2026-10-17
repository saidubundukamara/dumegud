import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { SETTING_KEYS } from "@/server/services/PlatformSettingsService";
import { ActionForm } from "../action-form";
import { updateRule, updateSetting } from "../ops-actions";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Platform settings</h1>
      <p className="text-muted">Values are JSON. Every change is versioned and audited. Only super admins can edit, after confirming their password.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  const { actor } = await requireRole("staff", "super_admin");
  const [rows, rules] = await Promise.all([services.admin.listSettings(actor), services.admin.listRules(actor)]);
  const editable = actor.role === "super_admin";
  const stored = new Map(rows.map((r) => [r.key, r]));
  return (
    <>
      <ul className="flex flex-col gap-3">
        {SETTING_KEYS.map((key) => {
          const row = stored.get(key);
          return (
            <li key={key} className="flex flex-col gap-2 rounded-brand border border-border p-4">
              <p className="font-semibold">
                {key} <span className="text-sm font-normal text-muted">{row ? `v${row.version}` : "default"}</span>
              </p>
              {editable ? (
                <ActionForm action={updateSetting} hidden={{ key }} label="Save">
                  <textarea
                    name="value"
                    aria-label={`Value for ${key}`}
                    defaultValue={row ? JSON.stringify(row.value) : ""}
                    rows={2}
                    className="rounded-brand border border-border bg-background p-2 font-mono text-sm"
                  />
                </ActionForm>
              ) : (
                <code className="text-sm">{row ? JSON.stringify(row.value) : "(default)"}</code>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="text-2xl font-bold">Risk rules</h2>
      <ul className="flex flex-col gap-3">
        {rules.map((r) => (
          <li key={r.code} className="flex flex-col gap-2 rounded-brand border border-border p-4">
            <p className="font-semibold">
              {r.code} <span className="text-sm font-normal text-muted">{r.description}</span>
            </p>
            {editable ? (
              <ActionForm action={updateRule} hidden={{ code: r.code }} label="Save rule">
                <textarea name="params" aria-label={`Parameters for ${r.code}`} defaultValue={JSON.stringify(r.params)} rows={2} className="rounded-brand border border-border bg-background p-2 font-mono text-sm" />
                <select name="severity" aria-label="Severity" defaultValue={r.severity} className="min-h-10 rounded-brand border border-border bg-background px-3">
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={r.active} className="size-5" /> Active
                </label>
              </ActionForm>
            ) : (
              <code className="text-sm">
                {JSON.stringify(r.params)} · {r.severity} · {r.active ? "active" : "off"}
              </code>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
