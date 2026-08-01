// Chat-relay endpoint behind the shop's chat widget (app/shop/ChatWidget.tsx).
//
// The widget is a direct conversation — the visitor types, and the team
// answers in the same window. Each message the visitor sends posts here on
// its own, rather than the whole thread being batched at the end, so the
// team sees it as it's typed.
//
// Right now a message is logged here, not delivered to anyone: there's no
// chat provider wired up yet. Once one is chosen (Intercom, Gorgias,
// Zendesk, ...), either this route forwards to their API, or the whole
// widget gets replaced by their embed — whichever fits how that provider
// actually works. Until then nothing on the team's side is listening.

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const body = payload as {
    message?: unknown;
    topic?: unknown;
    conversationId?: unknown;
  } | null;
  const { message, topic, conversationId } = body ?? {};

  // The message is the only thing required. The widget no longer collects a
  // name or an email — the reply comes back in the open chat window, so
  // there's nowhere for contact details to be used.
  if (!isNonEmptyString(message)) {
    return Response.json({ error: "Type a message first." }, { status: 400 });
  }

  // The topic is one of the widget's quick-reply buttons ("Track my order",
  // ...), so it's routing metadata, not something a visitor typed — optional,
  // and free-form here so the button labels can change without this route
  // needing to know them.
  const topicTag = isNonEmptyString(topic) ? ` [${topic.trim()}]` : "";
  // Groups the messages of one visitor's session into a single thread once
  // there's a real provider on the other end of this.
  const threadTag = isNonEmptyString(conversationId)
    ? ` (${conversationId.trim().slice(0, 64)})`
    : "";

  console.info(`[shop-chat]${topicTag}${threadTag} ${message.trim()}`);

  return Response.json({ ok: true }, { status: 200 });
}
