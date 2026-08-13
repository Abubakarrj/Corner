import { timingSafeEqual } from "node:crypto";
import { geocode, googleMapsKey, routeBetween, suggest } from "../../googleMaps";
import { deliveryOrigin } from "../../storePlaces";

// Is Google answering? One request, a plain-English answer.
//
// ——— Why this exists ———
//
// Every Google failure in this app is deliberately survivable. A geocode that
// misses returns null, a Routes call that is refused falls back to a straight
// line, autocomplete that fails returns an empty list. That is the right
// behaviour — a map service having a bad afternoon must not stop a shop taking
// orders — and it has one consequence worth naming: from the outside, broken
// looks exactly like working.
//
// It stayed broken here for weeks. The delivery radius quietly widened, the
// fee explainer shipped with its distance line permanently absent, and the
// only evidence was a console line on a hosting dashboard nobody opens. So:
// a URL that says which of the three APIs answer, and for the one that
// doesn't, what Google actually said.
//
// ——— Why it is behind a token ———
//
// It spends real API quota on every hit, and it names the deployment's
// configuration problems. Neither is something to leave open. Set
// MAPS_DIAGNOSTIC_TOKEN, check the page, and remove the variable — with it
// unset this route does not exist, which is the state it should spend most of
// its life in.
//
// It never reports the key itself. Not the value, not a prefix, not a length.
// The answer to "is the key right" is which calls succeeded.

export const dynamic = "force-dynamic";

/** Constant-time compare that tolerates a length mismatch. A plain === leaks
 *  the token's length through timing, which is a small thing, and using
 *  timingSafeEqual on unequal buffers throws, which is a bigger one. */
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Somewhere real to aim at. A fixed address a couple of miles from the
// counter, rather than the shop itself, which would answer zero miles and
// prove nothing about a real delivery.
const PROBE_ADDRESS = "3450 Wilshire Blvd, Los Angeles, CA 90010";

// The same place as coordinates, so Routes is tested on its own.
//
// The first cut routed to whatever geocoding resolved, which meant a failing
// geocode reported Routes as "not tried" — and the three APIs fail
// independently. A project with Geocoding enabled and Routes not is the
// commonest way to get exactly the bug this endpoint exists to find, and the
// endpoint would have skipped the check that finds it.
const PROBE_POINT: [number, number] = [34.0616, -118.3009];

export async function GET(request: Request) {
  const expected = process.env.MAPS_DIAGNOSTIC_TOKEN;
  const given = new URL(request.url).searchParams.get("token") ?? "";
  // 404, not 401. An endpoint that answers "wrong token" has told you it is
  // there and worth guessing at; one that is simply absent has not.
  if (!expected || !matches(given, expected)) {
    return new Response("Not found", { status: 404 });
  }

  if (!googleMapsKey()) {
    return Response.json({
      ok: false,
      summary: "GOOGLE_MAPS_API_KEY is not set on this deployment. Nothing else was tried.",
    });
  }

  // The same origin a real delivery is quoted from, resolved the same way, so
  // a passing check here is a passing check for the thing that matters.
  const origin = await deliveryOrigin();

  // All three at once, and none waiting on another. They are separate APIs
  // with separate enable switches, and any of them can be the broken one.
  const [place, route, suggestions] = await Promise.all([
    geocode(PROBE_ADDRESS, origin),
    routeBetween(origin, PROBE_POINT),
    suggest("3450 Wilshire", "address", origin),
  ]);

  const checks = {
    geocoding: place
      ? { ok: true as const, resolved: place.address }
      : {
          ok: false as const,
          why:
            "Geocoding returned no usable result for a known-good address." +
            " Either the Geocoding API is off on this project, or the key is" +
            " restricted in a way that refuses server calls.",
        },
    routes: route.ok
      ? { ok: true as const, miles: Number(route.drive.miles.toFixed(1)) }
      : {
          ok: false as const,
          status: route.status,
          why: route.why,
          // Google's own words, which is usually the sentence that solves it.
          google: route.detail,
        },
    places: suggestions.length > 0
      ? { ok: true as const, suggestions: suggestions.length }
      : {
          ok: false as const,
          why:
            "Places autocomplete returned nothing for a partial address." +
            " Check Places API (New) is enabled on this project.",
        },
  };

  const failing = Object.entries(checks)
    .filter(([, check]) => !check.ok)
    .map(([name]) => name);

  return Response.json({
    ok: failing.length === 0,
    summary:
      failing.length === 0
        ? "All three answered. Road distances, address search and geocoding are live."
        : `Failing: ${failing.join(", ")}. Each entry below says what Google returned.`,
    // Said on every response, passing or not, because it is the fix roughly
    // nine times out of ten and the person reading this is looking for it.
    hint:
      "These calls come from a server and carry no HTTP referrer. A key" +
      " restricted by HTTP referrer will always refuse them. Give the server" +
      " key IP restrictions or none, keep the referrer-restricted key for the" +
      " browser in GOOGLE_MAPS_BROWSER_KEY, and make sure Geocoding API," +
      " Routes API and Places API (New) are all enabled on the project the" +
      " key belongs to.",
    checks,
  });
}
