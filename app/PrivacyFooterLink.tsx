import Link from "next/link";

// Visibility (hidden on the shop subdomain) is decided by the caller —
// app/layout.tsx — server-side via the Host header. See the comment there
// for why.
export default function PrivacyFooterLink() {
  return (
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
  );
}
