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
  /** Size and type, or null when missing. */
  headObject(bucket: string, key: string): Promise<{ size: number; contentType?: string } | null>;
  /** Bytes [start, end] inclusive (for magic-byte sniffing without downloading the file). */
  getRange(bucket: string, key: string, start: number, end: number): Promise<Uint8Array | null>;
  /** The whole object as a stream (hashing large files without buffering them). */
  streamObject(bucket: string, key: string): Promise<AsyncIterable<Uint8Array> | null>;
  /** Short-lived download URL that forces a download with this filename and type. */
  presignGet(input: { bucket: string; key: string; expiresInSeconds: number; filename: string; contentType: string }): Promise<string>;
}

export class ObjectTooLargeError extends Error {
  constructor() {
    super("Object exceeds the size limit");
    this.name = "ObjectTooLargeError";
  }
}
