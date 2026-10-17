import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, signToken, verifySignedToken } from "@/server/lib/crypto";
import { extensionOf, safeFilename, sniffMatches } from "@/server/lib/uploads";
import { stampPdf } from "@/server/services/DownloadService";

describe("field encryption", () => {
  it("round-trips, uses a fresh IV every time, and detects tampering", () => {
    const a = encryptField("buyer@example.com");
    const b = encryptField("buyer@example.com");
    expect(a).not.toBe(b);
    expect(a).not.toContain("buyer");
    expect(decryptField(a)).toBe("buyer@example.com");
    const [v, iv, tag, ct] = a.split(".");
    const flipped = ct.slice(0, -2) + (ct.endsWith("A") ? "BB" : "AA");
    expect(() => decryptField([v, iv, tag, flipped].join("."))).toThrow();
    expect(() => decryptField("garbage")).toThrow();
  });
});

describe("signed tokens", () => {
  const secret = "s".repeat(40);
  it("verify only with the same secret and untouched payload", () => {
    const token = signToken("ent|asset|123", secret);
    expect(verifySignedToken(token, secret)).toBe("ent|asset|123");
    expect(verifySignedToken(token, "x".repeat(40))).toBeNull();
    const [body, sig] = token.split(".");
    expect(verifySignedToken(`${Buffer.from("ent|other|123").toString("base64url")}.${sig}`, secret)).toBeNull();
    expect(verifySignedToken(body, secret)).toBeNull();
    expect(verifySignedToken("", secret)).toBeNull();
  });
});

describe("uploads", () => {
  it("normalises extensions and filenames", () => {
    expect(extensionOf("Book.PDF")).toBe("pdf");
    expect(extensionOf("noext")).toBeNull();
    expect(safeFilename("../../etc/pass\u0000wd\".pdf")).toBe("pass_wd_.pdf");
    expect(safeFilename(`${"a".repeat(200)}.pdf`)).toMatch(/^a{110}\.pdf$/);
  });

  it("sniffs real types and rejects disguised ones", async () => {
    const pdf = await (await PDFDocument.create()).save();
    expect(await sniffMatches("pdf", pdf.slice(0, 4100))).toBe(true);
    const exe = new Uint8Array([0x4d, 0x5a, ...new Array(200).fill(0)]);
    expect(await sniffMatches("pdf", exe)).toBe(false);
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    expect(await sniffMatches("png", html)).toBe(false);
    expect(await sniffMatches("exe", exe)).toBe(false); // not in the table at all
  });
});

describe("stampPdf", () => {
  it("adds the footer to every page and keeps the page count", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    const stamped = await stampPdf(await doc.save(), "Licensed to order #ABCD1234 - DuMeGud");
    expect((await PDFDocument.load(stamped)).getPageCount()).toBe(2);
    expect(stamped.byteLength).toBeGreaterThan((await doc.save()).byteLength);
  });
});
