import type { Viewport } from "next";
import AppShellChrome from "../AppShellChrome";

// Cream browser chrome instead of the default white, matching /shop. Scoped
// to this segment — the marketing pages stay white.
export const viewport: Viewport = {
  themeColor: "#F7F4EB",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShellChrome />
      {children}
    </>
  );
}
