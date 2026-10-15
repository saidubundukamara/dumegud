import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

// UI typeface (humanist sans, clear numerals, wide language support). Logo typography is a
// separate, still-open brand decision (PRD §1A) and must not be derived from this.
const uiFont = Source_Sans_3({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DuMeGud — Support creators. Fuel good.",
    template: "%s · DuMeGud",
  },
  description:
    "Support Sierra Leonean creators with a one-off contribution or buy their digital work — straight from your browser.",
  applicationName: "DuMeGud",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${uiFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
