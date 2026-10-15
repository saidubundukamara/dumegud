import path from "node:path";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

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
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    authInterrupts: true,
    // allowedOrigins is intentionally unset: Server Actions then accept only same-origin calls.
    serverActions: { bodySizeLimit: "1mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
