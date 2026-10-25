import path from "node:path";
import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";
import { adminHostname } from "./lib/admin-host";

const isProd = process.env.NODE_ENV === "production";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// R2 origins are read at build time (Next loads .env files before this config). Browsers PUT
// avatar uploads straight to R2, and public images are served from the public bucket's domain.
// R2_ENDPOINT overrides the R2 account endpoint (local MinIO).
const r2UploadOrigin =
  originOf(process.env.R2_ENDPOINT) ??
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const publicAssetsOrigin = originOf(process.env.R2_PUBLIC_BASE_URL);
const withOrigins = (base: string, ...origins: (string | null)[]) => [base, ...origins.filter(Boolean)].join(" ");

// Static CSP (no nonce). A nonce-based CSP forces every page to render dynamically and is
// incompatible with Partial Prerendering (node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md), which would also defeat the CDN caching of public creator pages
// that our DDoS posture relies on. XSS defense rests on React escaping + no
// dangerouslySetInnerHTML (lint-enforced); this policy still blocks plugins, framing, base-tag
// hijacking, foreign form posts and third-party script/connect origins.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  withOrigins("img-src 'self' data: blob:", publicAssetsOrigin),
  "font-src 'self'",
  withOrigins("connect-src 'self'", r2UploadOrigin),
  "object-src 'none'",
  "base-uri 'self'",
  // Google sign-in and Monime checkout: without JS the server action answers the form POST with
  // a redirect to them, and form-action also governs redirects that follow a form submission.
  // (Confirm Monime's hosted-checkout host against a live session before launch.)
  // Downloads: the library's form posts to a server action that redirects to a presigned R2 URL.
  withOrigins("form-action 'self' https://accounts.google.com https://*.monime.io", r2UploadOrigin),
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

// The admin subdomain (lib/admin-host.ts). Matched on the hostname, port excluded.
const adminHost = adminHostname().replace(/\./g, "\\.");
const onAdminHost = [{ type: "host" as const, value: adminHost }];

const OG_FILES = ["./styles/tokens.css", "./node_modules/@fontsource/geist-sans/files/geist-sans-latin-{400,700}-normal.woff"];

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
    authInterrupts: true,
    // allowedOrigins is intentionally unset: Server Actions then accept only same-origin calls.
    serverActions: { bodySizeLimit: "1mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  // The shout-out card reads brand colours from the token file at runtime (server/lib/brand-tokens.ts).
  // Files read at runtime by generated images (brand colours, the Geist woff files for share cards).
  outputFileTracingIncludes: {
    "/api/shoutouts/image": ["./styles/tokens.css"],
    "/api/recaps/image": OG_FILES,
    "/api/milestones/image": OG_FILES,
    "/opengraph-image": OG_FILES,
    "/[handle]/opengraph-image": OG_FILES,
    "/p/[productId]/opengraph-image": OG_FILES,
  },
  poweredByHeader: false,
  turbopack: {
    // Pin the root: a stray lockfile higher up the filesystem would otherwise be picked up.
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Behind a login anyway, but never in search results even if a link leaks.
      { source: "/:path*", has: onAdminHost, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  async rewrites() {
    return {
      // Before files and pages, so every admin-host path lands in app/(admin)/admin. Next's own
      // assets and the admin API stay where they are. The proxy has already 404'd /admin/* on
      // every host, so the internal paths only exist through these rewrites.
      // Rules apply in sequence to the already-rewritten path, so the catch-all must come before
      // `/` → `/admin` (the other order turns `/` into `/admin/admin`).
      beforeFiles: [
        // (149e9513-… is BotID's script/proxy prefix; withBotId appends its rewrites after these.)
        { source: "/:path((?!_next/|__nextjs|api/admin/|favicon\\.ico$|view-transition-guard\\.js$|149e9513-01fa-4fb0-aad4-566afd725d1b/).+)", has: onAdminHost, destination: "/admin/:path" },
        { source: "/", has: onAdminHost, destination: "/admin" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

// withBotId adds the same-origin rewrites the BotID client script loads through (CSP-safe).
export default withBotId(nextConfig);
