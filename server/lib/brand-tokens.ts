import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Generated images (next/og) can't read CSS variables, so they read the light-theme values from
// styles/tokens.css, which stays the only place brand colours are defined. The file is traced
// into the functions that need it (next.config.ts outputFileTracingIncludes).

export type BrandTokens = Record<string, string>;

let cached: Promise<BrandTokens> | undefined;

/** `--dmg-primary: #ff7f63;` → `{ primary: "#ff7f63" }`, from the first `:root` block. */
export function parseTokens(css: string): BrandTokens {
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const out: BrandTokens = {};
  for (const m of root.matchAll(/--dmg-([a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}

export function brandTokens(): Promise<BrandTokens> {
  cached ??= readFile(path.join(process.cwd(), "styles/tokens.css"), "utf8").then(parseTokens);
  return cached;
}
