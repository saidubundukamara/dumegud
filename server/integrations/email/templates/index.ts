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

export function orderReceiptTemplate(p: {
  productTitle: string;
  orderRef: string;
  libraryUrl: string;
  downloadLimit: number;
  accessDays: number;
}): Rendered {
  return {
    tag: "receipt-order",
    subject: `Your download: ${p.productTitle.slice(0, 60)}`,
    ...layout({
      heading: "Thanks for your purchase",
      paragraphs: [
        `Order #${p.orderRef}: ${p.productTitle}.`,
        `You can download it up to ${p.downloadLimit} times in the next ${p.accessDays} days. Keep this email: the link is your access.`,
      ],
      action: { label: "Open your downloads", url: p.libraryUrl },
      footer: "Don't share this link: anyone with it can use your downloads.",
    }),
  };
}

export function libraryLinksTemplate(p: { items: { title: string; url: string }[]; recoverUrl: string }): Rendered {
  return {
    tag: "library-links",
    subject: "Your DuMeGud downloads",
    ...layout({
      heading: "Your downloads",
      paragraphs: [
        "Here are the links to the things you bought on DuMeGud:",
        ...p.items.map((i) => `${i.title}: ${i.url}`),
      ],
      footer: `You asked for these at ${p.recoverUrl}. If that wasn't you, you can ignore this email.`,
    }),
  };
}

export function kycDecisionTemplate(p: { outcome: "approved" | "rejected" | "needs_more_info"; note: string | null; url: string }): Rendered {
  const copy = {
    approved: { subject: "Your identity is verified", heading: "You're verified", body: "Your identity documents were approved. You can now add a mobile money number and withdraw your earnings." },
    rejected: { subject: "We couldn't verify your identity", heading: "Verification wasn't approved", body: "We couldn't approve the documents you sent. You can submit new ones." },
    needs_more_info: { subject: "We need a little more to verify you", heading: "More information needed", body: "We need something more before we can verify your identity." },
  }[p.outcome];
  return {
    tag: `kyc-${p.outcome}`,
    subject: copy.subject,
    ...layout({
      heading: copy.heading,
      paragraphs: [copy.body, ...(p.note ? [`Note from our team: ${p.note}`] : [])],
      action: { label: "Open verification", url: p.url },
    }),
  };
}

export function payoutMethodChangedTemplate(p: { maskedNumber: string; cooldownHours: number; url: string }): Rendered {
  return {
    tag: "payout-method-changed",
    subject: "Your DuMeGud payout number was changed",
    ...layout({
      heading: "Your payout number changed",
      paragraphs: [
        `Withdrawals will now go to ${p.maskedNumber}. For your safety, withdrawals are paused for ${p.cooldownHours} hours.`,
        "If you didn't make this change, reset your password now and contact support.",
      ],
      action: { label: "Review payout settings", url: p.url },
    }),
  };
}

export function payoutResultTemplate(p: { outcome: "completed" | "failed"; amount: string; maskedNumber: string; reason?: string; url: string }): Rendered {
  return p.outcome === "completed"
    ? {
        tag: "payout-completed",
        subject: `Your withdrawal of ${p.amount} was sent`,
        ...layout({
          heading: "Withdrawal sent",
          paragraphs: [`We sent ${p.amount} to ${p.maskedNumber}.`],
          action: { label: "View your wallet", url: p.url },
        }),
      }
    : {
        tag: "payout-failed",
        subject: "Your withdrawal didn't go through",
        ...layout({
          heading: "Withdrawal failed",
          paragraphs: [
            `Your withdrawal of ${p.amount} to ${p.maskedNumber} didn't go through. The money is still in your wallet.`,
            ...(p.reason ? [`Reason: ${p.reason}`] : []),
          ],
          action: { label: "View your wallet", url: p.url },
        }),
      };
}

export function accountDeletionScheduledTemplate(p: { eraseOn: string; loginUrl: string }): Rendered {
  return {
    tag: "account-deletion-scheduled",
    subject: `Your DuMeGud account will be deleted on ${p.eraseOn}`,
    ...layout({
      heading: `Your account will be deleted on ${p.eraseOn}`,
      paragraphs: [
        "Your page is now offline and you've been signed out on every device.",
        `Until ${p.eraseOn} you can change your mind. Just sign in and tap "Keep my account".`,
        "People who bought your products can keep downloading them until their access ends. We keep records of money sent and received because the law requires it.",
      ],
      action: { label: "Sign in to keep my account", url: p.loginUrl },
      footer: "If you didn't ask to delete your account, sign in now and keep it, then change your password.",
    }),
  };
}

export function accountDeletionCanceledTemplate(p: { dashboardUrl: string }): Rendered {
  return {
    tag: "account-deletion-canceled",
    subject: "Your DuMeGud account is staying",
    ...layout({
      heading: "Your account won't be deleted",
      paragraphs: ["You cancelled the deletion, so your account and page are safe. Your page is still offline until you make it live again."],
      action: { label: "Open my dashboard", url: p.dashboardUrl },
    }),
  };
}

export function accountDeletedTemplate(): Rendered {
  return {
    tag: "account-deleted",
    subject: "Your DuMeGud account has been deleted",
    ...layout({
      heading: "Your account has been deleted",
      paragraphs: [
        "As you asked, we've deleted your DuMeGud account and personal details. Your page and handle are gone.",
        "We keep records of money sent and received, without your personal details, for as long as the law requires.",
        "If you ever want a page again, you can sign up with the same email.",
      ],
      footer: "This is the last email you'll get from us about this account.",
    }),
  };
}
