import { formatSLECompact } from "@/lib/money";
import { clip, displayUrl, loadPhoto, OG_CONTENT_TYPE, OG_SIZE, renderShareCard } from "@/server/og/share-card";
import { getCachedProduct } from "@/server/queries/public-profile";

// The card shown when a product link is shared: title, price, creator, and the first preview.

export const alt = "A product on DuMeGud";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW = 320;

export default async function Image({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = UUID.test(productId) ? await getCachedProduct(productId) : null;

  if (!product) {
    return renderShareCard({
      cta: "Make your free page",
      link: displayUrl(),
      children: () => (
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, maxWidth: 900 }}>
          Let your fans support you.
        </div>
      ),
    });
  }

  const preview = await loadPhoto(product.previews[0], PREVIEW * 2);

  return renderShareCard({
    cta: `Buy for ${formatSLECompact(product.priceMinor)}`,
    link: displayUrl(`/${product.creator.handle}`),
    children: (t) => (
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        {preview ? (
          <img
            src={preview}
            alt=""
            width={PREVIEW}
            height={PREVIEW}
            style={{ borderRadius: 32, border: `6px solid ${t["primary-foreground"]}`, objectFit: "cover" }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: preview ? 64 : 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            {clip(product.title, preview ? 60 : 80)}
          </div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.85 }}>by {clip(product.creator.displayName, 40)}</div>
        </div>
      </div>
    ),
  });
}
