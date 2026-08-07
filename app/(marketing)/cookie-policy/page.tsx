import PolicyPage from "../policies/PolicyPage";

// The cookie policy the banner's "consent" link points at.
//
// The document itself lives in ../policies/policy.ts and its translations in
// ../policies/policyPacks.ts; the markup is shared with /privacy-policy, since
// the two are siblings and a visitor moving between them shouldn't feel like
// they've left the site.
//
// Content is the Corner Bagel Cookie Policy supplied by the business
// (Public Entity Holdings, last updated August 1, 2026), reproduced as
// written. Anything factual here — what cookies are set, whether analytics
// are live — is theirs to state, not something to infer from the code.
export const metadata = {
  title: "Cookie Policy — Corner Bagel",
  description:
    "How Corner Bagel uses cookies and similar tracking technologies on our website.",
};

export default function CookiePolicyPage() {
  return <PolicyPage which="cookie" />;
}
