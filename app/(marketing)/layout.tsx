import DropListModal from "../DropListModal";
import PrivacyFooterLink from "../PrivacyFooterLink";

// The marketing site's floating chrome (email signup pop-up, privacy-policy
// footer link) lives here rather than in the true root layout, so /shop — a
// separate top-level segment, outside this route group — never renders any
// of it. That's a structural guarantee: no runtime host/pathname check
// needed, and it keeps the root layout (and every other route) free to stay
// statically prerendered.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <DropListModal />
      <PrivacyFooterLink />
    </>
  );
}
