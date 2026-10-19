import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ViewTransition } from "react";
import { MotionProvider } from "@/components/motion/MotionProvider";
import "./globals.css";

// One typeface for UI and headings: a tight, neutral grotesk with clear numerals. The display
// variable stays separate so headings can change face later without touching components.
const geist = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DuMeGud: let your fans support you",
    template: "%s · DuMeGud",
  },
  description:
    "Make a free page, share your link, and let fans support your work with Orange Money or AfriMoney. You can sell your e-books, music and art there too.",
  applicationName: "DuMeGud",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
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
