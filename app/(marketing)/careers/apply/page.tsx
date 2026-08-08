import ApplicationForm from "../ApplicationForm";
import { POSITIONS, type PositionId } from "../application";
import { OPENINGS } from "../openings";

export const metadata = {
  title: "Apply — Corner Bagel",
  description: "Apply to work at Corner Bagel.",
};

// ?role= and ?at= are the card on /careers that was pressed: the job, and the
// shop it was for. Together they are the whole of what the applicant has
// already told us, and the form's job is to not ask again.
//
// Both are checked against the real lists rather than trusted. `at` in
// particular ends up printed on a PDF and mailed, so anything arbitrary in a
// query string would be text of somebody else's choosing on our letterhead.
// Unrecognised values are dropped rather than raising: a stale link, or a
// shop that has closed since, should cost the pre-fill and not the page.
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; at?: string }>;
}) {
  const { role, at } = await searchParams;
  const known = POSITIONS.find((position) => position.id === role);
  const listed = OPENINGS.some(
    (opening) => opening.role === known?.id && opening.location === at,
  );

  return (
    <ApplicationForm
      role={(known?.id as PositionId) ?? null}
      location={listed && at ? at : null}
    />
  );
}
