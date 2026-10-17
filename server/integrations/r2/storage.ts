import "server-only";

/** The object-storage operations our services need. R2 in production; an in-memory fake in tests. */
export interface ObjectStorage {
  /** URL a browser can PUT exactly this content type and length to, valid for `expiresInSeconds`. */
  presignPut(input: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<string>;
  /** Object bytes, or null when missing. Throws if larger than `maxBytes`. */
  getObject(bucket: string, key: string, maxBytes: number): Promise<{ body: Uint8Array; contentType?: string } | null>;
  putObject(input: { bucket: string; key: string; body: Uint8Array; contentType: string; cacheControl?: string }): Promise<void>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super("Object exceeds the size limit");
    this.name = "ObjectTooLargeError";
  }
}
