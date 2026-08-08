import ApplicationForm from "../ApplicationForm";
import { POSITIONS, type PositionId } from "../application";

export const metadata = {
  title: "Apply — Corner Bagel",
  description: "Apply to work at Corner Bagel.",
};

// ?role= is which card on /careers was pressed. It pre-selects that job on
// step two and does nothing else — the form still lets somebody choose more
// than one, or drop it.
//
// Anything unrecognised is ignored rather than erroring: a stale link, or a
// role we stopped hiring for, should cost the pre-selection and not the page.
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const known = POSITIONS.find((position) => position.id === role);
  return <ApplicationForm role={(known?.id as PositionId) ?? null} />;
}
