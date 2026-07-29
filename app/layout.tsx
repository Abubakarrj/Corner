import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import CornerBagelIcon from "./CornerBagelIcon";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Corner Bagel",
  description: "The Corner Bagel",
};

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
        <CornerBagelIcon />
        <div
          className="fixed bottom-4 right-4 z-50 text-[12px] opacity-75 font-sans"
          style={{
            color: "#ffffff",
            mixBlendMode: "difference",
            fontFamily: "var(--font-geist-sans), sans-serif",
          }}
        >
          <Link href="/privacy-policy" className="hover:cursor-pointer">
            Privacy Policy &nbsp; © 2026
          </Link>
        </div>
      </body>
    </html>
  );
}
