import { LOCATIONS } from "../../(marketing)/locations/locations";
import { ordersAheadByCounter, ordersAheadOf } from "../../kitchenQueue";
import { isOpenNow } from "../../shopFacts";
import { countOpenPosOrders, isPosConfigured } from "../../pos";

// How busy a counter is, for the line under the Order button.
//
// Two shapes of answer, and the difference is the whole point of the endpoint:
//
//   { known: false }                        we cannot say. Nothing renders.
//   { known: true, counters: { … } }        a count for each counter.
//   { known: true, ahead: 0 }               with ?id=, one order's place.
//
// A missing source, a failed query, and a shut shop all give the first.
// Rendering those as a confident "no orders ahead" would be a number invented
// out of an error, on the screen somebody uses to decide whether to walk over.
//
// ——— ⚠️ Per counter, which it was not ———
//
// This answered one number for the whole company and every shop on the map was
// shown it. Three counters, one count: a queue at Wilshire made the Western
// outlet look busy, and somebody deciding whether to walk to Western was
// reading Wilshire's morning.
//
// A queue is a property of a kitchen. So the answer is now a count per counter,
// and the sheet reads its own.
//
// ——— One request, not one per counter ———
//
// Both sources can answer for every counter in a single call — Square's search
// already stamps each entry with its location, and our own table groups by the
// column — so asking three times would be three round trips for one answer that
// was always going to arrive together. The map warms this once per page.
//
// ——— Where the numbers come from ———
//
// The till when it is connected, because it is the till: it sees every ticket
// the kitchen has, whatever channel it arrived through, and it is read rather
// than accumulated so nothing can drift. Our own table otherwise, which counts
// what passed through /api/shop-order — a subset, and with no counter ordering
// it is very nearly all of it.
//
// ⚠️ With one exception, and it is the reason `byCounter` is nullable. Toast is
// configured with a single restaurant guid and cannot say which counter a
// ticket belongs to. When the till answers a total it cannot split, this falls
// through to our own table for the split rather than dividing that total up —
// a number apportioned by guesswork is not a better answer than a smaller
// number that is true.
//
// Deliberately not merged otherwise. Counting both and taking the larger would
// double-count the same order twice — every order this app places is also a
// till order — and taking the smaller would prefer the source that knows less.

export const dynamic = "force-dynamic";

/** The counters this endpoint answers about. */
const COUNTERS = LOCATIONS.map((store) => store.id);

// One call, however many people open the sheet in the same few seconds.
//
// A morning rush is exactly when this number matters and exactly when it would
// otherwise become a till request per visitor, against an API with rate limits
// that the checkout also depends on. Fifteen seconds is short enough that the
// count is about now and long enough that a queue of people looking at the
// queue is not itself the load.
const TTL_MS = 15_000;
let cached: { at: number; counters: Record<string, number> | null } | null = null;

async function currentCounts(): Promise<Record<string, number> | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.counters;

  let counters: Record<string, number> | null = null;
  if (isPosConfigured()) {
    const open = await countOpenPosOrders();
    // ⚠️ `byCounter` null and `open` null are different failures. The first is
    // a till that answered and cannot split; the second is a till that did not
    // answer. Both fall through to our own table here, but only because that
    // table can answer both questions — see the note above about not
    // apportioning a total.
    counters = open?.byCounter ?? null;
  }
  if (!counters) counters = await ordersAheadByCounter(COUNTERS);

  // Failures are cached too, briefly. A till outage would otherwise mean every
  // sheet open waits on a call that is going to fail anyway.
  cached = { at: Date.now(), counters };
  return counters;
}

// ——— Two questions, one endpoint ———
//
// Without `?id=`: how much work each counter has. That is the question before
// you order, and it decides whether you have time to walk over.
//
// With `?id=`: how many orders are ahead of that one, at the counter making it.
// That is the question after you order, and it is a different count — not the
// first minus one, because orders placed after yours are ahead of nobody.
//
// The second never goes to the till. A till gives a better count of the whole
// counter but no way to say where one ticket sits in it; our own table
// timestamps every row, so position comes from there or not at all. On a
// deployment with a till and no database the load line works and the position
// line renders nothing, which is the right way round — the counter-wide number
// is the one strangers see.
//
// And it is never cached. The counts below are shared by everyone looking at
// the map; a position belongs to one order and caching it under a shared key
// would hand somebody else's place in the line to the next visitor.
async function positionFor(id: string): Promise<Response> {
  const ahead = await ordersAheadOf(id);
  if (ahead === null) return Response.json({ known: false, why: "unavailable" });
  return Response.json({ known: true, ahead }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  // Deliberately before the opening-hours check. An order placed at 3:55pm is
  // still being made at 4:05pm, and telling the person waiting for it that the
  // shop is shut — when they are holding a receipt from it — is worse than
  // saying nothing. The counter-wide counts keep the check: those are for
  // somebody deciding whether to come, and there is no queue to join.
  if (id) return positionFor(id);

  // ——— Why `why` is here ———
  //
  // `{ known: false }` on its own is the right answer for the component and a
  // useless one for a person. It means the shop is shut, or it means no source
  // could answer, and those have completely different fixes — one is a clock
  // and one is a broken connection. Working out which took a round trip and a
  // token-gated endpoint, twice.
  //
  // Two values, and neither is worth hiding. Opening hours are printed on the
  // door. "unavailable" says a count could not be produced without naming
  // Square, Toast, Postgres, or anything about how any of them is reached — a
  // visitor learns only what the missing line already told them.
  //
  // Nothing reads this but a human. The component checks `known` and stops.
  if (!isOpenNow()) return Response.json({ known: false, why: "closed" });

  const counters = await currentCounts();
  if (!counters) return Response.json({ known: false, why: "unavailable" });

  return Response.json(
    { known: true, counters },
    // Matches the server-side cache, so a browser that asks twice in ten
    // seconds does not even make the request.
    { headers: { "Cache-Control": "public, max-age=15" } },
  );
}
