import { handleFormatError, normalizeHandle } from "@/lib/handle";
import { clip, displayUrl, loadPhoto, OG_CONTENT_TYPE, OG_SIZE, renderShareCard } from "@/server/og/share-card";
import { getCachedPublicProfile } from "@/server/queries/public-profile";

// The card people see when a creator's link is shared on WhatsApp, Facebook, X and so on.

export const alt = "A creator's page on DuMeGud";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const AVATAR = 260;

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const result = handleFormatError(normalizeHandle(handle)) ? null : await getCachedPublicProfile(handle);
  const profile = result?.kind === "found" ? result.profile : null;

  if (!profile) {
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

  const photo = await loadPhoto(profile.avatarUrl, AVATAR * 2);
  const firstName = profile.displayName.trim().split(/\s+/)[0] || profile.displayName;
  const meta = [`@${profile.handle}`, profile.categoryName].filter(Boolean).join("  ·  ");

  return renderShareCard({
    cta: `Send ${clip(firstName, 18)} a gift`,
    link: displayUrl(`/${profile.handle}`),
    children: (t) => (
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            width={AVATAR}
            height={AVATAR}
            style={{ borderRadius: AVATAR, border: `8px solid ${t["primary-foreground"]}`, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: AVATAR,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: t.secondary,
              color: t["secondary-foreground"],
              fontSize: 120,
              fontWeight: 700,
              border: `8px solid ${t["primary-foreground"]}`,
            }}
          >
            {profile.displayName.trim().slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            {clip(profile.displayName, 40)}
          </div>
          <div style={{ display: "flex", fontSize: 32, opacity: 0.8 }}>{meta}</div>
          {profile.bio ? (
            <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, opacity: 0.92, marginTop: 8 }}>{clip(profile.bio, 110)}</div>
          ) : null}
        </div>
      </div>
    ),
  });
}
