import PolicyPage from "../policies/PolicyPage";

// The privacy policy. The document is ../policies/policy.ts, its translations
// ../policies/policyPacks.ts, and the markup is shared with /cookie-policy —
// see the note there.
export const metadata = {
  title: "Privacy Policy — Corner Bagel",
  description:
    "How Corner Bagel collects, uses, and safeguards your information.",
};

export default function PrivacyPolicyPage() {
  return <PolicyPage which="privacy" />;
}
