import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PackageIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { StatusChip } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatSLECompact } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import { CopyLinkButton } from "./copy-link";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONES } from "./labels";
import { PageNotLiveNotice } from "./ui";
import { PageSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">Products</h1>
        <Link href="/dashboard/products/new" className={buttonClasses("primary")}>
          <PlusIcon aria-hidden="true" weight="bold" className="size-4" />
          New product
        </Link>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <ProductList />
      </Suspense>
    </>
  );
}

async function ProductList() {
  const { actor } = await verifySession();
  const [products, profile] = await Promise.all([services.products.listOwn(actor), services.creators.getOwnProfile(actor)]);
  if (!products.length) {
    return (
      <Card inner="flex flex-col items-start gap-4 p-6 sm:p-8" className="animate-rise">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-secondary-soft text-secondary-foreground">
          <PackageIcon weight="duotone" className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold">Sell your first product</h2>
          <p className="text-muted">
            E-books, music, templates, art: anything people can download. Buyers pay with mobile money and get the file straight away.
          </p>
        </div>
        <Link href="/dashboard/products/new" className={buttonClasses("primary", "w-full sm:w-fit")}>
          Create a product
        </Link>
      </Card>
    );
  }

  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  const pageLive = profile?.status === "published";
  return (
    <>
      <PageNotLiveNotice pageStatus={profile?.status} />
      <ul className="flex flex-col gap-2">
        {products.map((p) => (
          <li
            key={p.id}
            className="relative flex items-center gap-3 rounded-brand-lg bg-surface p-3 pr-2 shadow-soft ring-1 ring-border transition-shadow duration-300 ease-brand hover:shadow-lift sm:p-4"
          >
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-brand-sm bg-surface-muted text-muted">
              <PackageIcon weight="duotone" className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`/dashboard/products/${p.id}`} className="truncate font-semibold after:absolute after:inset-0 after:rounded-brand-lg">
                {p.title}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="tabular-nums">{formatSLECompact(p.priceMinor)}</span>
                {p.status === "published" && !pageLive ? (
                  <StatusChip tone="warning">Waiting for your page</StatusChip>
                ) : (
                  <StatusChip tone={PRODUCT_STATUS_TONES[p.status]}>{PRODUCT_STATUS_LABELS[p.status]}</StatusChip>
                )}
              </span>
            </div>
            {p.status === "published" && pageLive ? <CopyLinkButton url={`${base}/p/${p.id}`} title={p.title} /> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
