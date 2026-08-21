import Lost from "./Lost";

export const metadata = {
  title: "Page not found — Corner Bagel",
  robots: { index: false, follow: false },
};

// Every unmatched route in the app. See app/Lost.tsx for why this exists at
// all — the short version is that the installed app has no back button, so
// Next's stock 404 was the end of the session rather than a wrong turn.
export default function NotFound() {
  return <Lost title="lost.title" lede="lost.lede" />;
}
