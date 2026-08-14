import "server-only";

import { timingSafeEqual } from "node:crypto";

// The gate on the diagnostic endpoints.
//
// One token for all of them. They report how this deployment is configured,
// which is not something to leave open, and some of them spend real API quota
// per hit.
//
// 404 rather than 401 when it does not match: an endpoint that answers "wrong
// token" has told you it exists and is worth guessing at. One that is simply
// absent has not.

/** Constant-time compare that tolerates a length mismatch. A plain === leaks
 *  the token's length through timing, which is small, and timingSafeEqual on
 *  unequal buffers throws, which is worse. */
function matches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Whether this request may see a diagnostic.
 *
 *  MAPS_DIAGNOSTIC_TOKEN is still read, because it was the name before there
 *  was more than one of these and it may already be set on a deployment.
 *  Either works; DIAGNOSTIC_TOKEN is the one to use. */
export function authorized(request: Request): boolean {
  const expected =
    process.env.DIAGNOSTIC_TOKEN ?? process.env.MAPS_DIAGNOSTIC_TOKEN;
  if (!expected) return false;
  const given = new URL(request.url).searchParams.get("token") ?? "";
  return matches(given, expected);
}

export function notFound(): Response {
  return new Response("Not found", { status: 404 });
}
