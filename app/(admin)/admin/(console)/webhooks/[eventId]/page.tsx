import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { CopyId } from "@/components/admin/CopyId";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { RawJson } from "@/components/admin/Timeline";
import { formatDateTime } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { replayWebhook } from "@/app/(admin)/admin/ops-actions";
import { AuditTrail } from "../../audit-trail";
import { orNotFound } from "../../load";

export const metadata: Metadata = { title: "Webhook event" };

export default function WebhookEventPage({ params }: PageProps<"/admin/webhooks/[eventId]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="Webhook event" back={{ href: adminHref("/admin/webhooks"), label: "Webhooks & jobs" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/webhooks/[eventId]">, "params">) {
  const { actor } = await requirePermission("webhooks.view");
  const { eventId } = await params;
  if (!isUuid(eventId)) notFound();
  const e = await orNotFound(services.admin.webhookEvent(actor, eventId));
  const replayable = e.status === "failed" || e.status === "dead";
  return (
    <AdminPage
      title={<code className="font-mono text-[1.25rem]">{e.eventName}</code>}
      back={{ href: adminHref("/admin/webhooks"), label: "Webhooks & jobs" }}
      meta={
        <>
          <StatusBadge status={e.status} label={e.status === "dead" ? "Gave up" : undefined} />
          <span>Received {formatDateTime(e.receivedAt)}</span>
        </>
      }
      actions={
        replayable && can(actor, "webhooks.replay") ? (
          <ActionForm
            action={replayWebhook}
            hidden={{ eventId: e.id }}
            label="Replay"
            variant="primary"
            pendingLabel="Replaying…"
            confirm={{ title: "Replay this event?", body: "It runs through the same handler again. Handlers are idempotent, so money that already moved doesn’t move twice." }}
          />
        ) : null
      }
    >
      {e.lastError ? (
        <Section title="Last error">
          <p className="whitespace-pre-wrap font-mono text-[0.8125rem] text-danger">{e.lastError}</p>
        </Section>
      ) : null}
      <Section title="Details">
        <KeyValue
          columns={3}
          items={[
            ["Monime event id", <CopyId key="p" value={e.providerEventId} full />],
            ["Object", e.objectType ? `${e.objectType}` : "None"],
            ["Object id", e.objectId ? <CopyId key="o" value={e.objectId} full /> : "None"],
            ["Tries", String(e.attempts)],
            ["Claimed", formatDateTime(e.claimedAt)],
            ["Processed", e.processedAt ? formatDateTime(e.processedAt) : "Not yet"],
          ]}
        />
      </Section>
      <Section title="Payload" description="Exactly as Monime sent it. Monime masks phone numbers.">
        <RawJson value={e.payload} label="Show payload" open />
      </Section>
      <AuditTrail actor={actor} targetType="webhook_event" targetId={e.id} title="Replays" />
    </AdminPage>
  );
}
