import type { Viewport } from "next";
import AppShellChrome from "../AppShellChrome";

// Cream browser chrome and a cream document, matching /shop and /gift.
//
// Without this the page paints cream but the document underneath stays white,
// which shows up in two places on a phone: the status-bar strip above the
// page, and the band iOS reveals when you rubber-band past the top. The form
// looked like it had a white header it never asked for.
//
// Scoped to this segment — the rest of the marketing site is deliberately
// white. Same reasoning as the gift layout next door.
export const viewport: Viewport = {
  themeColor: "var(--cb-cream)",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShellChrome />
      {children}
    </>
  );
}
