import {
  BookOpenIcon,
  CameraIcon,
  ChalkboardTeacherIcon,
  MaskHappyIcon,
  MusicNotesIcon,
  PaintBrushIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { MARKETING_PHOTOS, type PhotoSlotKey } from "@/lib/marketing-images";

const CRAFT_ICONS: Partial<Record<PhotoSlotKey, typeof MusicNotesIcon>> = {
  musician: MusicNotesIcon,
  artist: PaintBrushIcon,
  writer: BookOpenIcon,
  teacher: ChalkboardTeacherIcon,
  comedian: MaskHappyIcon,
  photographer: CameraIcon,
};

/**
 * A marketing photo, or a deliberate branded tile until the real photo is supplied
 * (see lib/marketing-images.ts). The tile is decorative.
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
  const Icon = CRAFT_ICONS[slot];
  if (!Icon) {
    // Person slot (e.g. the hero avatar): the same initial avatar real pages show without a photo.
    return (
      <div aria-hidden="true" className={`flex items-center justify-center bg-primary font-display font-bold text-white ${className}`}>
        <span className="text-[2em]">{photo.name.slice(0, 1)}</span>
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center overflow-hidden bg-[radial-gradient(90%_70%_at_30%_20%,var(--color-primary-soft),transparent_70%)] bg-surface ${className}`}
    >
      <span className="flex size-20 items-center justify-center rounded-full bg-primary text-white shadow-primary">
        <Icon weight="duotone" className="size-10" />
      </span>
    </div>
  );
}
