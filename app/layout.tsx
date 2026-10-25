import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ViewTransition } from "react";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { SHARED_OPEN_GRAPH, SITE_NAME } from "@/lib/seo";
import { isIndexable, siteUrl } from "@/server/lib/site";
import "./globals.css";

// One typeface for UI and headings: a tight, neutral grotesk with clear numerals. The display
// variable stays separate so headings can change face later without touching components.
const geist = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const DEFAULT_TITLE = "DuMeGud: let your fans support you";
const DEFAULT_DESCRIPTION =
  "Make a free page, share your link, and let fans support your work with Orange Money or AfriMoney. You can sell your e-books, music and art there too.";

export const metadata: Metadata = {
  // Relative URLs in any page's metadata (canonical, og:url, og:image) resolve against this.
  metadataBase: siteUrl(),
  title: {
    default: DEFAULT_TITLE,
    template: "%s · DuMeGud",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { ...SHARED_OPEN_GRAPH, type: "website", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  // Previews and local builds stay out of search; production is indexable page by page.
  robots: isIndexable() ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must run before React's streamed reveal scripts (see the file); it's tiny and same-origin. */}
        <script src="/view-transition-guard.js" />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-[60] rounded-full bg-accent font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:px-5 focus:py-3"
        >
          Skip to content
        </a>
        <MotionProvider>
          {/* Route changes are transitions, so this cross-fades pages (no-op where unsupported). */}
          <ViewTransition>{children}</ViewTransition>
        </MotionProvider>
      </body>
    </html>
  );
}
