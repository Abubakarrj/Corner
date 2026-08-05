import MembershipForm from "./MembershipForm";

export const metadata = {
  title: "Membership — Corner Bagel",
  description: "Join Corner Bagel membership, or sign in to reorder.",
};

const STEPS = ["signin", "join", "recover", "reset"] as const;
type Step = (typeof STEPS)[number];

// ?step= lets a link land on a specific screen. The one that matters is
// `reset`: a password-reset link in an email has to arrive somewhere, and
// that somewhere can't be reachable by tapping around the app. Anything
// unrecognised falls back to the login screen rather than erroring.
export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const initialStep = STEPS.includes(step as Step) ? (step as Step) : "signin";
  return <MembershipForm initialStep={initialStep} />;
}
