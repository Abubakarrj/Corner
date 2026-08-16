import { notFound } from "next/navigation";
import { POSITIONS, type PositionId } from "../../application";
import { DESCRIPTIONS, JOB_LOCATION, SHOP_BLURB } from "../../jobDescription";
import JobDescriptionView from "./JobDescriptionView";

// A job description, as a page in the app.
//
// ——— Why this exists at all ———
//
// It was a link straight to the PDF, opened in a new tab. That works in a
// browser and traps somebody in the installed app: the manifest says
// `display: standalone`, so there is no address bar, no tab strip and no back
// gesture out of a document viewer. Tapping "Full job description" was a one
// way trip, which is the worst thing a link can be.
//
// So the description is a page now, with the app's own back control on it, and
// the PDF is offered from here for anybody who wants the file. Same text
// either way — both read jobDescription.ts.

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const known = POSITIONS.find((position) => position.id === role);
  if (!known) return {};
  return {
    title: `${DESCRIPTIONS[known.id].position} — Corner Bagel`,
    description: DESCRIPTIONS[known.id].role[0],
  };
}

/** Every role gets a page at build time. There are four of them and they are
 *  constants, so there is nothing to render on demand. */
export function generateStaticParams() {
  return POSITIONS.map((position) => ({ role: position.id }));
}

export default async function JobDescriptionPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const known = POSITIONS.find((position) => position.id === role);
  // notFound rather than a page with nothing on it, and checked against
  // POSITIONS so adding a role is the only edit.
  if (!known) notFound();

  return (
    <JobDescriptionView
      role={known.id as PositionId}
      description={DESCRIPTIONS[known.id]}
      blurb={SHOP_BLURB}
      location={JOB_LOCATION}
    />
  );
}
