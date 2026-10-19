import { displayUrl, OG_CONTENT_TYPE, OG_SIZE, renderShareCard } from "@/server/og/share-card";

// The default card for every page without its own (home, fees, questions, terms).

export const alt = "DuMeGud: let your fans support you";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return renderShareCard({
    cta: "Make your free page",
    link: displayUrl(),
    children: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02, maxWidth: 960 }}>
          Let your fans support you.
        </div>
        <div style={{ display: "flex", fontSize: 34, opacity: 0.88, maxWidth: 900, lineHeight: 1.35 }}>
          Fans send gifts with Orange Money or AfriMoney. Sell your e-books, music and art too.
        </div>
      </div>
    ),
  });
}
