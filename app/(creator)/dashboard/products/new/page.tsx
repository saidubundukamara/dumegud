import type { Metadata } from "next";
import { Suspense } from "react";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <>
      <h1 className="text-title">New product</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <NewProduct />
      </Suspense>
    </>
  );
}

async function NewProduct() {
  await verifySession();
  const categories = await services.creators.listCategories();
  return (
    <ProductForm
      live={false}
      categories={categories}
      initial={{ title: "", description: "", categoryId: "", price: "", licenseType: "personal", licenseText: "" }}
    />
  );
}
