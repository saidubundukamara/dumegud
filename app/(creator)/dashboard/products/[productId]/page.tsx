import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { MINOR_PER_MAJOR } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { AssetManager } from "../asset-manager";
import { PRODUCT_STATUS_LABELS } from "../labels";
import { ProductForm } from "../product-form";
import { SubmitForReview, Unpublish } from "../status-forms";

export const metadata: Metadata = { title: "Edit product" };

export default function EditProductPage({ params }: PageProps<"/dashboard/products/[productId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <EditProduct params={params} />
    </Suspense>
  );
}

async function EditProduct({ params }: Pick<PageProps<"/dashboard/products/[productId]">, "params">) {
  const { actor } = await verifySession();
  const { productId } = await params;
  const [product, categories, settings] = await Promise.all([
    services.products.getOwn(actor, productId),
    services.creators.listCategories(),
    services.settings.get(),
  ]);
  const price = product.priceMinor % MINOR_PER_MAJOR === 0 ? String(product.priceMinor / MINOR_PER_MAJOR) : (product.priceMinor / MINOR_PER_MAJOR).toFixed(2);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{product.title}</h1>
        <p className="text-muted">
          Status: {PRODUCT_STATUS_LABELS[product.status]}
          {product.status === "published" ? (
            <>
              {" · "}
              <Link href={`/p/${product.id}`} className="underline underline-offset-4">
                View product page
              </Link>
            </>
          ) : null}
        </p>
      </div>
      {product.reviewNote ? <Alert tone="warning">Review note: {product.reviewNote}</Alert> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Files buyers get</h2>
        {services.products.uploadsEnabled ? (
          <AssetManager
            productId={product.id}
            kind="file"
            assets={product.assets}
            filesLocked={product.filesLocked}
            accept={settings.allowedUploadTypes.map((t) => `.${t}`).join(",")}
          />
        ) : (
          <p className="text-muted">File uploads aren&apos;t available yet.</p>
        )}
        <p className="text-sm text-muted">
          Allowed: {settings.allowedUploadTypes.join(", ").toUpperCase()}, up to {Math.floor(settings.maxUploadBytes / 1024 / 1024)} MB each.
        </p>
      </section>

      {services.products.uploadsEnabled ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Preview images</h2>
          <AssetManager productId={product.id} kind="preview_image" assets={product.assets} filesLocked={false} accept=".jpg,.jpeg,.png,.webp" />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Details</h2>
        <ProductForm
          live={product.status === "published"}
          categories={categories}
          initial={{
            productId: product.id,
            title: product.title,
            description: product.description,
            categoryId: product.categoryId ?? "",
            price,
            licenseType: product.licenseType,
            licenseText: product.licenseText,
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        {product.status === "draft" || product.status === "unpublished" ? <SubmitForReview productId={product.id} /> : null}
        {product.status === "published" || product.status === "pending_review" ? <Unpublish productId={product.id} /> : null}
      </section>
    </>
  );
}
