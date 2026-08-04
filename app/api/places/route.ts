import {
  DELIVERY_ORIGIN,
  DELIVERY_RADIUS_MILES,
  milesBetween,
} from "../../(marketing)/locations/locations";

// Google Places, proxied rather than called from the browser.
//
// A browser-side Places key has to ship in the page, and the only thing
// standing between it and someone else's bill is an HTTP-referrer
// restriction, which is a header anyone can set. Keeping the key here means
// it's never served, and it puts the delivery-radius check on the server too
// — where it belongs, since a check the client performs is a check the client
// can skip.
//
// Two actions on one route because they're one conversation: `autocomplete`
// as the visitor types, then `details` once for the address they pick. The
// session token ties them together, which is also how Google bills them —
// a session of autocomplete calls plus one details call counts once, so
// dropping the token would multiply the cost of every keystroke.
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

// Bias suggestions toward the shop rather than the whole country. This is a
// bias, not a filter — Google still returns better matches from further out,
// which is what we want: someone typing an address we can't reach should see
// it and be told it's out of range, not be quietly shown nothing.
const BIAS_RADIUS_METRES = 20000;

type Suggestion = { placeId: string; primary: string; secondary: string };

function apiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

async function autocomplete(input: string, sessionToken: string, key: string) {
  const response = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input,
      sessionToken,
      // Street addresses only. Without this a query like "8th" comes back
      // full of businesses and neighbourhoods, none of which anyone can be
      // delivered to.
      includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      includedRegionCodes: ["us"],
      locationBias: {
        circle: {
          center: {
            latitude: DELIVERY_ORIGIN.position[0],
            longitude: DELIVERY_ORIGIN.position[1],
          },
          radius: BIAS_RADIUS_METRES,
        },
      },
    }),
  });

  if (!response.ok) {
    return { ok: false as const, status: response.status };
  }

  const body = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };

  const suggestions: Suggestion[] = (body.suggestions ?? [])
    .map((entry) => entry.placePrediction)
    .filter((prediction) => typeof prediction?.placeId === "string")
    .map((prediction) => ({
      placeId: prediction!.placeId!,
      primary: prediction!.structuredFormat?.mainText?.text ?? "",
      secondary: prediction!.structuredFormat?.secondaryText?.text ?? "",
    }));

  return { ok: true as const, suggestions };
}

async function details(placeId: string, sessionToken: string, key: string) {
  // The field mask is what's billed, so it asks for exactly the two things
  // this needs and nothing else.
  const url = `${DETAILS_URL}/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "formattedAddress,location",
    },
  });

  if (!response.ok) return { ok: false as const, status: response.status };

  const body = (await response.json()) as {
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };

  const lat = body.location?.latitude;
  const lng = body.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || !body.formattedAddress) {
    return { ok: false as const, status: 502 };
  }

  const miles = milesBetween(DELIVERY_ORIGIN.position, [lat, lng]);

  return {
    ok: true as const,
    address: body.formattedAddress,
    lat,
    lng,
    miles,
    // The answer the client actually acts on. Computed here so it can't be
    // bypassed by editing what the browser sends on.
    inRange: miles <= DELIVERY_RADIUS_MILES,
  };
}

export async function POST(request: Request) {
  const key = apiKey();
  if (!key) {
    // Explicit rather than silently returning no suggestions, which would
    // look identical to "no such address" and send someone hunting for a
    // typo that isn't there.
    return Response.json(
      {
        error:
          "Address search isn't configured. Set GOOGLE_PLACES_API_KEY to enable delivery.",
        configured: false,
      },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as {
    action?: unknown;
    input?: unknown;
    placeId?: unknown;
    sessionToken?: unknown;
  } | null;

  const sessionToken =
    typeof body?.sessionToken === "string" && body.sessionToken.length > 0
      ? body.sessionToken
      : null;
  if (!sessionToken) {
    return Response.json({ error: "Missing session token." }, { status: 400 });
  }

  try {
    if (body?.action === "autocomplete") {
      const input = typeof body.input === "string" ? body.input.trim() : "";
      if (input.length < 3) return Response.json({ suggestions: [] });
      const result = await autocomplete(input, sessionToken, key);
      if (!result.ok) {
        return Response.json({ error: "Address search failed." }, { status: 502 });
      }
      return Response.json({ suggestions: result.suggestions });
    }

    if (body?.action === "details") {
      const placeId = typeof body.placeId === "string" ? body.placeId : "";
      if (!placeId) return Response.json({ error: "Missing place." }, { status: 400 });
      const result = await details(placeId, sessionToken, key);
      if (!result.ok) {
        return Response.json({ error: "Couldn't read that address." }, { status: 502 });
      }
      return Response.json({
        address: result.address,
        lat: result.lat,
        lng: result.lng,
        miles: result.miles,
        inRange: result.inRange,
        radiusMiles: DELIVERY_RADIUS_MILES,
      });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    // A network failure reaching Google, not a bad request.
    return Response.json({ error: "Address search is unavailable." }, { status: 502 });
  }
}
