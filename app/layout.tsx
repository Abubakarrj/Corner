import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CookieConsent from "./CookieConsent";
import SessionSync from "./auth/SessionSync";
import NavigationDepth from "./navigationDepth";
import PressHaptics from "./pressHaptics";
import { CapabilitiesProvider } from "./capabilities";
import { THEME_SCRIPT } from "./themeScript";
import { LOCALE_SCRIPT } from "./localeScript";

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
  // No SVG entry here any more. public/icon.svg is the bare bagel on a
  // transparent ground — right for the logo, wrong for a tab, where it left
  // the browser showing a different icon from the one on the home screen.
  // app/favicon.ico is now the same composed artwork at 16/32/48 and Next
  // links it automatically, so there is one icon everywhere.
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Paints the browser chrome cream site-wide. /shop overrides this with its
// own viewport export to add viewport-fit=cover; the colour is the same.
//
// A literal, because a <meta> tag can't resolve a custom property — this used
// to say var(--cb-cream), which browsers ignore. It's the light value; the
// theme script in <head> rewrites it when the page resolves to dark, which is
// also why there's one tag here rather than a light/dark pair with `media`
// (a manual override has to win over the system, and `media` can't do that).
export const viewport: Viewport = {
  themeColor: "#f7f4eb",
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
    // lang and dir are the server's best guess and nothing more. The script
    // below replaces both before the first paint, from the stored choice or
    // the browser's own languages, which is why suppressHydrationWarning is
    // load-bearing here: the document React rendered and the document the
    // visitor sees deliberately differ on these two attributes.
    <html
      lang="en"
      dir="ltr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Before the first paint — see THEME_SCRIPT. suppressHydrationWarning
            on <html> above is what lets it stamp data-theme without React
            objecting that the server didn't render it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Same reasoning, and more urgent: dir="rtl" applied in an effect is
            a frame of the entire app laid out backwards, which is a worse
            flash than any colour. See LOCALE_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: LOCALE_SCRIPT }} />

        {/* The map's hosts, warmed up before anything asks for them.
            The basemap is the slowest thing in the app and none of it is ours:
            /locations mounts, fetches its key, then fetches Google's bootstrap,
            which fetches the real library, which fetches tiles — four round
            trips to two origins, and the first two each start with a cold DNS
            lookup and a TLS handshake. Preconnect gets both of those out of
            the way while the page is still parsing, so the request that
            matters starts on an open socket.
            crossOrigin on the tile host because tiles are fetched as CORS
            requests; a preconnect that doesn't match the request's mode opens
            a second connection and helps nothing. */}
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://maps.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col relative" suppressHydrationWarning>
        <CapabilitiesProvider>
          {children}
          <CookieConsent />
          <SessionSync />
          {/* Renders nothing. It counts the app's own navigations so a back
              control can tell "the page before this one was ours" from "the
              page before this one was another site" — see navigationDepth.ts.
              Here rather than in a layout further down because it has to see
              every route, including the marketing ones. */}
          <NavigationDepth />
          {/* Renders nothing. One delegated click listener that buzzes on any
              control being pressed, so a haptic is a property of being pressed
              rather than something each new button has to remember. Here
              because it has to see the whole app. See pressHaptics.ts. */}
          <PressHaptics />
        </CapabilitiesProvider>
      </body>
    </html>
  );
}
