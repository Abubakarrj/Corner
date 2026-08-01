// Placeholder chat-intake endpoint behind the shop's chat widget
// (app/shop/ChatWidget.tsx).
//
// A message that passes validation is logged here, not delivered to any
// real agent — there's no chat provider wired up yet. Once one is chosen
// (Intercom, Gorgias, Zendesk, ...), either this route forwards to their
// API, or the whole widget gets replaced by their embed — whichever fits
// how that provider actually works.

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

  const body = payload as {
    name?: unknown;
    email?: unknown;
    message?: unknown;
    topic?: unknown;
  } | null;
  const { name, email, message, topic } = body ?? {};

  if (!isNonEmptyString(name) || !isValidEmail(email) || !isNonEmptyString(message)) {
    return Response.json(
      { error: "Fill in your name, email, and message." },
      { status: 400 },
    );
  }

  // The topic is one of the widget's quick-reply buttons ("Track my order",
  // ...), so it's routing metadata, not something a visitor typed — optional,
  // and free-form here so the button labels can change without this route
  // needing to know them.
  const topicTag = isNonEmptyString(topic) ? ` [${topic.trim()}]` : "";

  console.info(
    `[shop-chat]${topicTag} message from ${name.trim()} <${email.trim()}>:\n${message.trim()}`,
  );

  return Response.json({ ok: true }, { status: 200 });
}
