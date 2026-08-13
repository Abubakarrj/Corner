import { ordersAhead } from "../../kitchenQueue";
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

export async function GET() {
  // A shut shop has no queue worth reporting. The count would be whatever was
  // left open when the kitchen closed, which is a number about yesterday.
  if (!isOpenNow()) return Response.json({ known: false });

  const ahead = await currentCount();
  if (ahead === null) return Response.json({ known: false });

  return Response.json(
    { known: true, ahead },
    // Matches the server-side cache, so a browser that asks twice in ten
    // seconds does not even make the request.
    { headers: { "Cache-Control": "public, max-age=15" } },
  );
}
