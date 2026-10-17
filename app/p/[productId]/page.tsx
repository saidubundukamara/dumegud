import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { getCachedProduct } from "@/server/queries/public-profile";
import { BuyForm } from "./buy-form";

type Props = PageProps<"/p/[productId]">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(params: Props["params"]) {
  const { productId } = await params;
  return UUID.test(productId) ? getCachedProduct(productId) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load(params);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const description = product.description.slice(0, 160) || `${product.title} by ${product.creator.displayName} on DuMeGud.`;
  return {
    title: product.title,
    description,
    openGraph: { title: product.title, description, images: product.previews.slice(0, 1) },
  };
}

export default function ProductPage({ params }: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          DuMeGud
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-16 pt-4 sm:px-6">
        <Suspense fallback={<div className="h-64 rounded-brand bg-surface" aria-busy="true" />}>
          <Product params={params} />
        </Suspense>
      </main>
    </div>
  );
}

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function Product({ params }: Pick<Props, "params">) {
  const product = await load(params);
  if (!product) notFound();

  return (
    <article className="flex flex-col gap-6">
      {product.previews[0] ? (
        <Image
          src={product.previews[0]}
          alt=""
          width={1200}
          height={900}
          unoptimized
          fetchPriority="high"
          className="h-auto w-full rounded-brand border border-border object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{product.title}</h1>
        <p className="text-muted">
          by{" "}
          <Link href={`/${product.creator.handle}`} className="font-semibold text-text underline underline-offset-4">
            {product.creator.displayName}
          </Link>
        </p>
        <p className="text-2xl font-bold">{formatSLE(product.priceMinor)}</p>
      </div>

      {product.description ? <p className="whitespace-pre-line leading-7">{product.description}</p> : null}

      {/* PRD §4.3: format, size, terms, limits and watermarking are shown before purchase. */}
      <section className="flex flex-col gap-2 rounded-brand bg-surface p-4" aria-labelledby="what-you-get">
        <h2 id="what-you-get" className="font-bold">
          What you get
        </h2>
        <ul className="list-inside list-disc">
          {product.files.map((f, i) => (
            <li key={i}>
              {f.format} file, {size(f.sizeBytes)}
            </li>
          ))}
        </ul>
        <p>
          Download up to {product.downloadLimit} times within {product.accessDays} days of purchase.
        </p>
        {product.watermarked ? (
          <p className="text-sm text-muted">PDFs are marked with your order number (not your name or email).</p>
        ) : null}
        <h3 className="mt-2 font-bold">Licence: {product.license.label}</h3>
        <p className="text-sm">{product.license.summary}</p>
        {product.license.extra ? <p className="whitespace-pre-line text-sm">{product.license.extra}</p> : null}
      </section>

      <BuyForm productId={product.id} priceMinor={product.priceMinor} />
    </article>
  );
}
