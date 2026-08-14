import { ordersAhead, ordersAheadOf } from "../../kitchenQueue";
import { isOpenNow } from "../../shopFacts";
import { countOpenOrders, isToastConfigured } from "../../toast";

// How busy the counter is, for the line under the Order button.
//
// Two shapes of answer, and the difference is the whole point of the endpoint:
//
//   { known: false }              we cannot say. The component renders nothing.
//   { known: true, ahead: 0 }     nothing waiting. A real, checked zero.
//   { known: true, ahead: 6 }     six orders on the counter.
//
// A missing source, a failed query, and a shut shop all give the first.
// Rendering those as a confident "no orders ahead" would be a number invented
// out of an error, on the screen somebody uses to decide whether to walk over.
//
// ——— Where the number comes from ———
//
// Toast when it is connected, because Orders Hub is the till: it sees every
// ticket the kitchen has, whatever channel it arrived through, and it is read
// rather than accumulated so nothing can drift. Our own table otherwise, which
// counts what passed through /api/shop-order — a subset, and with no counter
// ordering it is very nearly all of it.
//
// The fallback is second and not first on purpose. Both answer the same
// question and Toast answers it better; ours exists so the feature does not go
// dark on a deployment where Toast is not wired up yet, which is the state
// this shop is in today.
//
// Deliberately not merged. Counting both and taking the larger would be a way
// of double-counting the same order twice — every order this app places is
// also a Toast order — and taking the smaller would prefer the source that
// knows less. One source per request, the better one when it is there.

export const dynamic = "force-dynamic";

// One call, however many people open the sheet in the same few seconds.
//
// A morning rush is exactly when this number matters and exactly when it would
// otherwise become a Toast request per visitor, against an API with rate
// limits that the checkout also depends on. Fifteen seconds is short enough
// that the count is about now and long enough that a queue of people looking
// at the queue is not itself the load.
const TTL_MS = 15_000;
let cached: { at: number; ahead: number | null } | null = null;

async function currentCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ahead;
  const ahead = isToastConfigured() ? await countOpenOrders() : await ordersAhead();
  // Failures are cached too, briefly. A Toast outage would otherwise mean
  // every sheet open waits on a call that is going to fail anyway.
  cached = { at: Date.now(), ahead };
  return ahead;
}

// ——— Two questions, one endpoint ———
//
// Without `?id=`: how much work is on the counter. That is the question
// before you order, and it decides whether you have time to walk over.
//
// With `?id=`: how many orders are ahead of that one. That is the question
// after you order, and it is a different count — not the first minus one,
// because orders placed after yours are ahead of nobody.
//
// The second never goes to Toast. Orders Hub gives a better count of the
// whole counter but no way to say where one ticket sits in it; our own table
// timestamps every row, so position comes from there or not at all. On a
// deployment with Toast and no database the load line works and the position
// line renders nothing, which is the right way round — the shop-wide number
// is the one strangers see.
//
// And it is never cached. The count below is shared by everyone looking at
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
  // saying nothing. The shop-wide count keeps the check: that one is for
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
  // Toast, Postgres, or anything about how either is reached — a visitor
  // learns only what the missing line already told them.
  //
  // Nothing reads this but a human. The component checks `known` and stops.
  if (!isOpenNow()) return Response.json({ known: false, why: "closed" });

  const ahead = await currentCount();
  if (ahead === null) return Response.json({ known: false, why: "unavailable" });

  return Response.json(
    { known: true, ahead },
    // Matches the server-side cache, so a browser that asks twice in ten
    // seconds does not even make the request.
    { headers: { "Cache-Control": "public, max-age=15" } },
  );
}
