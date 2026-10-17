import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { getCachedProduct } from "@/server/queries/public-profile";
import { ClockIcon, FileIcon, FlagIcon, ScrollIcon, StampIcon } from "@phosphor-icons/react/dist/ssr";
import { PageGlow, PublicHeader } from "@/components/public/PublicHeader";
import { StickyAction } from "@/components/public/StickyAction";
import { Card, Panel } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
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
    <div className="relative flex flex-1 flex-col">
      <PageGlow />
      <PublicHeader />
      <main id="main" tabIndex={-1} className="relative mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-28 pt-8 sm:px-6 md:pb-16">
        <Suspense
          fallback={
            <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
              <Skeleton className="aspect-[4/3] w-full !rounded-brand-xl" />
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          }
        >
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
    <article className="flex flex-col gap-8">
      <header className="flex animate-rise flex-col gap-5">
        {product.previews[0] ? (
          <Image
            src={product.previews[0]}
            alt=""
            width={1200}
            height={900}
            unoptimized
            fetchPriority="high"
            className="h-auto w-full rounded-brand-xl object-cover shadow-lift"
          />
        ) : null}
        <div className="flex flex-col gap-3">
          <Link
            href={`/${product.creator.handle}`}
            className="w-fit rounded-full bg-surface px-3 py-1 text-sm font-semibold shadow-soft ring-1 ring-border hover:ring-border-strong"
          >
            by {product.creator.displayName}
          </Link>
          <h1 className="text-title">{product.title}</h1>
          <p className="font-display text-3xl font-bold tracking-tight text-primary">{formatSLE(product.priceMinor)}</p>
        </div>
        {product.description ? <p className="whitespace-pre-line text-lg leading-relaxed">{product.description}</p> : null}
      </header>

      {/* PRD §4.3: format, size, terms, limits and watermarking are shown before purchase. */}
      <Panel as="section" className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="what-you-get" className="text-xl font-bold">
          What you get
        </h2>
        <ul className="flex flex-col gap-3" aria-labelledby="what-you-get">
          {product.files.map((f, i) => (
            <Row key={i} icon={<FileIcon weight="duotone" className="size-5" />}>
              {f.format} file, {size(f.sizeBytes)}
            </Row>
          ))}
          <Row icon={<ClockIcon weight="duotone" className="size-5" />}>
            Download up to {product.downloadLimit} times within {product.accessDays} days
          </Row>
          {product.watermarked ? (
            <Row icon={<StampIcon weight="duotone" className="size-5" />}>
              PDFs carry your order number (not your name or email)
            </Row>
          ) : null}
          <Row icon={<ScrollIcon weight="duotone" className="size-5" />}>
            <span className="font-semibold">Licence: {product.license.label}</span>
            <span className="block text-sm text-muted">{product.license.summary}</span>
            {product.license.extra ? <span className="block whitespace-pre-line text-sm text-muted">{product.license.extra}</span> : null}
          </Row>
        </ul>
      </Panel>

      <Card inner="p-5 sm:p-7">
        <section id="buy" aria-labelledby="buy-heading" className="flex scroll-mt-6 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id="buy-heading" className="text-2xl font-bold">
              Get it now
            </h2>
            <p className="text-muted">Pay on your phone. Your download is ready right after.</p>
          </div>
          <BuyForm productId={product.id} priceMinor={product.priceMinor} />
        </section>
      </Card>
      <StickyAction targetId="buy" label={`Buy for ${formatSLE(product.priceMinor)}`} />

      <p className="text-center text-sm">
        <Link
          href={`/report?type=product&id=${product.id}`}
          className="inline-flex min-h-10 items-center gap-1.5 text-muted underline-offset-4 hover:underline"
          prefetch={false}
        >
          <FlagIcon aria-hidden="true" className="size-4" />
          Report this product
        </Link>
      </p>
    </article>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        {icon}
      </span>
      <span className="pt-1.5">{children}</span>
    </li>
  );
}
