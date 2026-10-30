import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { BrandAssetPreview } from "@/components/brand/BrandAssetPreview";
import { Reveal } from "@/components/motion/Reveal";
import { buttonClasses, buttonIconClasses } from "@/components/ui/button-classes";
import {
  BRAND_ASSETS,
  BRAND_KIT_ZIP,
  brandAssetFiles,
  type BrandAsset,
  type BrandAssetKind,
  type BrandBackdrop,
} from "@/lib/brand-kit";
import { pageMetadata } from "@/lib/seo";
import { brandKitUrl, getCachedBrandPalette } from "@/server/lib/brand-kit";

export const metadata: Metadata = pageMetadata({
  title: "Brand assets",
  description: "Download the DuMeGud logo, logomark and app icon as SVG or PNG, with simple rules for using them.",
  path: "/brand",
});

const GROUPS: {
  kind: BrandAssetKind;
  title: string;
  body: string;
  preview: string;
}[] = [
  {
    kind: "wordmark",
    title: "Wordmark",
    body: "Our full name. Use it whenever there's room.",
    preview: "h-auto w-4/5",
  },
  {
    kind: "logomark",
    title: "Logomark",
    body: "The M from our name, on its own. Use it in small spaces where the full name won't fit.",
    preview: "h-24 w-auto sm:h-28",
  },
  {
    kind: "app-icon",
    title: "App icon",
    body: "The logomark on a tile, for square spaces like app icons and profile pictures.",
    preview: "h-24 w-auto sm:h-28",
  },
];

const BACKDROPS: Record<BrandBackdrop, { className: string; label: string }> = {
  light: { className: "bg-surface-muted", label: "For light backgrounds" },
  dark: { className: "bg-accent", label: "For dark backgrounds and photos" },
  primary: {
    className: "bg-primary",
    label: "For maroon and dark backgrounds",
  },
  secondary: { className: "bg-secondary", label: "For orange backgrounds" },
};

const RULES = [
  "Write our name as DuMeGud: one word, with a capital D, M and G.",
  "Leave clear space around the logo, at least as wide as the dot above the M.",
  "Use the colour versions on light backgrounds and the white versions on dark backgrounds or photos.",
  "Don't change the colours, stretch, rotate or outline the logo, or add shadows or other effects.",
  "Keep the wordmark at least 80 pixels wide on screens (20 mm in print), and the logomark at least 24 pixels tall.",
  "Don't use the logo in a way that suggests DuMeGud runs or sponsors your page, event or product unless we've agreed it with you.",
];

export default async function BrandPage() {
  const palette = await getCachedBrandPalette();
  const zipUrl = brandKitUrl(BRAND_KIT_ZIP);
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col px-4 pb-16 pt-28 sm:px-6 md:pt-36">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-20">
        <header className="mx-auto flex max-w-2xl animate-rise flex-col items-center gap-5 text-center">
          <h1 className="text-display">Our logo, ready to use</h1>
          <p className="text-lg text-muted sm:text-xl">
            For creators, press and partners. Put DuMeGud on your posters, videos and stories. Every version comes as SVG and PNG.
          </p>
          {zipUrl ? (
            <a href={zipUrl} download className={buttonClasses("primary", "mt-2", "lg")}>
              Download all logos (ZIP)
              <span className={buttonIconClasses("primary")}>
                <DownloadSimpleIcon weight="bold" className="size-4" />
              </span>
            </a>
          ) : (
            <p className="text-sm text-muted">Downloads aren&apos;t available right now. Please check back soon.</p>
          )}
        </header>

        {GROUPS.map((group) => (
          <section key={group.kind} aria-labelledby={`brand-${group.kind}`}>
            <Reveal className="flex flex-col gap-6">
              <div className="flex max-w-2xl flex-col gap-2">
                <h2 id={`brand-${group.kind}`} className="text-title">
                  {group.title}
                </h2>
                <p className="text-muted">{group.body}</p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {BRAND_ASSETS.filter((a) => a.kind === group.kind).map((asset) => (
                  <AssetCard key={asset.slug} asset={asset} groupTitle={group.title} previewClass={group.preview} />
                ))}
              </ul>
            </Reveal>
          </section>
        ))}

        <section aria-labelledby="brand-colours">
          <Reveal className="flex flex-col gap-6">
            <h2 id="brand-colours" className="text-title">
              Colours
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              <Swatch name="Maroon" hex={palette.primary} className="bg-primary text-primary-foreground" />
              <Swatch name="Orange" hex={palette.secondary} className="bg-secondary text-secondary-foreground" />
            </ul>
          </Reveal>
        </section>

        <section aria-labelledby="brand-rules">
          <Reveal className="flex flex-col gap-6">
            <h2 id="brand-rules" className="text-title">
              Using the logo
            </h2>
            <ul className="grid max-w-3xl list-disc gap-3 pl-5 text-lg marker:text-primary">
              {RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Reveal>
        </section>
      </div>
    </main>
  );
}

function AssetCard({ asset, groupTitle, previewClass }: { asset: BrandAsset; groupTitle: string; previewClass: string }) {
  const backdrop = BACKDROPS[asset.backdrop];
  const files = brandAssetFiles(asset).map((f) => ({
    ...f,
    url: brandKitUrl(f.name),
  }));
  return (
    <li className="flex flex-col overflow-hidden rounded-brand-lg bg-surface ring-1 ring-border">
      <div className={`flex aspect-[16/10] items-center justify-center ${backdrop.className}`}>
        <BrandAssetPreview asset={asset} className={previewClass} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="font-semibold">{asset.label}</h3>
          <p className="text-sm text-muted">{backdrop.label}</p>
        </div>
        {files.some((f) => f.url) ? (
          <ul className="mt-auto flex flex-wrap gap-2">
            {files.map((f) =>
              f.url ? (
                <li key={f.name}>
                  <a
                    href={f.url}
                    download
                    aria-label={`Download the ${asset.label.toLowerCase()} ${groupTitle.toLowerCase()} as ${f.format}${f.size ? `, ${f.size} pixels` : ""}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-muted px-3.5 text-sm font-semibold transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    <DownloadSimpleIcon weight="bold" className="size-4" aria-hidden />
                    {f.format}
                    {f.size ? <span className="font-medium text-muted">{f.size}</span> : null}
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function Swatch({ name, hex, className }: { name: string; hex: string; className: string }) {
  return (
    <li className={`flex flex-col justify-end gap-1 rounded-brand-lg p-6 ${className}`}>
      <span className="text-lg font-semibold">{name}</span>
      <span className="font-mono text-sm uppercase opacity-85">{hex}</span>
    </li>
  );
}
