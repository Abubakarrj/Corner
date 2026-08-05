import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

// Instrument Sans used to be loaded here as the shop's heading face, under
// --font-display. The shop is on a Helvetica system stack now (see SHOP_FONT
// in app/shop/shopControls.ts), so nothing referenced that variable any more
// and it was a webfont being downloaded for nothing. Geist stays — the
// marketing site's type is unchanged.

export const metadata: Metadata = {
  title: "Corner Bagel",
  description: "Order bagels, sandwiches, spreads and drinks from Corner Bagel.",
  // Added to the home screen on an iPhone, this is what makes it open like an
  // app rather than a bookmark: a PNG icon (iOS ignores SVG for
  // apple-touch-icon, which is why the bagel is rastered into
  // public/apple-touch-icon.png), a standalone display mode, and a short
  // name so the label under the icon isn't truncated.
  applicationName: "Corner Bagel",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Corner Bagel",
    // "default" rather than translucent: the shop already extends under the
    // status bar via viewport-fit=cover, and a translucent bar there would
    // put the time on top of the header's controls.
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Paints the browser chrome cream site-wide. /shop overrides this with its
// own viewport export to add viewport-fit=cover; the colour is the same.
export const viewport: Viewport = {
  themeColor: "#F7F4EB",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col relative" suppressHydrationWarning>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
