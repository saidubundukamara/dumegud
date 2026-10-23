import "server-only";
import { LEGAL } from "@/lib/legal";
import type { EmailMessage } from "../EmailService";

// Plain string templates: no React, no user-supplied HTML. Every interpolated value goes through
// escapeHtml. Email clients can't read CSS variables, so the palette below mirrors
// styles/tokens.css; change both together. Layout is table-based so Outlook keeps the width and
// the button keeps its padding, and a dark scheme covers Apple Mail and Outlook.com.

type Rendered = Omit<EmailMessage, "to">;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const C = {
  primary: "#8f0100",
  secondary: "#ff7300",
  text: "#1a1514",
  muted: "#6b615b",
  page: "#f5f3f2",
  card: "#ffffff",
  panel: "#f5f3f2",
  rule: "#e6e0dd",
} as const;

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

// Dark values are lifted from the brand: warm near-black surfaces, the soft primary tint for the
// wordmark and links (maroon itself is unreadable on dark), and the button stays maroon.
const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
a{text-decoration-thickness:1px;text-underline-offset:3px}
@media (max-width:600px){
  .card{padding:28px 20px !important}
  .h1{font-size:24px !important}
  .btn,.btn-a{width:100% !important}
  .btn-a{display:block !important;text-align:center !important;box-sizing:border-box}
}
@media (prefers-color-scheme:dark){
  .bg{background:#141110 !important}
  .card{background:#211b1a !important}
  .panel{background:#2c2523 !important}
  .ink{color:#f5f3f2 !important}
  .muted{color:#bdb3ad !important}
  .brand,.link{color:#f8c9c5 !important}
  .rule{border-color:#3a3230 !important}
}
[data-ogsc] .bg{background:#141110 !important}
[data-ogsc] .card{background:#211b1a !important}
[data-ogsc] .panel{background:#2c2523 !important}
[data-ogsc] .ink{color:#f5f3f2 !important}
[data-ogsc] .muted{color:#bdb3ad !important}
[data-ogsc] .brand,[data-ogsc] .link{color:#f8c9c5 !important}
`;

/** One piece of an email body, rendered to both HTML and plain text. */
type Block =
  | { kind: "p"; text: string }
  | { kind: "details"; rows: [label: string, value: string][] }
  | { kind: "note"; label: string; text: string }
  | { kind: "links"; items: { title: string; url: string }[] };

const para = (text: string): Block => ({ kind: "p", text });

type EmailSpec = {
  tag: string;
  subject: string;
  /** The line inbox apps show after the subject. */
  preheader: string;
  heading: string;
  blocks: Block[];
  action?: { label: string; url: string };
  /** A quieter text link under the button, for the second most likely need. */
  secondary?: { label: string; url: string };
  /** Print the button's URL for copying: only for one-time links (verify, reset). */
  showLinkFallback?: boolean;
  /** Why this email arrived, or what to do if it wasn't expected. */
  footer: string;
};

const SUPPORT = LEGAL.contactEmail;

/** Keeps "Le 1,250.00" on one line. */
const nowrap = (value: string) => value.replace(/ /g, " ");

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function email(spec: EmailSpec): Rendered {
  return { tag: spec.tag, subject: spec.subject, html: renderHtml(spec), text: renderText(spec) };
}

function renderBlock(block: Block, last: boolean): string {
  const ink = `color:${C.text}`;
  // The last block before the end of the card drops its bottom margin; the card padding is enough.
  const end = (px: number) => (last ? 0 : px);
  switch (block.kind) {
    case "p":
      return `<p class="ink" style="margin:0 0 ${end(16)}px;font-size:16px;line-height:1.6;${ink}">${escapeHtml(block.text)}</p>`;
    case "details": {
      const rows = block.rows
        .map(
          ([label, value], i) => `<tr>
<td class="muted${i ? " rule" : ""}" style="padding:12px 0;${i ? `border-top:1px solid ${C.rule};` : ""}font-size:16px;line-height:1.4;color:${C.muted};vertical-align:top">${escapeHtml(label)}</td>
<td class="ink${i ? " rule" : ""}" align="right" style="padding:12px 0 12px 16px;${i ? `border-top:1px solid ${C.rule};` : ""}font-size:16px;line-height:1.4;font-weight:600;${ink};text-align:right;vertical-align:top">${escapeHtml(value)}</td>
</tr>`,
        )
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="panel" style="margin:8px 0 ${end(24)}px;background:${C.panel};border-radius:14px">
<tr><td style="padding:4px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
    }
    case "note":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="panel" style="margin:4px 0 ${end(20)}px;background:${C.panel};border-radius:14px">
<tr><td style="padding:16px 20px">
<p class="muted" style="margin:0 0 6px;font-size:14px;line-height:1.4;font-weight:600;color:${C.muted}">${escapeHtml(block.label)}</p>
<p class="ink" style="margin:0;font-size:16px;line-height:1.6;${ink};white-space:pre-line">${escapeHtml(block.text)}</p>
</td></tr></table>`;
    case "links": {
      const rows = block.items
        .map(
          (item, i) => `<tr>
<td class="ink${i ? " rule" : ""}" style="padding:14px 0;${i ? `border-top:1px solid ${C.rule};` : ""}font-size:16px;line-height:1.4;font-weight:600;${ink}">${escapeHtml(item.title)}</td>
<td class="${i ? "rule" : ""}" align="right" style="padding:14px 0 14px 16px;${i ? `border-top:1px solid ${C.rule};` : ""}font-size:16px;line-height:1.4;white-space:nowrap;text-align:right"><a class="link" href="${escapeHtml(item.url)}" style="color:${C.primary};font-weight:600">Open</a></td>
</tr>`,
        )
        .join("");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="panel" style="margin:8px 0 ${end(24)}px;background:${C.panel};border-radius:14px">
<tr><td style="padding:2px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
    }
  }
}

function renderHtml(spec: EmailSpec): string {
  const link = (href: string, label: string, color: string = C.primary) =>
    `<a class="link" href="${escapeHtml(href)}" style="color:${color}">${escapeHtml(label)}</a>`;

  const button = spec.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:12px 0 0">
<tr><td align="center" bgcolor="${C.primary}" style="border-radius:12px;background:${C.primary};mso-padding-alt:15px 28px">
<a class="btn-a" href="${escapeHtml(spec.action.url)}" style="display:inline-block;padding:15px 28px;border-radius:12px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(spec.action.label)}</a>
</td></tr></table>`
    : "";
  const secondary = spec.secondary
    ? `<p style="margin:18px 0 0;font-size:16px;line-height:1.5">${link(spec.secondary.url, spec.secondary.label)}</p>`
    : "";
  const fallback =
    spec.action && spec.showLinkFallback
      ? `<p class="muted" style="margin:28px 0 0;font-size:14px;line-height:1.5;color:${C.muted}">Button not working? Copy this link into your browser:<br><a class="muted" href="${escapeHtml(spec.action.url)}" style="color:${C.muted};word-break:break-all">${escapeHtml(spec.action.url)}</a></p>`
      : "";

  // The run of zero-width joiners stops inbox apps pulling body text into the preview line.
  const preheader = `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px">${escapeHtml(spec.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`;

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(spec.subject)}</title>
<style>${STYLE}</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.page}">
<tr><td align="center" style="padding:32px 12px 40px;font-family:${FONT}">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 8px 20px">
<p class="brand" style="margin:0;font-family:${FONT};font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${C.primary}">DuMeGud</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr><td width="28" height="3" bgcolor="${C.secondary}" style="width:28px;height:3px;background:${C.secondary};border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table>
</td></tr>
<tr><td class="card" style="padding:36px 32px;background:${C.card};border-radius:20px;font-family:${FONT}">
<h1 class="ink h1" style="margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${C.text}">${escapeHtml(spec.heading)}</h1>
${spec.blocks.map((b, i) => renderBlock(b, !spec.action && i === spec.blocks.length - 1)).join("\n")}
${button}${secondary}${fallback}
</td></tr>
<tr><td class="muted" style="padding:24px 8px 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.muted}">
<p style="margin:0 0 8px">${escapeHtml(spec.footer)}</p>
<p style="margin:0">Need help? Write to ${link(`mailto:${SUPPORT}`, SUPPORT, C.muted)}.</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

function renderText(spec: EmailSpec): string {
  const blocks = spec.blocks.flatMap((block) => {
    switch (block.kind) {
      case "p":
        return [block.text, ""];
      case "details":
        return [...block.rows.map(([label, value]) => `${label}: ${value}`), ""];
      case "note":
        return [`${block.label}:`, block.text, ""];
      case "links":
        return [...block.items.map((i) => `${i.title}: ${i.url}`), ""];
    }
  });
  return [
    "DuMeGud",
    "",
    spec.heading,
    "",
    ...blocks,
    ...(spec.action ? [`${spec.action.label}: ${spec.action.url}`, ""] : []),
    ...(spec.secondary ? [`${spec.secondary.label}: ${spec.secondary.url}`, ""] : []),
    "--",
    spec.footer,
    `Need help? Write to ${SUPPORT}.`,
  ]
    .join("\n")
    .replace(/ /g, " ");
}

// ── Account ───────────────────────────────────────────────────────────────────

export function verifyEmailTemplate(p: { name: string | null; url: string }): Rendered {
  const name = firstName(p.name);
  return email({
    tag: "verify-email",
    subject: "Confirm your email for DuMeGud",
    preheader: "One tap and you're in. The link works for 24 hours.",
    heading: name ? `Welcome, ${name}` : "Welcome to DuMeGud",
    blocks: [
      para("You're nearly there. Confirm this is your email, then set up your page and start receiving support from your fans."),
      para("The link works for 24 hours."),
    ],
    action: { label: "Confirm my email", url: p.url },
    showLinkFallback: true,
    footer: "Didn't sign up for DuMeGud? You can safely ignore this email.",
  });
}

export function existingAccountTemplate(p: { loginUrl: string; resetUrl: string }): Rendered {
  return email({
    tag: "register-existing",
    subject: "You already have a DuMeGud account",
    preheader: "Sign in instead, or choose a new password if you've forgotten it.",
    heading: "You already have an account",
    blocks: [
      para("Someone just tried to sign up with this email address. It already has a DuMeGud account, so we didn't make a new one."),
      para("If that was you, sign in as usual. Forgotten your password? You can choose a new one."),
    ],
    action: { label: "Sign in", url: p.loginUrl },
    secondary: { label: "Choose a new password", url: p.resetUrl },
    footer: "If this wasn't you, there's nothing to do. Your account hasn't changed.",
  });
}

export function resetPasswordTemplate(p: { url: string }): Rendered {
  return email({
    tag: "reset-password",
    subject: "Reset your DuMeGud password",
    preheader: "The link works for 30 minutes, and only once.",
    heading: "Choose a new password",
    blocks: [
      para("We got a request to reset the password for your DuMeGud account. Tap the button to choose a new one."),
      para("The link works for 30 minutes and can only be used once."),
    ],
    action: { label: "Choose a new password", url: p.url },
    showLinkFallback: true,
    footer: "Didn't ask for this? Ignore this email and your password stays the same.",
  });
}

export function passwordChangedTemplate(p: { resetUrl: string }): Rendered {
  return email({
    tag: "password-changed",
    subject: "Your DuMeGud password was changed",
    preheader: "If this was you, you're all set. If not, secure your account now.",
    heading: "Your password was changed",
    blocks: [
      para("The password for your DuMeGud account was just changed. To keep you safe, we signed you out on every device."),
      para("If you did this, you're all set."),
      para(`If it wasn't you, reset your password now, then write to us at ${SUPPORT} so we can check your account with you.`),
    ],
    action: { label: "Reset my password", url: p.resetUrl },
    footer: "We send this email every time your password changes.",
  });
}

// ── Buyers ────────────────────────────────────────────────────────────────────

export function orderReceiptTemplate(p: {
  productTitle: string;
  creatorName: string | null;
  orderRef: string;
  amount: string;
  paidOn: string;
  libraryUrl: string;
  downloadLimit: number;
  accessDays: number;
}): Rendered {
  const times = p.downloadLimit === 1 ? "once" : `up to ${p.downloadLimit} times`;
  const days = `${p.accessDays} ${plural(p.accessDays, "day", "days")}`;
  return email({
    tag: "receipt-order",
    subject: p.creatorName ? `Your download from ${p.creatorName} is ready` : "Your download is ready",
    preheader: `${p.productTitle}. You can download it ${times} in the next ${days}.`,
    heading: p.creatorName ? `Thanks for supporting ${p.creatorName}` : "Thanks for your purchase",
    blocks: [
      para("Your download is ready. Keep this email somewhere safe: it's how you get back to your files."),
      {
        kind: "details",
        rows: [
          ["Item", p.productTitle],
          ["Price", nowrap(p.amount)],
          ["Date", nowrap(p.paidOn)],
          ["Order", `#${p.orderRef}`],
        ],
      },
      para(`You can download it ${times} in the next ${days}.`),
    ],
    action: { label: "Open my downloads", url: p.libraryUrl },
    footer: p.creatorName
      ? `You bought this from ${p.creatorName} on DuMeGud. Please don't forward this email: anyone with the link can use your downloads.`
      : "You bought this on DuMeGud. Please don't forward this email: anyone with the link can use your downloads.",
  });
}

export function libraryLinksTemplate(p: { items: { title: string; url: string }[] }): Rendered {
  const count = p.items.length;
  return email({
    tag: "library-links",
    subject: "Your DuMeGud downloads",
    preheader: count === 1 ? "The link to what you bought, ready when you need it." : `Links to all ${count} of your purchases, in one place.`,
    heading: "Here are your downloads",
    blocks: [
      para(`You asked for the links to what you've bought on DuMeGud. Each one opens the downloads for that purchase.`),
      { kind: "links", items: p.items },
    ],
    footer: "Didn't ask for these? You can ignore this email. The links were only sent to you.",
  });
}

// ── Creators: verification and withdrawals ────────────────────────────────────

export function kycDecisionTemplate(p: {
  outcome: "approved" | "rejected" | "needs_more_info";
  note: string | null;
  url: string;
  payoutMethodUrl: string;
}): Rendered {
  const note = p.note?.trim() ? [{ kind: "note" as const, label: "From our team", text: p.note.trim() }] : [];
  const footer = "A member of our team reviewed your documents.";

  if (p.outcome === "approved") {
    return email({
      tag: "kyc-approved",
      subject: "You're verified on DuMeGud",
      preheader: "Next, add the mobile money number you'd like to withdraw to.",
      heading: "You're verified",
      blocks: [
        para("Thanks for waiting. We checked your ID and everything looks good."),
        ...note,
        para("Next, add the mobile money number you'd like to withdraw to. Then you can move the support you receive straight to your phone."),
      ],
      action: { label: "Add my payout number", url: p.payoutMethodUrl },
      footer,
    });
  }
  if (p.outcome === "rejected") {
    return email({
      tag: "kyc-rejected",
      subject: "We couldn't verify your ID",
      preheader: "You can send new photos whenever you're ready.",
      heading: "We couldn't verify your ID",
      blocks: [
        para("We looked at the documents you sent, but we couldn't approve them this time."),
        ...note,
        para("You can send new ones whenever you're ready. Clear photos taken in good light usually make the difference."),
      ],
      action: { label: "Send new documents", url: p.url },
      footer,
    });
  }
  return email({
    tag: "kyc-needs_more_info",
    subject: "We need a little more to verify you",
    preheader: "Our team asked for one more thing before they can finish.",
    heading: "We need a little more from you",
    blocks: note.length
      ? [para("We're nearly done checking your ID. Our team needs one more thing first:"), ...note]
      : [para("We're nearly done checking your ID, but our team needs one more thing first. Open your verification page to see what's missing.")],
    action: { label: "Add what's needed", url: p.url },
    footer,
  });
}

export function payoutMethodChangedTemplate(p: { maskedNumber: string; cooldownHours: number; url: string; resetUrl: string }): Rendered {
  const pause = `${p.cooldownHours} ${plural(p.cooldownHours, "hour", "hours")}`;
  return email({
    tag: "payout-method-changed",
    subject: "Your DuMeGud payout number was changed",
    preheader: `Withdrawals now go to ${p.maskedNumber}. Not you? Secure your account now.`,
    heading: "Your payout number changed",
    blocks: [
      para(`From now on, withdrawals will go to ${p.maskedNumber}. To keep your money safe, withdrawals are paused for ${pause}.`),
      para("If you made this change, you're all set."),
      para(`If you didn't, reset your password straight away, then write to us at ${SUPPORT}. No withdrawals can go out during the pause.`),
    ],
    action: { label: "Reset my password", url: p.resetUrl },
    secondary: { label: "Review my payout number", url: p.url },
    footer: "We send this email every time your payout number changes.",
  });
}

export function payoutResultTemplate(p: { outcome: "completed" | "failed"; amount: string; maskedNumber: string; reason?: string; url: string }): Rendered {
  const amount = nowrap(p.amount);
  if (p.outcome === "completed") {
    return email({
      tag: "payout-completed",
      subject: `Your withdrawal of ${p.amount} was sent`,
      preheader: `We sent it to ${p.maskedNumber}. Check your mobile money balance.`,
      heading: "Your withdrawal is on its way",
      blocks: [
        para("We sent your withdrawal to your mobile money number. It should show in your balance shortly."),
        {
          kind: "details",
          rows: [
            ["Amount", amount],
            ["Sent to", p.maskedNumber],
          ],
        },
      ],
      action: { label: "View my wallet", url: p.url },
      footer: "We send this email every time a withdrawal is sent.",
    });
  }
  return email({
    tag: "payout-failed",
    subject: "Your withdrawal didn't go through",
    preheader: `Your ${p.amount} is safe in your wallet. You can try again.`,
    heading: "Your money is still in your wallet",
    blocks: [
      para(`We tried to send ${amount} to ${p.maskedNumber}, but it didn't go through.`),
      ...(p.reason ? [{ kind: "note" as const, label: "What went wrong", text: p.reason }] : []),
      para("Check that your payout number is right, then try again."),
    ],
    action: { label: "Check and try again", url: p.url },
    footer: "We send this email whenever a withdrawal can't be completed.",
  });
}

// ── Account deletion ──────────────────────────────────────────────────────────

export function accountDeletionScheduledTemplate(p: { eraseOn: string; loginUrl: string }): Rendered {
  return email({
    tag: "account-deletion-scheduled",
    subject: `Your DuMeGud account will be deleted on ${p.eraseOn}`,
    preheader: `Changed your mind? Sign in before ${p.eraseOn} and keep it.`,
    heading: `Your account will be deleted on ${p.eraseOn}`,
    blocks: [
      para("Your page is offline now, and we've signed you out on every device."),
      para(`Changed your mind? Sign in any time before ${p.eraseOn} and choose "Keep my account".`),
      para("People who bought your products can keep downloading them until their access ends. We keep records of money sent and received because the law requires it."),
    ],
    action: { label: "Sign in to keep my account", url: p.loginUrl },
    footer: "Didn't ask to delete your account? Sign in now, keep it, and change your password.",
  });
}

export function accountDeletionCanceledTemplate(p: { dashboardUrl: string }): Rendered {
  return email({
    tag: "account-deletion-canceled",
    subject: "Your DuMeGud account is staying",
    preheader: "We're glad you're staying. Your page is offline until you make it live.",
    heading: "Your account is staying",
    blocks: [
      para("You cancelled the deletion, so nothing will be removed. We're glad you're staying."),
      para("Your page is still offline. Make it live again from your dashboard whenever you're ready."),
    ],
    action: { label: "Open my dashboard", url: p.dashboardUrl },
    footer: "We sent this because you chose to keep your account.",
  });
}

export function accountDeletedTemplate(): Rendered {
  return email({
    tag: "account-deleted",
    subject: "Your DuMeGud account has been deleted",
    preheader: "This is the last email we'll send about this account.",
    heading: "Your account has been deleted",
    blocks: [
      para("As you asked, we've deleted your DuMeGud account and your personal details. Your page and handle are gone."),
      para("We keep records of money sent and received, without your personal details, for as long as the law requires."),
      para("Thank you for being part of DuMeGud. If you ever want a page again, you're welcome to sign up with the same email."),
    ],
    footer: "This is the last email you'll get from us about this account.",
  });
}
