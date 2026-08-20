import { squareConfig, squareLocationFor } from "../../square";

// What the browser needs to put Square's card fields on the page.
//
// ——— Two of the three Square values, and only two ———
//
// The Web Payments SDK authenticates from the page with an application id and a
// location id. Both are designed to be public: they identify the merchant, they
// travel in every request the SDK makes, and any visitor can read them out of
// the network tab. That is Square's design, the same way the Maps JavaScript
// key is Google's — see the note in app/api/maps-config/route.ts.
//
// ⚠️ The access token is the third value and it is not here, will not be here,
// and must never be. It authorises charges and refunds against the whole
// account. The application id identifies; the token spends. If you are ever
// looking at this file wondering why the browser cannot reach the token: that
// is the feature.
//
// ——— Read at request time, not compiled in ———
//
// Same reason as the map config. A NEXT_PUBLIC_ variable is baked into the
// bundle at build time, so rotating the application id would mean a rebuild.
// This way pasting a new value into Render takes effect on the next request.
//
// ——— The environment, spelled out ———
//
// The SDK ships from two different origins, one per environment, and loading
// the production script against a sandbox application id fails in a way that
// reads like a network problem. So the server says which environment it is
// configured for rather than leaving the browser to guess from the id's shape.
export const dynamic = "force-dynamic";

export function GET() {
  const config = squareConfig();
  const applicationId = process.env.SQUARE_APPLICATION_ID?.trim();

  // All three or nothing. A page given an application id but no location has
  // everything it needs to render a card field and nothing it needs to
  // tokenize, which is a form that looks like it works right up until somebody
  // presses Pay.
  if (!config || !applicationId) {
    return Response.json({ provider: null });
  }

  return Response.json({
    provider: "square",
    applicationId,
    locationId: squareLocationFor(undefined),
    // "sandbox" or "production", so the browser loads the matching script.
    environment: process.env.SQUARE_ENV?.trim().toLowerCase() === "production"
      ? "production"
      : "sandbox",
  });
}
