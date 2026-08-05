// Membership intake, behind app/(marketing)/membership/MembershipForm.tsx.
//
// A submission that passes validation is logged here, not enrolled and not
// emailed — there is no membership backend and no auth. Loops is already
// wired for the drop-list (app/api/drop-list/route.ts) and is the obvious
// place to point this: "join" becomes a contact create on a membership list,
// and "signin" becomes a magic-link send. Until then nothing on the team's
// side receives any of it.
//
// Note what this route does NOT accept: a password. The form collects one on
// the Login and Join screens but never sends it (see the note in
// MembershipForm), and this shouldn't start taking one before there is
// somewhere that can store credentials safely. "recover" is the same shape —
// an address noted, no reset link sent, because there is no password stored
// to reset.

// Must match HONEYPOT_FIELD in the form.
const HONEYPOT_FIELD = "company";

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as Record<string, unknown> | null;
  const intent = body?.intent;
  const email = body?.email;
  const name = body?.name;

  // A real visitor never sees this field, so anything in it is automated.
  // Answer 200 rather than an error: a bot that's told it failed just tries
  // again differently.
  if (isNonEmptyString(body?.[HONEYPOT_FIELD])) {
    return Response.json({ ok: true }, { status: 200 });
  }

  if (intent !== "join" && intent !== "signin" && intent !== "recover") {
    return Response.json({ error: "Unknown request." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (intent === "join" && !isNonEmptyString(name)) {
    return Response.json({ error: "Enter your name." }, { status: 400 });
  }

  console.info(
    `[membership] ${intent}: ${isNonEmptyString(name) ? `${name.trim()} ` : ""}<${email.trim()}>`,
  );

  return Response.json({ ok: true }, { status: 200 });
}
