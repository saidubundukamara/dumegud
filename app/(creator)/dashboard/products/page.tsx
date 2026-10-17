import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { PRODUCT_STATUS_LABELS } from "./labels";
import { PageSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">Products</h1>
        <Link href="/dashboard/products/new" className={buttonClasses("primary")}>
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
  const products = await services.products.listOwn(actor);
  if (!products.length) return <p className="text-muted">Sell e-books, music, templates or art. Create your first product.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {products.map((p) => (
        <li key={p.id}>
          <Link
            href={`/dashboard/products/${p.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-brand-lg bg-surface shadow-soft ring-1 ring-border p-4 transition-shadow duration-300 ease-brand hover:shadow-lift"
          >
            <span className="font-semibold">{p.title}</span>
            <span className="text-sm text-muted">
              {formatSLE(p.priceMinor)} · {PRODUCT_STATUS_LABELS[p.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
