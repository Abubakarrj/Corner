// One narrow channel for a browser to say what went wrong.
//
// ——— Why this exists at all ———
//
// Square's card fields mount inside the browser, and when that fails the reason
// exists only in a console. On a phone there is no console — which is how a
// checkout with no card field on it stayed undiagnosed across several days and
// several deploys while the server logs, which are read, said nothing at all
// because from the server's side nothing had happened.
//
// So the browser gets to file exactly one kind of report, and it lands in the
// deployment log next to everything else.
//
// ——— And why it is this narrow ———
//
// ⚠️ This is an unauthenticated endpoint that writes to a log. Left open it is
// a way for anybody to fill the log with whatever they like, which costs money
// and buries the lines that matter — the exact problem this was built to fix.
//
// So: one allowed value for `where`, a hard cap on the message, a cap on how
// many are accepted per window, and nothing echoed back. It cannot be used to
// store anything, read anything, or learn anything.
//
// It carries no personal data by construction. The only caller passes an
// exception message from Square's SDK, and the cap below truncates anything
// that grew unexpectedly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The only thing worth hearing about, so far. A closed set rather than free
 *  text: a label somebody chose is a label somebody can flood. */
const ALLOWED = new Set(["square-card-mount"]);

const MAX_MESSAGE = 300;
// Per process, so a deploy clears it. Generous enough that a genuinely broken
// deploy reports from several browsers, small enough that it cannot become a
// bill.
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 10 * 60 * 1000;

let windowStartedAt = 0;
let seen = 0;

function accepting(now: number): boolean {
  if (now - windowStartedAt > WINDOW_MS) {
    windowStartedAt = now;
    seen = 0;
  }
  seen += 1;
  if (seen === MAX_PER_WINDOW + 1) {
    console.warn("[client-error] rate limit reached; further reports are dropped this window.");
  }
  return seen <= MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  // 204 whatever happens. There is nothing a caller should learn from this, and
  // a browser has no use for the answer — it already knows it failed.
  const nothing = new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return nothing;
  }

  const where = (body as { where?: unknown })?.where;
  const message = (body as { message?: unknown })?.message;
  if (typeof where !== "string" || !ALLOWED.has(where)) return nothing;
  if (!accepting(Date.now())) return nothing;

  const said =
    typeof message === "string" && message.trim()
      ? message.trim().slice(0, MAX_MESSAGE)
      : "no message";

  console.error(`[client-error] ${where}: ${said}`);
  return nothing;
}
