import MembershipForm from "./MembershipForm";

export const metadata = {
  title: "Membership — Corner Bagel",
  description: "Join Corner Bagel, or sign in to reorder.",
};

// ?step=join lands on the Join heading rather than Login. The two are the same
// act — Auth0's email connection creates the account on the first code — so
// this only changes what the page promises, not what it does.
//
// The old `recover` and `reset` steps are gone with the passwords they were
// for. Anything unrecognised falls back to Login.
export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  return <MembershipForm initialStep={step === "join" ? "join" : "signin"} />;
}
