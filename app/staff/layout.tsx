import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team tools — Corner Bagel",
  // Not a page for the public and not a page for a crawler. The login would
  // keep anybody out either way, but an indexed sign-in form is an invitation
  // to try it.
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page px-5 py-8">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </div>
  );
}
