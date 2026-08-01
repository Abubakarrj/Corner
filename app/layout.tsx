import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import CookieConsent from "./CookieConsent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The shop's heading face, replacing the Georgia serif that was standing in
// for one. Only /shop references it (via DISPLAY_FONT in shopControls.ts) —
// the marketing site's type is unchanged — but it's loaded here because
// next/font wants its variable on <html>.
const displaySans = Instrument_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Corner Bagel",
  description: "The Corner Bagel",
};

// Deliberately bare otherwise — no floating chrome (corner icon, email
// signup pop-up, privacy footer link) lives here. That's all in
// app/(marketing)/layout.tsx instead, so /shop (a separate top-level
// segment) never renders it and this root layout has no reason to opt out
// of static prerendering. Cookie consent is the one exception: it belongs
// everywhere, including the shop subdomain (its cart uses localStorage
// too), and — like the components it's next to here — is a plain client
// component with no server-side host/pathname dependency, so it doesn't
// force this layout into dynamic rendering the way reading headers() did.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${displaySans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col relative" suppressHydrationWarning>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
