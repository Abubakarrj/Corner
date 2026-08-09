import { statusOf } from "../../orderStatus";

// What the tracker polls.
//
// The customer's device holds the two ids — Toast's order guid and Uber's
// delivery id — because the order itself lives on the device and always has.
// This endpoint turns those into a stage, and holds nothing about the person
// asking.
//
// That is the whole privacy story of this feature: an opaque provider id in,
// a word like "ready" out. No name, no email, no basket, nothing joined to
// anything. The stance in /api/apply — that a store we have no plan to query
// is the wrong trade — survives, because there is still no such store.
//
// Guessing an id gets somebody another person's cooking/ready, which is why
// the ids are the providers' own opaque guids rather than anything countable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const toastGuid = params.get("toast")?.trim() || undefined;
  const deliveryId = params.get("uber")?.trim() || undefined;

  if (!toastGuid && !deliveryId) {
    return Response.json({ error: "api.badRequest" }, { status: 400 });
  }

  const status = await statusOf({ toastGuid, deliveryId });
  // Not knowing is a normal answer, not a failure: an order placed before any
  // of this existed, or one whose kitchen has not touched it yet, has nothing
  // to report and the tracker carries on with its estimate.
  return Response.json(status ?? { unknown: true }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
