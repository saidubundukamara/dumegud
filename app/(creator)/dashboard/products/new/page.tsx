import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { pricingOf } from "../labels";
import { ProductForm } from "../product-form";
import { BackLink, StepHeading, Stepper } from "../ui";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <BackLink href="/dashboard/products">Products</BackLink>
        <StepHeading title="Describe your product">Three quick steps: describe it, add the file, then send it for review.</StepHeading>
      </div>
      <Stepper current="details" />
      <Suspense fallback={<PageSkeleton />}>
        <NewProduct />
      </Suspense>
    </>
  );
}

async function NewProduct() {
  await verifySession();
  const [categories, settings] = await Promise.all([services.creators.listCategories(), services.settings.get()]);
  return (
    <ProductForm
      live={false}
      categories={categories}
      pricing={pricingOf(settings)}
      back={{ href: "/dashboard/products", label: "Cancel" }}
      submitLabel="Continue"
      initial={{ title: "", description: "", categoryId: "", price: "", licenseType: "personal", licenseText: "" }}
    />
  );
}
