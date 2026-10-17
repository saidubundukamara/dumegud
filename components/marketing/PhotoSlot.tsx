import Image from "next/image";
import { MARKETING_PHOTOS, type PhotoSlotKey } from "@/lib/marketing-images";

/**
 * A marketing photo, or a warm branded placeholder until the real photo is supplied
 * (see lib/marketing-images.ts). The placeholder is decorative.
 */
export function PhotoSlot({
  slot,
  className = "",
  sizes = "(min-width: 768px) 33vw, 80vw",
  priority = false,
}: {
  slot: PhotoSlotKey;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const photo = MARKETING_PHOTOS[slot];
  if (photo.src) {
    return (
      <div className={`relative overflow-hidden bg-surface-muted ${className}`}>
        <Image src={photo.src} alt={photo.alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-[radial-gradient(120%_90%_at_20%_10%,var(--color-primary-soft),transparent_60%),radial-gradient(90%_80%_at_90%_100%,color-mix(in_srgb,var(--color-celebrate),transparent_70%),transparent_60%)] bg-surface-muted ${className}`}
    >
      <span className="absolute inset-0 flex items-center justify-center font-display text-[min(30vw,7rem)] font-bold tracking-[-0.06em] text-primary/15">
        {photo.name.slice(0, 1)}
      </span>
    </div>
  );
}
