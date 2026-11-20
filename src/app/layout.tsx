/*
 * src/app/layout.tsx
 *
 * WHAT: The "frame" around every page: the <html> and <body> tags, the fonts,
 *       the browser tab title, and the SiteHeader shown at the top of every page.
 * LAYER: Presentation.
 *
 * Next.js puts each page inside this layout automatically. {children} below is
 * where the current page (Home, Menu, ...) appears.
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The text shown in the browser tab and in search results.
export const metadata: Metadata = {
  title: "The Spot",
  description: "Order ahead from The Spot: pickup or delivery to UWI Mona, UTech and UWI Hospital.",
};

/*
 * RootLayout
 * Wraps every page. The header goes above {children}, so it appears on every page.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior="smooth": we use smooth scrolling for jumps WITHIN a
    // page (globals.css). This attribute tells Next.js to switch it off while
    // moving to a DIFFERENT page, so page changes stay instant, not a slow glide.
    <html
      data-scroll-behavior="smooth"
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
