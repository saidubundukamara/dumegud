// Photo slots for the marketing site. Drop a file into public/images/marketing/ and set its `src`
// (e.g. "/images/marketing/hero-creator.webp"); until then <PhotoSlot> shows a branded placeholder.
// Prefer real Sierra Leonean creators, with their written permission.

export type PhotoSlotKey = "heroCreator" | "heroCutout" | "musician" | "artist" | "writer" | "teacher" | "comedian" | "photographer";

export type PhotoSlotInfo = { src: string | null; alt: string; name: string; craft: string };

export const MARKETING_PHOTOS: Record<PhotoSlotKey, PhotoSlotInfo> = {
  heroCreator: { src: "/images/marketing/hero-creator.webp", alt: "A creator smiling with her phone", name: "Aminata K.", craft: "Singer" },
  // Same photo with the background removed (macOS Vision), for the home hero.
  heroCutout: { src: "/images/marketing/hero-creator-cutout.webp", alt: "A creator smiling with her phone", name: "Aminata K.", craft: "Singer" },
  musician: { src: "/images/marketing/musician.webp", alt: "A musician with a guitar", name: "Musicians", craft: "Music" },
  artist: { src: "/images/marketing/artist.webp", alt: "A painter in her studio", name: "Artists", craft: "Art" },
  writer: { src: "/images/marketing/writer.webp", alt: "A writer with a notebook", name: "Writers", craft: "Books" },
  teacher: { src: "/images/marketing/teacher.webp", alt: "A teacher filming a lesson", name: "Teachers", craft: "Lessons" },
  comedian: { src: "/images/marketing/comedian.webp", alt: "A comedian on stage", name: "Comedians", craft: "Skits" },
  photographer: { src: "/images/marketing/photographer.webp", alt: "A photographer with a camera", name: "Photographers", craft: "Photos" },
};
