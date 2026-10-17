// Photo slots for the marketing site. Drop a file into public/images/marketing/ and set its `src`
// (e.g. "/images/marketing/hero-creator.jpg"); until then <PhotoSlot> shows a branded placeholder.
// Prefer real Sierra Leonean creators, with their written permission.

export type PhotoSlotKey = "heroCreator" | "musician" | "artist" | "writer" | "teacher" | "comedian" | "photographer";

export type PhotoSlotInfo = { src: string | null; alt: string; name: string; craft: string };

export const MARKETING_PHOTOS: Record<PhotoSlotKey, PhotoSlotInfo> = {
  heroCreator: { src: null, alt: "A creator smiling with her phone", name: "Aminata K.", craft: "Singer" },
  musician: { src: null, alt: "A musician with a guitar", name: "Musicians", craft: "Music" },
  artist: { src: null, alt: "A painter in her studio", name: "Artists", craft: "Art" },
  writer: { src: null, alt: "A writer with a notebook", name: "Writers", craft: "Books" },
  teacher: { src: null, alt: "A teacher filming a lesson", name: "Teachers", craft: "Lessons" },
  comedian: { src: null, alt: "A comedian on stage", name: "Comedians", craft: "Skits" },
  photographer: { src: null, alt: "A photographer with a camera", name: "Photographers", craft: "Photos" },
};
