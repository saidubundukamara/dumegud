import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/admin/Badge";
import { Tabs } from "@/components/admin/Tabs";
import { Alert } from "@/components/ui/Alert";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { RawJson, Timeline } from "@/components/admin/Timeline";
import { Field } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatSLE } from "@/lib/money";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can, type AdminActor } from "@/server/services/actor";
import { SETTING_KEYS, settingDefault, type SettingKey } from "@/server/services/PlatformSettingsService";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { updateSetting } from "@/app/(admin)/admin/ops-actions";
import { str } from "../params";
import { GROUP_TABS, groupForSlug, metaFor, SETTING_GROUPS, toInput, type SettingKind } from "./meta";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  return (
    <AdminPage
      title="Settings"
      description="Fees, limits and switches for the whole platform. Each save is kept as a new version, with who made it. Saving needs an authenticator code."
    >
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

/** A stored value in words: "3.00%", "Le 50.00", "On". */
function show(kind: SettingKind, value: unknown) {
  if (value === undefined || value === null) return "Not set";
  switch (kind) {
    case "percent":
      return `${toInput(kind, value)}%`;
    case "money":
      return typeof value === "number" ? formatSLE(value) : String(value);
    case "megabytes":
      return `${toInput(kind, value)} MB`;
    case "hours":
      return `${value} h`;
    case "count":
      return String(value);
    case "toggle":
      return value ? "On" : "Off";
    case "json":
      return Array.isArray(value) ? value.join(", ") : JSON.stringify(value);
  }
}

const INPUT: Record<Exclude<SettingKind, "toggle" | "json">, { prefix?: string; suffix?: string; inputMode: "decimal" | "numeric" }> = {
  percent: { suffix: "%", inputMode: "decimal" },
  money: { prefix: "Le", inputMode: "decimal" },
  megabytes: { suffix: "MB", inputMode: "numeric" },
  hours: { suffix: "hours", inputMode: "numeric" },
  count: { inputMode: "numeric" },
};

async function Settings({ searchParams }: Pick<PageProps<"/admin/settings">, "searchParams">) {
  const { actor } = await requirePermission("settings.view");
  const sp = await searchParams;
  const historyKey = str(sp.history);
  const showHistory = historyKey !== undefined && (SETTING_KEYS as string[]).includes(historyKey);
  // A history link opens on its setting's tab, whatever ?tab says.
  const group = showHistory ? (metaFor(historyKey).group as (typeof SETTING_GROUPS)[number]) : groupForSlug(str(sp.tab));
  const rows = await services.admin.listSettings(actor);
  const stored = new Map(rows.map((r) => [r.key, r]));
  const editable = can(actor, "settings.manage");
  const base = adminHref("/admin/settings");
  const tabHref = (g: (typeof SETTING_GROUPS)[number]) => `${base}?tab=${GROUP_TABS[g].slug}` as Route;
  const valueOf = (key: string) => {
    const row = stored.get(key);
    return row ? row.value : settingDefault(key as SettingKey);
  };
  const withdrawalsPaused = valueOf("payouts.killSwitch") === true;
  const keys = SETTING_KEYS.filter((k) => metaFor(k).group === group);

  return (
    <div className="flex flex-col gap-5">
      {withdrawalsPaused ? (
        <Alert tone="danger">
          <p className="font-semibold">Withdrawals are paused for every creator.</p>
          <p className="text-sm">
            Money stays in their wallets until it’s switched off. {group === "Withdrawals" ? null : <Link href={tabHref("Withdrawals")}>Go to Withdrawals</Link>}
          </p>
        </Alert>
      ) : null}
      <Tabs
        label="Settings sections"
        items={SETTING_GROUPS.filter((g) => SETTING_KEYS.some((k) => metaFor(k).group === g)).map((g) => ({
          href: tabHref(g),
          label: g,
          active: g === group,
        }))}
      />
      <div className={showHistory ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" : "flex flex-col gap-5"}>
        <Section
          title={group}
          description={GROUP_TABS[group].description}
          flush
        >
          <ul className="divide-y divide-border">
            {keys.map((key) => {
              const meta = metaFor(key);
              const row = stored.get(key);
              const value = valueOf(key);
              return (
                <li
                  key={key}
                  id={key}
                  className={`grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-8 ${key === historyKey ? "bg-primary-soft/40" : ""}`}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {meta.label}
                      {row ? null : <Badge>Default</Badge>}
                      {key === "payouts.killSwitch" && value === true ? <Badge tone="danger">Withdrawals paused</Badge> : null}
                    </p>
                    {meta.hint ? <p className="text-[0.8125rem] text-muted">{meta.hint}</p> : null}
                    <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <code className="font-mono">{key}</code>
                      {row ? (
                        <Link
                          href={`${base}?tab=${GROUP_TABS[group].slug}&history=${encodeURIComponent(key)}` as Route}
                          aria-current={key === historyKey ? "true" : undefined}
                          className="font-medium underline-offset-2 hover:text-text hover:underline"
                        >
                          Version {row.version} · history
                        </Link>
                      ) : null}
                    </p>
                  </div>
                  {editable ? (
                    <SettingForm settingKey={key} kind={meta.kind} value={value} version={row?.version ?? 0} label={meta.label} />
                  ) : (
                    <p className="text-sm font-medium tabular-nums md:text-right">{show(meta.kind, value)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
        {showHistory ? (
          // First on phones, so tapping "history" shows it straight away; beside the list on wide screens.
          <div className="order-first xl:order-none">
            <History actor={actor} settingKey={historyKey} closeHref={tabHref(group)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingForm({ settingKey, kind, value, version, label }: { settingKey: string; kind: SettingKind; value: unknown; version: number; label: string }) {
  const hidden = { key: settingKey, version: String(version) };
  if (kind === "toggle") {
    return (
      <ActionForm action={updateSetting} hidden={hidden} label="Save" layout="inline">
        <label className="flex min-h-9 items-center gap-2.5 text-sm">
          <input type="checkbox" name="value" defaultChecked={value === true} className="size-[1.125rem] accent-primary" />
          On
        </label>
      </ActionForm>
    );
  }
  if (kind === "json") {
    return (
      <ActionForm action={updateSetting} hidden={hidden} label="Save" layout="inline">
        <Field compact name="value" label={label} defaultValue={toInput(kind, value)} className="w-full md:w-72 [&_input]:font-mono [&_label]:sr-only" spellCheck={false} autoComplete="off" />
      </ActionForm>
    );
  }
  const input = INPUT[kind];
  return (
    <ActionForm action={updateSetting} hidden={hidden} label="Save" layout="inline">
      <div className="flex min-w-0 items-center gap-2">
        {input.prefix ? <span className="text-sm text-muted">{input.prefix}</span> : null}
        <Field compact name="value" label={label} defaultValue={toInput(kind, value)} inputMode={input.inputMode} autoComplete="off" className="w-32 [&_input]:text-right [&_input]:tabular-nums [&_label]:sr-only" />
        {input.suffix ? <span className="text-sm text-muted">{input.suffix}</span> : null}
      </div>
    </ActionForm>
  );
}

async function History({ actor, settingKey, closeHref }: { actor: AdminActor; settingKey: string; closeHref: Route }) {
  const meta = metaFor(settingKey);
  const rows = await services.admin.settingsHistory(actor, settingKey);
  return (
    <Section
      title={`History: ${meta.label}`}
      description="Every saved version, newest first."
      actions={
        <Link href={closeHref} className={buttonClasses("ghost", "", "sm")}>
          Close
        </Link>
      }
    >
      <Timeline
        empty="No saves yet. The current value is the one the platform was set up with."
        items={rows.map((r) => ({
          id: r.id,
          at: r.createdAt,
          title: `Version ${r.version}: ${show(meta.kind, r.value)}`,
          body: `By ${r.changedByName}`,
        }))}
      />
      {meta.kind === "json" && rows[0] ? <RawJson value={rows[0].value} label="Latest value as JSON" /> : null}
    </Section>
  );
}
