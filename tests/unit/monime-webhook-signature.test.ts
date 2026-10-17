import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMonimeEvent, parseSignatureHeader, signMonimePayload, verifyMonimeSignature } from "@/server/integrations/monime/webhook";

const SECRET = "whsec_test_secret";
const NOW = 1_784_112_516;
const BODY = JSON.stringify({ event: { id: "wkd-1", name: "payment.processing_completed" }, data: { amount: { value: 30000 } } });

describe("verifyMonimeSignature", () => {
  it("accepts a valid signature over `${t}_${rawBody}`", () => {
    const expected = createHmac("sha256", SECRET).update(`${NOW}_${BODY}`).digest("base64");
    expect(signMonimePayload(BODY, SECRET, NOW)).toBe(`t=${NOW},v1=${expected}`);
    expect(verifyMonimeSignature(BODY, `t=${NOW},v1=${expected}`, SECRET, NOW)).toEqual({ ok: true });
  });

  it("rejects a tampered body or the wrong secret", () => {
    const header = signMonimePayload(BODY, SECRET, NOW);
    expect(verifyMonimeSignature(BODY.replace("30000", "99999"), header, SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyMonimeSignature(BODY, header, "other-secret", NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects old and future timestamps (replay window)", () => {
    expect(verifyMonimeSignature(BODY, signMonimePayload(BODY, SECRET, NOW - 301), SECRET, NOW)).toMatchObject({ reason: "expired" });
    expect(verifyMonimeSignature(BODY, signMonimePayload(BODY, SECRET, NOW - 300), SECRET, NOW)).toEqual({ ok: true });
    expect(verifyMonimeSignature(BODY, signMonimePayload(BODY, SECRET, NOW + 61), SECRET, NOW)).toMatchObject({ reason: "future" });
    expect(verifyMonimeSignature(BODY, signMonimePayload(BODY, SECRET, NOW + 60), SECRET, NOW)).toEqual({ ok: true });
  });

  it.each([null, "", "garbage", `t=${NOW}`, "v1=abc", `t=abc,v1=abc`, `t=${NOW},v1=`])("rejects malformed header %s", (header) => {
    expect(verifyMonimeSignature(BODY, header, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects everything when no secret is configured", () => {
    expect(verifyMonimeSignature(BODY, signMonimePayload(BODY, SECRET, NOW), undefined, NOW)).toEqual({ ok: false, reason: "no_secret" });
  });

  it("accepts any of several v1 values (secret rotation)", () => {
    const good = signMonimePayload(BODY, SECRET, NOW).split("v1=")[1];
    expect(verifyMonimeSignature(BODY, `t=${NOW},v1=AAAA,v1=${good}`, SECRET, NOW)).toEqual({ ok: true });
  });

  it("keeps base64 '=' padding when parsing the header", () => {
    expect(parseSignatureHeader("t=1,v1=abc=")).toEqual({ t: 1, v1: ["abc="] });
  });
});

describe("parseMonimeEvent", () => {
  it("parses a valid envelope", () => {
    expect(parseMonimeEvent(BODY)).toMatchObject({ event: { id: "wkd-1", name: "payment.processing_completed" } });
  });
  it.each(["not json", "[]", JSON.stringify({ data: {} }), JSON.stringify({ event: { id: "", name: "x" } })])("rejects %s", (raw) => {
    expect(parseMonimeEvent(raw)).toBeNull();
  });
});
