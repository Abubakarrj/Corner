import { readInvite } from "../invite";
import JoinForm from "./JoinForm";

// Redeeming an invite. Public — the token in the URL is the credential, which
// is why it is signed, short-lived and carries the role rather than trusting a
// form field.
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await readInvite(token) : null;

  if (!invite || !token) {
    return (
      <main>
        <h1 className="m-0 text-[24px] font-semibold text-heading">That link didn&rsquo;t work</h1>
        <p className="mt-2 text-[14px] text-muted">
          Invite links last seven days. Ask whoever invited you to send a new one.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1 className="m-0 text-[24px] font-semibold text-heading">Choose a password</h1>
      <p className="mb-7 mt-1 text-[14px] text-muted">
        {invite.invitedBy} invited {invite.email} to the Corner Bagel team tools.
      </p>
      <JoinForm token={token} />
    </main>
  );
}
