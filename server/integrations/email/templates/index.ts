import "server-only";
import type { EmailMessage } from "../EmailService";

// Plain string templates: no React, no user-supplied HTML. Every interpolated value goes through
// escapeHtml. Styling is deliberately neutral: email clients can't read our CSS tokens and the
// brand palette isn't final, so no brand colours are hard-coded here.

type Rendered = Omit<EmailMessage, "to">;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(opts: { heading: string; paragraphs: string[]; action?: { label: string; url: string }; footer?: string }) {
  const paras = opts.paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const button = opts.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#222;color:#fff;text-decoration:none;font-weight:600">${escapeHtml(opts.action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#555">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(opts.action.url)}</span></p>`
    : "";
  const footer = escapeHtml(opts.footer ?? "You're receiving this because of activity on your DuMeGud account.");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#222">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 24px;font-weight:700;font-size:18px">DuMeGud</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(opts.heading)}</h1>
${paras}${button}
<p style="margin:32px 0 0;font-size:12px;color:#666">${footer}</p>
</div></body></html>`;

  const text = [
    "DuMeGud",
    "",
    opts.heading,
    "",
    ...opts.paragraphs.flatMap((p) => [p, ""]),
    ...(opts.action ? [`${opts.action.label}: ${opts.action.url}`, ""] : []),
    opts.footer ?? "You're receiving this because of activity on your DuMeGud account.",
  ].join("\n");

  return { html, text };
}

export function verifyEmailTemplate(p: { name: string | null; url: string }): Rendered {
  return {
    tag: "verify-email",
    subject: "Confirm your email for DuMeGud",
    ...layout({
      heading: p.name ? `Welcome, ${p.name}` : "Welcome to DuMeGud",
      paragraphs: [
        "Confirm your email address to start receiving support and selling on DuMeGud.",
        "This link expires in 24 hours.",
      ],
      action: { label: "Confirm email", url: p.url },
      footer: "If you didn't create a DuMeGud account, you can ignore this email.",
    }),
  };
}

export function existingAccountTemplate(p: { loginUrl: string; resetUrl: string }): Rendered {
  return {
    tag: "register-existing",
    subject: "You already have a DuMeGud account",
    ...layout({
      heading: "You already have an account",
      paragraphs: [
        "Someone (hopefully you) tried to create a DuMeGud account with this email address, but one already exists.",
        `Sign in at ${p.loginUrl}. If you've forgotten your password, you can reset it at ${p.resetUrl}.`,
      ],
      action: { label: "Sign in", url: p.loginUrl },
      footer: "If this wasn't you, no action is needed. Your account hasn't changed.",
    }),
  };
}

export function resetPasswordTemplate(p: { url: string }): Rendered {
  return {
    tag: "reset-password",
    subject: "Reset your DuMeGud password",
    ...layout({
      heading: "Reset your password",
      paragraphs: [
        "We received a request to reset the password for your DuMeGud account.",
        "This link expires in 30 minutes and can only be used once.",
      ],
      action: { label: "Choose a new password", url: p.url },
      footer: "If you didn't ask to reset your password, you can ignore this email. Your password won't change.",
    }),
  };
}

export function passwordChangedTemplate(p: { resetUrl: string }): Rendered {
  return {
    tag: "password-changed",
    subject: "Your DuMeGud password was changed",
    ...layout({
      heading: "Your password was changed",
      paragraphs: [
        "The password for your DuMeGud account was just changed, and every device was signed out.",
        `If this wasn't you, reset your password now at ${p.resetUrl} and contact support.`,
      ],
    }),
  };
}
