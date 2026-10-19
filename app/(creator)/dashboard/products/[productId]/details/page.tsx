import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { inSetup, priceText, pricingOf, productPath } from "../../labels";
import { ProductForm } from "../../product-form";
import { BackLink, StepHeading, Stepper } from "../../ui";

export const metadata: Metadata = { title: "Product details" };

export default function ProductDetailsPage({ params }: PageProps<"/dashboard/products/[productId]/details">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Details params={params} />
    </Suspense>
  );
}

async function Details({ params }: Pick<PageProps<"/dashboard/products/[productId]/details">, "params">) {
  const { actor } = await verifySession();
  const { productId } = await params;
  const [product, categories, settings] = await Promise.all([
    services.products.getOwn(actor, productId),
    services.creators.listCategories(),
    services.settings.get(),
  ]);
  const setup = inSetup(product.status);
  const hub = productPath(product.id);
  const hasFile = product.assets.some((a) => a.kind === "file" && (a.status === "pending" || a.status === "clean"));

  return (
    <>
      <div className="flex flex-col gap-3">
        <BackLink href={hub}>{product.title}</BackLink>
        <StepHeading title={setup ? "Describe your product" : "Edit details"} />
      </div>
      {setup ? <Stepper current="details" productId={product.id} done={hasFile ? ["details", "files"] : ["details"]} /> : null}
      <ProductForm
        live={product.status === "published"}
        categories={categories}
        pricing={pricingOf(settings)}
        next={setup ? "files" : "hub"}
        back={{ href: hub, label: "Cancel" }}
        submitLabel={setup ? "Save and continue" : "Save changes"}
        initial={{
          productId: product.id,
          title: product.title,
          description: product.description,
          categoryId: product.categoryId ?? "",
          price: priceText(product.priceMinor),
          licenseType: product.licenseType,
          licenseText: product.licenseText,
        }}
      />
    </>
  );
}
