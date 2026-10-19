import Image from "next/image";
import { MARKETING_PHOTOS, type PhotoSlotKey } from "@/lib/marketing-images";

const CRAFTS: PhotoSlotKey[] = ["musician", "artist", "writer", "teacher", "comedian", "photographer"];

/**
 * The creator photos on a slow endless rail. Pauses while hovered or focused; with reduced motion it
 * is a plain swipeable row instead. The second copy of the list is hidden from assistive tech.
 */
export function CraftMarquee() {
  return (
    <div className="group/marquee relative overflow-hidden motion-reduce:overflow-x-auto [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
      <div className="flex w-max animate-marquee gap-4 pr-4 group-hover/marquee:[animation-play-state:paused] group-focus-within/marquee:[animation-play-state:paused] motion-reduce:animate-none sm:gap-6 sm:pr-6">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1 || undefined} aria-label={copy === 0 ? "Kinds of creators" : undefined} className="flex gap-4 sm:gap-6">
            {CRAFTS.map((slot) => {
              const photo = MARKETING_PHOTOS[slot];
              return (
                <li key={slot} className="flex w-52 shrink-0 flex-col gap-3 sm:w-64">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-surface-muted">
                    {photo.src ? <Image src={photo.src} alt={copy === 0 ? photo.alt : ""} fill sizes="256px" className="object-cover" /> : null}
                  </div>
                  <span className="px-1 text-[1.0625rem] font-semibold">{photo.name}</span>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
    </div>
  );
}
