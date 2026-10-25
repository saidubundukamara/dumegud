import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRightIcon, CaretRightIcon, ConfettiIcon, HourglassMediumIcon, StorefrontIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui/Alert";
import { StatusChip } from "@/components/ui/Badge";
import { Card, Panel } from "@/components/ui/Card";
import { ShareLink } from "@/components/ui/ShareLink";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/button-classes";
import { quoteSplit } from "@/lib/fees";
import { LICENSE_SUMMARIES } from "@/lib/license";
import { formatSLECompact } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import type { OwnProfileDTO } from "@/server/services/CreatorService";
import type { OwnProductDTO, ReadinessItem } from "@/server/services/ProductService";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONES, productPath } from "../labels";
import { Unpublish } from "../status-forms";
import { BackLink, Checklist, PageNotLiveNotice, type ChecklistEntry } from "../ui";

export const metadata: Metadata = { title: "Product" };

export default function ProductOverviewPage({ params }: PageProps<"/dashboard/products/[productId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: Pick<PageProps<"/dashboard/products/[productId]">, "params">) {
  const { actor } = await verifySession();
  const { productId } = await params;
  const [product, readiness, categories, settings, profile] = await Promise.all([
    services.products.getOwn(actor, productId),
    services.products.readiness(actor, productId),
    services.creators.listCategories(),
    services.settings.get(),
    services.creators.getOwnProfile(actor),
  ]);
  const pageLive = profile?.status === "published";
  const files = product.assets.filter((a) => a.kind === "file" && a.status !== "uploading" && a.status !== "rejected");
  const previews = product.assets.filter((a) => a.kind === "preview_image" && a.status === "clean");
  const net = quoteSplit(product.priceMinor, settings.monimeCollectionBpsEstimate, settings.productFeeBps).creatorNetMinor;
  const category = categories.find((c) => c.id === product.categoryId)?.name;

  return (
    <>
      <div className="flex flex-col gap-3">
        <BackLink href="/dashboard/products">Products</BackLink>
        <div className="flex flex-col items-start gap-2">
          {product.status === "published" && !pageLive ? (
            <StatusChip tone="warning">Waiting for your page</StatusChip>
          ) : (
            <StatusChip tone={PRODUCT_STATUS_TONES[product.status]}>{PRODUCT_STATUS_LABELS[product.status]}</StatusChip>
          )}
          <h1 className="text-title line-clamp-3 break-words text-balance">{product.title}</h1>
        </div>
      </div>

      {/* Approved products on a draft or hidden page get their own card below instead. */}
      {product.status === "suspended" || (product.status === "published" && profile?.status !== "suspended") ? null : (
        <PageNotLiveNotice pageStatus={profile?.status} />
      )}
      <StatusHero product={product} readiness={readiness} pageStatus={profile?.status} />

      <Panel as="section" aria-label="Product details" className="divide-y divide-border">
        <Row label="Price" href={productPath(product.id, "details")} action="Edit">
          <span className="tabular-nums">{formatSLECompact(product.priceMinor)}</span>
          <span className="block text-sm font-normal text-muted">You get about {formatSLECompact(net)} per sale</span>
        </Row>
        <Row label="Licence" href={productPath(product.id, "details")} action="Edit">
          {LICENSE_SUMMARIES[product.licenseType].label}
          {category ? <span className="block text-sm font-normal text-muted">{category}</span> : null}
        </Row>
        <Row label="Files" href={productPath(product.id, "files")} action="Manage">
          {files.length ? `${files.length} ${files.length === 1 ? "file" : "files"}` : <span className="text-muted">No file yet</span>}
          <span className="block text-sm font-normal text-muted">
            {previews.length ? `${previews.length} preview ${previews.length === 1 ? "image" : "images"}` : "No preview images"}
          </span>
        </Row>
      </Panel>

      {product.status === "published" || product.status === "pending_review" ? (
        <section className="flex flex-col gap-2 pt-2">
          <p className="text-sm text-muted">
            {product.status === "published"
              ? "Hiding takes it out of your shop. Earlier buyers keep their downloads."
              : "Changed your mind? Withdraw it and keep editing."}
          </p>
          <Unpublish productId={product.id} inReview={product.status === "pending_review"} />
        </section>
      ) : null}
    </>
  );
}

