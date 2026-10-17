import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { PRODUCT_STATUS_LABELS } from "./labels";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <Link href="/dashboard/products/new" className={buttonClasses("primary")}>
          New product
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
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
            className="flex flex-wrap items-center justify-between gap-2 rounded-brand border border-border p-4 hover:bg-surface"
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
