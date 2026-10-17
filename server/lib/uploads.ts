import "server-only";
import { fileTypeFromBuffer } from "file-type";

// Upload rules for product files (implementation.md Phase 5). Admins choose which of these
// extensions are allowed (platform_settings `uploads.allowedTypes`); this table says what
// each one must *actually* be, judged by magic bytes, not by the name or declared type.

export type UploadType = {
  mime: string;
  /** Extensions file-type may report for a genuine file of this type. */
  detected: readonly string[];
  /** Can be stamped with a per-order footer. */
  watermarkable?: boolean;
  /** Allowed as a product preview image. */
  previewImage?: boolean;
};

export const UPLOAD_TYPES: Record<string, UploadType> = {
  pdf: { mime: "application/pdf", detected: ["pdf"], watermarkable: true },
  epub: { mime: "application/epub+zip", detected: ["epub"] },
  mp3: { mime: "audio/mpeg", detected: ["mp3"] },
  wav: { mime: "audio/wav", detected: ["wav"] },
  zip: { mime: "application/zip", detected: ["zip"] },
  png: { mime: "image/png", detected: ["png"], previewImage: true },
  jpg: { mime: "image/jpeg", detected: ["jpg"], previewImage: true },
  jpeg: { mime: "image/jpeg", detected: ["jpg"], previewImage: true },
  webp: { mime: "image/webp", detected: ["webp"], previewImage: true },
};

/** Lowercase extension of a filename, or null. */
export function extensionOf(filename: string): string | null {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : null;
}

/** Display-safe filename: no paths, control characters or quotes; bounded length. */
export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "_").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 120) return cleaned || "file";
  const ext = extensionOf(cleaned);
  return ext ? `${cleaned.slice(0, 110)}.${ext}` : cleaned.slice(0, 120);
}

/** Bytes to read for sniffing (file-type's recommended sample). */
export const SNIFF_BYTES = 4100;

/** True when the first bytes really are a file of this extension's type. */
export async function sniffMatches(ext: string, head: Uint8Array): Promise<boolean> {
  const type = UPLOAD_TYPES[ext];
  if (!type) return false;
  const detected = await fileTypeFromBuffer(head);
  return Boolean(detected && type.detected.includes(detected.ext));
}