function StatusHero({ product, readiness, pageStatus }: { product: OwnProductDTO; readiness: ReadinessItem[]; pageStatus: OwnProfileDTO["status"] | undefined }) {
  const note = product.reviewNote ? <Alert tone="warning">From our review: {product.reviewNote}</Alert> : null;

  // Approved, but products are only on sale while the creator's page is live.
  if (product.status === "published" && pageStatus === "suspended") return null;
  if (product.status === "published" && pageStatus !== "published") {
    return (
      <Card inner="flex flex-col gap-5 p-5 sm:p-7" className="animate-rise">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warning-surface text-warning">
            <StorefrontIcon weight="duotone" className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">Approved. Make your page live to start selling</h2>
            <p className="text-muted">
              Products go on sale only while your page is live. Until then nobody can see or buy this one. Make your page live and it goes on sale
              straight away.
            </p>
          </div>
        </div>
        <Link href="/dashboard" className={buttonClasses("primary", "w-full sm:w-fit")}>
          Make your page live
          <CaretRightIcon aria-hidden="true" weight="bold" className="size-4" />
        </Link>
      </Card>
    );
  }

  if (product.status === "published") {
    const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
    const url = `${base}/p/${product.id}`;
    return (
      <Card inner="flex flex-col gap-5 p-5 sm:p-7" className="animate-rise">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary-foreground">
            <ConfettiIcon weight="duotone" className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">It&apos;s on sale</h2>
            <p className="text-muted">Share the link on WhatsApp, TikTok or your status. Buyers pay with mobile money and get the file straight away.</p>
          </div>
        </div>
        <ShareLink url={url} title={product.title} variant="primary" />
        <Link href={`/p/${product.id}`} className="inline-flex min-h-11 w-fit items-center gap-1.5 font-semibold text-muted hover:text-text">
          See product page <ArrowUpRightIcon aria-hidden="true" weight="bold" className="size-4" />
        </Link>
      </Card>
    );
  }

  if (product.status === "pending_review") {
    return (
      <Card inner="flex items-start gap-4 p-5 sm:p-7" className="animate-rise">
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warning-surface text-warning">
          <HourglassMediumIcon weight="duotone" className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold">We&apos;re checking it</h2>
          <p className="text-muted">Our team reviews every product before it goes on sale. When it&apos;s approved, its status here changes to Live and you can share it.</p>
        </div>
      </Card>
    );
  }

  if (product.status === "suspended") {
    return (
      <Card inner="flex flex-col gap-3 p-5 sm:p-7" className="animate-rise">
        <h2 className="text-2xl font-bold">This product is suspended</h2>
        <p className="text-muted">It can&apos;t be bought right now. Contact support if you think this is a mistake.</p>
        {note}
      </Card>
    );
  }

  // Draft or hidden: still being set up.
  const items: ChecklistEntry[] = [
    { key: "details", label: "Describe your product", done: true },
    ...readiness.map((i) => ({ ...i, href: i.key === "file" ? productPath(product.id, "files") : ("/dashboard" as Route) })),
  ];
  const next: Route = readiness.find((i) => i.key === "file" && !i.done) ? productPath(product.id, "files") : productPath(product.id, "publish");
  return (
    <Card inner="flex flex-col gap-5 p-5 sm:p-7" className="animate-rise">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">{product.status === "unpublished" ? "Hidden from your shop" : "Finish setting up"}</h2>
        <p className="text-muted">
          {product.status === "unpublished"
            ? "Nobody can buy it right now. Send it for review again to put it back on sale."
            : "Nobody can see it until it's sent for review and approved."}
        </p>
      </div>
      {note}
      <Checklist items={items} label="Product setup" />
      <Link href={next} className={buttonClasses("primary", "w-full sm:w-fit")}>
        {next.endsWith("/files") ? "Continue: add your file" : "Continue: send for review"}
        <CaretRightIcon aria-hidden="true" weight="bold" className="size-4" />
      </Link>
    </Card>
  );
}

function Row({ label, href, action, children }: { label: string; href: Route; action: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-muted">{label}</span>
        <span className="break-words font-semibold">{children}</span>
      </div>
      <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {action}
        <span className="sr-only"> {label.toLowerCase()}</span>
      </Link>
    </div>
  );
}
