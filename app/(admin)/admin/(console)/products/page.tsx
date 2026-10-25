import { FileIcon, PackageIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { RecordLink } from "@/components/admin/RecordLink";
import { Tabs } from "@/components/admin/Tabs";
import { formatDateTime, formatRelative } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can, type AdminActor } from "@/server/services/actor";
import { ActionForm, NoteInput } from "@/app/(admin)/admin/action-form";
import { oneOf, str } from "../params";
import { moderateContent } from "../reports/actions";
import { approveProduct, rejectProduct } from "./actions";

export const metadata: Metadata = { title: "Products" };

const TABS = ["pending", "published", "suspended", "unpublished"] as const;
const LABEL = { pending: "Waiting for review", published: "Live", suspended: "Taken down", unpublished: "Unpublished" } as const;

export default function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <AdminPage title="Products" description="New products wait here before buyers can see them. Check the files match the description and price.">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/admin/products">, "searchParams">) {
  const { actor } = await requirePermission("products.view");
  const sp = await searchParams;
  const tab = oneOf(sp.tab, TABS) ?? "pending";
  const base = adminHref("/admin/products");
  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Product status" items={TABS.map((t) => ({ href: (t === "pending" ? base : `${base}?tab=${t}`) as Route, label: LABEL[t], active: t === tab }))} />
      {tab === "pending" ? <Pending actor={actor} /> : <Listed actor={actor} status={tab} cursor={str(sp.cursor)} />}
    </div>
  );
}

const kb = (bytes: number) => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

async function Pending({ actor }: { actor: AdminActor }) {
  const pending = await services.productReview.listPending(actor);
  const labels = await services.admin.creatorLabels(actor, pending.map((p) => p.creatorId));
  const canReview = can(actor, "products.review");
  if (!pending.length) {
    return (
      <Section>
        <EmptyRows icon={PackageIcon} title="No products waiting">
          When a creator submits a product, it shows up here, oldest first.
        </EmptyRows>
      </Section>
    );
  }
  const now = new Date();
  return (
    <ul className="flex flex-col gap-4">
      {pending.map((p) => (
        <li key={p.id}>
          <Section
            title={
              <span className="flex flex-wrap items-baseline gap-x-3">
                {p.title}
                <span className="font-normal tabular-nums text-muted">{formatSLE(p.priceMinor)}</span>
              </span>
            }
            description={
              <>
                By <RecordLink href={can(actor, "creators.view") && adminHref(`/admin/creators/${p.creatorId}`)}>{labels.get(p.creatorId) ?? "Unknown"}</RecordLink> · sent{" "}
                <span title={formatDateTime(p.submittedAt)}>{formatRelative(p.submittedAt, now)}</span>
              </>
            }
          >
            <div className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-3">
                {p.description ? <p className="max-w-[65ch] whitespace-pre-line text-sm">{p.description}</p> : <p className="text-sm text-muted">No description.</p>}
                <ul className="flex flex-col divide-y divide-border rounded-brand-sm ring-1 ring-border">
                  {p.files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                      <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                      <span className="shrink-0 text-muted tabular-nums">{kb(f.sizeBytes)}</span>
                    </li>
                  ))}
                  {!p.files.length ? <li className="px-3 py-2 text-sm text-warning">No file attached. Send it back.</li> : null}
                </ul>
              </div>
              {canReview ? (
                <div className="flex flex-col gap-4 border-t border-border pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                  <ActionForm action={approveProduct} hidden={{ productId: p.id, version: p.version }} label="Approve and publish" variant="primary" pendingLabel="Publishing…" />
                  <ActionForm action={rejectProduct} hidden={{ productId: p.id }} label="Send back" pendingLabel="Sending back…">
                    <NoteInput label="What to fix (the creator sees this)" required />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </Section>
        </li>
      ))}
    </ul>
  );
}

async function Listed({ actor, status, cursor }: { actor: AdminActor; status: "published" | "suspended" | "unpublished"; cursor: string | undefined }) {
  const { rows, next } = await services.productReview.listByStatus(actor, status, cursor);
  const labels = await services.admin.creatorLabels(actor, rows.map((p) => p.creatorId));
  const canModerate = can(actor, "reports.resolve") && status !== "unpublished";
  const canSeeCreators = can(actor, "creators.view");
  return (
    <Section flush>
      <DataTable
        caption={`Products: ${LABEL[status]}`}
        rows={rows}
        rowKey={(p) => p.id}
        columns={[
          { header: "Product", cell: (p) => <span className="font-medium">{p.title}</span> },
          { header: "Creator", cell: (p) => <RecordLink href={canSeeCreators && adminHref(`/admin/creators/${p.creatorId}`)}>{labels.get(p.creatorId) ?? "Unknown"}</RecordLink>, hideBelow: "sm" },
          { header: "Price", cell: (p) => formatSLE(p.priceMinor), align: "right", hideBelow: "sm" },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} />, hideBelow: "md" },
          { header: "Changed", cell: (p) => <span className="whitespace-nowrap text-muted">{formatDateTime(p.updatedAt)}</span>, hideBelow: "lg" },
          ...(canModerate
            ? [
                {
                  header: <span className="sr-only">Action</span>,
                  align: "right" as const,
                  cell: (p: (typeof rows)[number]) => (
                    <ActionForm
                      action={moderateContent}
                      hidden={{ targetType: "product", targetId: p.id, action: status === "suspended" ? "restore" : "suspend" }}
                      label={status === "suspended" ? "Restore" : "Take down"}
                      variant={status === "suspended" ? "secondary" : "ghost"}
                      confirm={
                        status === "suspended"
                          ? { title: `Restore “${p.title}”?`, body: "It comes back unpublished. The creator submits it again and it goes through review.", fields: <NoteInput required /> }
                          : { title: `Take “${p.title}” down?`, body: "Buyers can’t see or buy it from now on. Anyone who bought it keeps their downloads.", confirmLabel: "Take down", danger: true, fields: <NoteInput required /> }
                      }
                    />
                  ),
                },
              ]
            : []),
        ]}
        empty={<EmptyRows icon={PackageIcon} title={`No products ${LABEL[status].toLowerCase()}`} />}
      />
      <Pagination base={adminHref("/admin/products")} params={{ tab: status, cursor }} next={next} shown={rows.length} />
    </Section>
  );
}
