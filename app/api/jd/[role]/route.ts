import { POSITIONS, type PositionId } from "../../../(marketing)/careers/application";
import { renderJobDescriptionPdf } from "../jobDescriptionPdf";

// The job description for one role, as a PDF.
//
// Open rather than download: `inline` lets a phone show it in its own viewer,
// which is what somebody tapping a link on a job board expects. Saving it is
// one more tap from there, and a file that lands in Downloads unasked is the
// worse default.
//
// No rate limit and no token. It is four documents' worth of public text, the
// same text the shop would hand somebody across the counter, and it is built
// from constants in the bundle — no database, no third party, nothing billed.

/** Whether this is one of ours, checked against POSITIONS rather than against
 *  a list written here. Anything else is a 404 and not a rendered page with an
 *  empty description on it. */
function known(value: string): value is PositionId {
  return POSITIONS.some((position) => position.id === value);
}

export async function GET(_request: Request, context: { params: Promise<{ role: string }> }) {
  const { role } = await context.params;
  if (!known(role)) return new Response("Not found", { status: 404 });

  const { bytes, filename } = await renderJobDescriptionPdf(role, new Date());
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // An hour, matching the board's own revalidate. The document carries a
      // wage, and a wage can go stale — see the expiry in pay.ts — so a copy
      // cached for a day could outlive the number printed on it.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
