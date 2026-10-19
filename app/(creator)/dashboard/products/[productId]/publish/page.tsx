import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Card";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { quoteSplit } from "@/lib/fees";
import { LICENSE_SUMMARIES } from "@/lib/license";
import { formatSLECompact } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { inSetup, productPath } from "../../labels";
import { SubmitForReview } from "../../status-forms";
import { BackLink, Checklist, StepHeading, Stepper, type ChecklistEntry } from "../../ui";

export const metadata: Metadata = { title: "Send for review" };

export default function ProductPublishPage({ params }: PageProps<"/dashboard/products/[productId]/publish">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Publish params={params} />
    </Suspense>
  );
}

async function Publish({ params }: Pick<PageProps<"/dashboard/products/[productId]/publish">, "params">) {
  const { actor } = await verifySession();
  const { productId } = await params;
  const [product, readiness, categories, settings] = await Promise.all([
    services.products.getOwn(actor, productId),
    services.products.readiness(actor, productId),
    services.creators.listCategories(),
    services.settings.get(),
  ]);
  const hub = productPath(product.id);
  if (!inSetup(product.status)) redirect(hub);

  const items: ChecklistEntry[] = [
    { key: "details", label: "Describe your product", done: true },
    ...readiness.map((i) => ({ ...i, href: i.key === "file" ? productPath(product.id, "files") : ("/dashboard" as Route) })),
  ];
  const ready = readiness.every((i) => i.done);
  const files = product.assets.filter((a) => a.kind === "file" && a.status !== "uploading" && a.status !== "rejected");
  const net = quoteSplit(product.priceMinor, settings.monimeCollectionBpsEstimate, settings.productFeeBps).creatorNetMinor;
  const category = categories.find((c) => c.id === product.categoryId)?.name;

  return (
    <>
      <div className="flex flex-col gap-3">
        <BackLink href={hub}>{product.title}</BackLink>
        <StepHeading title="Send for review">We check every product before it goes on sale. You&apos;ll see the result on this product&apos;s page.</StepHeading>
      </div>
      <Stepper current="publish" productId={product.id} done={readiness.find((i) => i.key === "file")?.done ? ["details", "files"] : ["details"]} />
      {product.reviewNote ? <Alert tone="warning">From our review: {product.reviewNote}</Alert> : null}

      <Panel as="section" className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-bold">{ready ? "Ready to sell" : "Before you send it"}</h2>
        <Checklist items={items} label="Ready to sell" />
      </Panel>

      <Panel as="section" aria-label="Summary" className="divide-y divide-border">
        <SummaryRow label="Price" edit={productPath(product.id, "details")}>
          <span className="tabular-nums">{formatSLECompact(product.priceMinor)}</span>
          <span className="block text-sm text-muted">You get about {formatSLECompact(net)} per sale</span>
        </SummaryRow>
        <SummaryRow label="Licence" edit={productPath(product.id, "details")}>
          {LICENSE_SUMMARIES[product.licenseType].label}
          {category ? <span className="block text-sm text-muted">{category}</span> : null}
        </SummaryRow>
        <SummaryRow label="Files" edit={productPath(product.id, "files")}>
          {files.length ? files.map((f) => f.filename).join(", ") : <span className="text-muted">None yet</span>}
        </SummaryRow>
      </Panel>

      <SubmitForReview productId={product.id} ready={ready} back={productPath(product.id, "files")} />
    </>
  );
}

function SummaryRow({ label, edit, children }: { label: string; edit: Route; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-muted">{label}</span>
        <span className="break-words font-semibold">{children}</span>
      </div>
      <Link href={edit} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
        Edit<span className="sr-only"> {label.toLowerCase()}</span>
      </Link>
    </div>
  );
}
