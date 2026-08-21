// Apple's proof that this domain is allowed to ask for Apple Pay.
//
// ——— ⚠️ Without this, nothing else about Apple Pay works ———
//
// Apple will not summon their sheet for a domain they have not verified, and
// they verify it by fetching this exact path over HTTPS and comparing what
// comes back against the file they issued. Until that succeeds,
// `payments.applePay()` throws, useApplePay stays quiet, and the tender is
// never offered. That is the correct failure — silent and safe — but it does
// mean a working deployment and a broken one look identical from the outside,
// so the reason is written down here rather than left to be rediscovered.
//
// ——— Where the contents come from ———
//
// Square issues the file, per domain, from the Developer Dashboard (Apple Pay →
// Add domain) or the Sites API. Paste it verbatim into
// SQUARE_APPLE_PAY_DOMAIN_ASSOCIATION. It is not a secret — its whole job is to
// be served publicly at a known URL — but it is deployment-specific, which is
// why it is configuration rather than a file in this repository: the sandbox
// domain, the production domain and anybody's local copy each get a different
// one, and a committed file would be wrong on two of the three.
//
// ⚠️ Register whichever domain actually serves the checkout. This app answers on
// both thecornerbagel.com and shop.thecornerbagel.com, and Apple treats those as
// two domains. Verify the one the payment step is on, or verify both.
//
// ——— Served, not 404, and never guessed at ———
//
// A 404 here is a domain Apple will not verify. An *empty* 200 is worse: it
// looks verified to anybody eyeballing it with curl and fails Apple's actual
// comparison, so this answers 404 when the variable is unset rather than
// handing back an empty body that reads as success.

const ASSOCIATION = process.env.SQUARE_APPLE_PAY_DOMAIN_ASSOCIATION ?? "";

export async function GET() {
  const body = ASSOCIATION.trim();
  if (!body) {
    // Said out loud, because this is the failure that produces no symptom on
    // screen. Whoever is wiring up Apple Pay is looking for exactly this line.
    console.warn(
      "[apple-pay] SQUARE_APPLE_PAY_DOMAIN_ASSOCIATION is unset, so this " +
        "domain cannot be verified and Apple Pay will not be offered. The " +
        "file comes from Square's Developer Dashboard under Apple Pay.",
    );
    return new Response("Not found", { status: 404 });
  }

  return new Response(body, {
    status: 200,
    headers: {
      // Apple fetches this as a plain file. text/plain is what Square's own
      // documentation shows and what Apple's verifier expects; serving it as
      // HTML or JSON is a way to fail a check that gives no reason.
      "Content-Type": "text/plain; charset=utf-8",
      // Verification is occasional and the contents change only when the
      // domain is re-registered. An hour is short enough to recover from a
      // paste error without a deploy.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
