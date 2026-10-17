import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ObjectTooLargeError, type ObjectStorage } from "./storage";

export type R2Credentials = { accountId: string; accessKeyId: string; secretAccessKey: string };

/** R2 through its S3-compatible API. Never called inside a DB transaction. */
export class R2Storage implements ObjectStorage {
  private readonly s3: S3Client;

  constructor(creds: R2Credentials) {
    this.s3 = new S3Client({
      region: "auto",
      // Path-style URLs (https://<account>.r2.cloudflarestorage.com/<bucket>/<key>) keep every
      // presigned upload on one origin, which is what the CSP connect-src allows.
      forcePathStyle: true,
      endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    });
  }

  presignPut({ bucket, key, contentType, contentLength, expiresInSeconds }: Parameters<ObjectStorage["presignPut"]>[0]) {
    // Content-Type and Content-Length are signed, so the browser can't upload anything else.
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
    return getSignedUrl(this.s3, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  }

  async getObject(bucket: string, key: string, maxBytes: number) {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if ((res.ContentLength ?? 0) > maxBytes) throw new ObjectTooLargeError();
      const body = await res.Body!.transformToByteArray();
      if (body.byteLength > maxBytes) throw new ObjectTooLargeError();
      return { body, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async putObject({ bucket, key, body, contentType, cacheControl }: Parameters<ObjectStorage["putObject"]>[0]) {
    await this.s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }),
    );
  }

  async deleteObject(bucket: string, key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async headObject(bucket: string, key: string) {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async getRange(bucket: string, key: string, start: number, end: number) {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` }));
      return await res.Body!.transformToByteArray();
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async streamObject(bucket: string, key: string) {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return res.Body as unknown as AsyncIterable<Uint8Array>;
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  presignGet({ bucket, key, expiresInSeconds, filename, contentType }: Parameters<ObjectStorage["presignGet"]>[0]) {
    // RFC 6266: an ASCII fallback plus the UTF-8 name.
    const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ResponseContentType: contentType,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }
}
