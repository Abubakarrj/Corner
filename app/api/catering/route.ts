// Catering inquiry endpoint behind the /catering page.
//
// No notification is wired up yet — an inquiry that passes validation is
// logged here, but nobody at Corner Bagel is actually told about it. Once a
// notification path is picked (email to Abu via Loops' transactional API,
// same pattern as app/api/drop-list/route.ts, or something else), that call
// belongs in onInquiry below.

function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

// Matches HONEYPOT_FIELD in app/catering/page.tsx.
const HONEYPOT_FIELD = "company";
const MIN_FILL_TIME_MS = 600;

type Inquiry = {
  name: string;
  email: string;
  phone: string;
  eventDate: string;
  guestCount: string;
  details: string;
};

function onInquiry(inquiry: Inquiry) {
  console.info(
    `[catering] inquiry from ${inquiry.name} <${inquiry.email}>, phone=${inquiry.phone || "—"}, ` +
      `date=${inquiry.eventDate}, guests=${inquiry.guestCount}\n${inquiry.details || "(no details given)"}`,
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as
    | {
        name?: unknown;
        email?: unknown;
        phone?: unknown;
        eventDate?: unknown;
        guestCount?: unknown;
        details?: unknown;
        [HONEYPOT_FIELD]?: unknown;
        elapsed_ms?: unknown;
      }
    | null;

  const { name, email, eventDate, guestCount } = body ?? {};
  if (
    !isNonEmptyString(name) ||
    !isValidEmail(email) ||
    !isNonEmptyString(eventDate) ||
    !isNonEmptyString(guestCount)
  ) {
    return Response.json(
      { error: "Fill in your name, email, event date, and guest count." },
      { status: 400 },
    );
  }

  // Same silent-success pattern as the drop-list signup: a bot that trips
  // either check gets the same response a real inquiry gets, so nothing
  // reveals which check it failed.
  const honeypotFilled =
    typeof body?.[HONEYPOT_FIELD] === "string" && body[HONEYPOT_FIELD].length > 0;
  const submittedTooFast =
    typeof body?.elapsed_ms === "number" && body.elapsed_ms < MIN_FILL_TIME_MS;
  if (honeypotFilled || submittedTooFast) {
    return Response.json({ ok: true }, { status: 200 });
  }

  onInquiry({
    name: name.trim(),
    email: email.trim(),
    phone: typeof body?.phone === "string" ? body.phone.trim() : "",
    eventDate: eventDate.trim(),
    guestCount: guestCount.trim(),
    details: typeof body?.details === "string" ? body.details.trim() : "",
  });

  return Response.json({ ok: true }, { status: 200 });
}
