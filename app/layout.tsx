import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { ViewTransition } from "react";
import { MotionProvider } from "@/components/motion/MotionProvider";
import "./globals.css";

// UI typeface: friendly geometric-humanist sans with clear numerals.
const uiFont = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

// Display face for headings and the text wordmark. The final logo is still open (PRD §1A).
const displayFont = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DuMeGud: get paid by the people who love your work",
    template: "%s · DuMeGud",
  },
  description:
    "Make a free page, share your link, and get paid by your fans with Orange Money or Afrimoney. Sell your e-books, music and art too.",
  applicationName: "DuMeGud",
};

export const viewport: Viewport = {
  themeColor: "#fbf8f4",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${uiFont.variable} ${displayFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <MotionProvider>
          {/* Route changes are transitions, so this cross-fades pages (no-op where unsupported). */}
          <ViewTransition>{children}</ViewTransition>
        </MotionProvider>
      </body>
    </html>
  );
}
