import { describe, expect, it, vi } from "vitest";
import { CloudflareEmailService, parseFromAddress } from "@/server/integrations/email/cloudflare";
import { SmtpEmailService, smtpOptionsFromUrl } from "@/server/integrations/email/smtp";
import { escapeHtml, verifyEmailTemplate } from "@/server/integrations/email/templates";
import { ExternalServiceError } from "@/server/lib/errors";

describe("templates", () => {
  it("escapes user-controlled values in HTML", () => {
    const { html, text } = verifyEmailTemplate({ name: '<img src=x onerror="alert(1)">', url: "https://dumegud.test/v?token=a&b" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("token=a&amp;b");
    expect(text).toContain("https://dumegud.test/v?token=a&b");
    expect(html).toContain("DuMeGud");
  });

  it("escapeHtml covers quotes", () => {
    expect(escapeHtml(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
});

describe("parseFromAddress", () => {
  it("parses name + address", () => {
    expect(parseFromAddress("DuMeGud <no-reply@dumegud.com>")).toEqual({ name: "DuMeGud", address: "no-reply@dumegud.com" });
    expect(parseFromAddress('"DuMeGud" <a@b.c>')).toEqual({ name: "DuMeGud", address: "a@b.c" });
    expect(parseFromAddress("a@b.c")).toEqual({ address: "a@b.c" });
  });
});

describe("CloudflareEmailService", () => {
  const message = { to: "x@example.com", subject: "S", html: "<p>h</p>", text: "t", tag: "verify-email" };

  it("posts to the account send endpoint with a bearer token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true, errors: [], result: { delivered: ["x@example.com"] } }));
    const svc = new CloudflareEmailService({ accountId: "acc1", apiToken: "tok", from: "DuMeGud <n@d.com>", fetch: fetchMock });
    await svc.send(message);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc1/email/sending/send");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({
      from: { name: "DuMeGud", address: "n@d.com" },
      to: "x@example.com",
      subject: "S",
      html: "<p>h</p>",
      text: "t",
    });
  });

  it("throws ExternalServiceError on an API error", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, errors: [{ code: 10001, message: "bad" }], result: null }, { status: 400 }),
    );
    const svc = new CloudflareEmailService({ accountId: "a", apiToken: "t", from: "n@d.com", fetch: fetchMock });
    await expect(svc.send(message)).rejects.toBeInstanceOf(ExternalServiceError);
  });
});

describe("SmtpEmailService", () => {
  const message = { to: "x@example.com", subject: "S", html: "<p>h</p>", text: "t", tag: "verify-email" };

  it("sends the message from EMAIL_FROM", async () => {
    const sendMail = vi.fn(async () => ({ envelope: { from: "n@d.com", to: ["x@example.com"] }, messageId: "<m@d.com>" }));
    const svc = new SmtpEmailService({ url: "smtp://localhost:1025", from: "DuMeGud <n@d.com>", transport: { sendMail } });
    await svc.send(message);
    expect(sendMail).toHaveBeenCalledWith({ from: "DuMeGud <n@d.com>", to: "x@example.com", subject: "S", html: "<p>h</p>", text: "t" });
  });

  it("throws ExternalServiceError when the SMTP server fails", async () => {
    const sendMail = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const svc = new SmtpEmailService({ url: "smtp://localhost:1025", from: "n@d.com", transport: { sendMail } });
    await expect(svc.send(message)).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it("parses SMTP_URL without nodemailer's url.parse()", () => {
    expect(smtpOptionsFromUrl("smtp://localhost:1025")).toEqual({ host: "localhost", port: 1025, secure: false, auth: undefined });
    expect(smtpOptionsFromUrl("smtps://us%40r:p%3Ass@mail.example.com")).toEqual({
      host: "mail.example.com",
      port: undefined,
      secure: true,
      auth: { user: "us@r", pass: "p:ss" },
    });
  });
});
