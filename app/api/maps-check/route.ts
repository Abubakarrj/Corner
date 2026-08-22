import { authorized, notFound } from "../../diagnostics";
import { geocode, googleMapsKey, matrixProblem, routeBetween, suggest } from "../../googleMaps";
import { LOCATIONS } from "../../(marketing)/locations/locations";
import { googleMapsBrowserKey } from "../../googleMaps";
import { shapeFingerprint } from "../../deliveryArea";
import { deliveryShape } from "../../deliveryShape";
import { deliveryArea } from "../../deliveryArea";
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
// DIAGNOSTIC_TOKEN, check the page, and remove the variable — with it unset
// this route does not exist, which is the state it should spend most of its
// life in. The gate is shared with /api/status; see app/diagnostics.ts.
//
// It never reports the key itself. Not the value, not a prefix, not a length.
// The answer to "is the key right" is which calls succeeded.

export const dynamic = "force-dynamic";

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
  if (!authorized(request)) return notFound();

  if (!googleMapsKey()) {
    return Response.json({
      ok: false,
      summary: "GOOGLE_MAPS_API_KEY is not set on this deployment. Nothing else was tried.",
    });
  }

  // The same origin a real delivery is quoted from, resolved the same way, so
  // a passing check here is a passing check for the thing that matters.
  const origin = await deliveryOrigin();

  // All four at once, and none waiting on another. They are separate APIs
  // with separate enable switches, and any of them can be the broken one.
  //
  // ——— ⚠️ Why the fourth one was added ———
  //
  // The first three said "all three answered" on a deployment whose delivery
  // map had disappeared, and they were not lying: geocoding worked, a single
  // route worked, autocomplete worked. The boundary is drawn with a different
  // call — computeRouteMatrix, several hundred elements at a time — and
  // nothing here had ever touched it. So the one Google surface that can take
  // the map off a public page was the one surface with no check on it.
  //
  // It is the real measurement rather than a probe shaped like one, because a
  // two-by-two matrix proves the API is enabled and proves nothing about the
  // call the app actually makes. It is also cached, so this costs Routes quota
  // once an hour at most however often somebody refreshes this page.
  const started = Date.now();
  const [place, route, suggestions, area] = await Promise.all([
    geocode(PROBE_ADDRESS, origin),
    routeBetween(origin, PROBE_POINT),
    suggest("3450 Wilshire", "address", origin),
    deliveryArea(),
  ]);
  const areaMs = Date.now() - started;

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
    // ——— ⚠️ Is the key that bills you sitting in the page source? ———
    //
    // One key used by both the browser and the server cannot be
    // referrer-restricted, because server requests carry no referrer — see the
    // note at the top of app/api/maps-config. So a single key means the key
    // that bills this account is in the HTML of a public site, and an
    // unexplained bill is as likely to be somebody else's traffic as your own.
    // Two keys is the configuration that cannot be lifted.
    keys: googleMapsBrowserKey()
      ? { ok: true as const, separate: true }
      : {
          ok: false as const,
          separate: false,
          why:
            "GOOGLE_MAPS_BROWSER_KEY is not set, so the browser is handed the" +
            " same key the server uses. That key cannot be referrer-restricted" +
            " and is readable in the page source. Set a second key, restricted" +
            " by HTTP referrer to this domain, and restrict the server key by" +
            " API instead.",
        },

    // ——— ⚠️ Which counters still cost a Geocoding call ———
    //
    // storePlace() returns before the geocoder when a location has surveyed
    // `door` coordinates. Every shop without them is a Geocoding lookup per
    // process, and — until the backoff added alongside this — a lookup per
    // request whenever the key was refused. Eleven typed coordinates end it.
    doors: (() => {
      const missing = LOCATIONS.filter((store) => !store.door).map((store) => store.id);
      return missing.length === 0
        ? { ok: true as const, surveyed: LOCATIONS.length }
        : {
            ok: false as const,
            missing,
            why:
              `${missing.length} of ${LOCATIONS.length} counters have no surveyed` +
              " door, so each one is geocoded once per server process. Add" +
              " `door: [lat, lng]` in locations.ts to stop paying for an answer" +
              " that does not change.",
          };
    })(),

    // ——— ⚠️ The committed boundary, and whether it still describes this shop ———
    //
    // The shape is measured once by `npm run measure:delivery` and checked in;
    // see app/deliveryShape.ts for why. That makes staleness the failure worth
    // reporting here: a counter opened, nobody re-ran the script, and the map
    // is quietly missing a lobe. tests/deliveryShape.test.ts fails on it too,
    // and this is what says so on a deploy that got past the test.
    shape: (() => {
      const committed = deliveryShape();
      if (!committed) {
        return {
          ok: false as const,
          why:
            "No committed boundary in app/deliveryShape.json, so every cold" +
            " start measures it live — about 2,640 Route Matrix elements each" +
            " time. Run `npm run measure:delivery` and commit the file.",
        };
      }
      const now = shapeFingerprint();
      return committed.measuredFrom === now
        ? { ok: true as const, measuredAt: committed.measuredAt }
        : {
            ok: false as const,
            measuredAt: committed.measuredAt,
            why:
              "The committed boundary was measured from a different set of" +
              " counters. The published map is stale. Run" +
              " `npm run measure:delivery` and commit app/deliveryShape.json.",
          };
    })(),
    // The shaded shape on /delivery-areas. `patches` is how many separate lobes
    // the counters make — more than one is normal now that there is a shop in
    // Orange County — and `counters` is how many origins it was measured
    // against.
    deliveryArea: area
      ? {
          ok: true as const,
          patches: area.rings.length,
          counters: area.origins.length,
          ms: areaMs,
        }
      : {
          ok: false as const,
          ms: areaMs,
          // ⚠️ Google's own sentence when there is one. This is the whole
          // point of the check: the page renders no map and says nothing about
          // why, deliberately, so the reason has to be reachable from
          // somewhere and this is the somewhere.
          google: matrixProblem(),
          why:
            "The delivery boundary could not be measured, so /delivery-areas" +
            " draws no shaded area at all — the address check underneath it" +
            " still works, which is why this can go unnoticed. Route Matrix is" +
            " a separate call from the single route above and can fail on its" +
            " own: check Routes API is enabled, that the key has no HTTP" +
            " referrer restriction, and that the project is not out of quota.",
        },
  };

  const failing = Object.entries(checks)
    .filter(([, check]) => !check.ok)
    .map(([name]) => name);

  return Response.json({
    ok: failing.length === 0,
    summary:
      failing.length === 0
        ? "All four answered. Road distances, address search, geocoding and the" +
          " delivery boundary are live."
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
