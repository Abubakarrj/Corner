import { createSign } from "node:crypto";
import { after } from "next/server";

// Catering inquiry endpoint behind the /catering page.
//
// Each inquiry that passes validation gets appended as a row to a Google
// Sheet via a service account — no database, since a spreadsheet someone can
// actually open and skim is the more useful "backend" for a handful of
// catering leads a week. Falls back to a console log when the service
// account env vars aren't set (e.g. local dev without credentials).

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

function logInquiry(inquiry: Inquiry) {
  console.info(
    `[catering] inquiry from ${inquiry.name} <${inquiry.email}>, phone=${inquiry.phone || "—"}, ` +
      `date=${inquiry.eventDate}, guests=${inquiry.guestCount}\n${inquiry.details || "(no details given)"}`,
  );
}

// A Google Cloud service account, shared as an editor on the destination
// sheet — not OAuth, since there's no human to click through a consent
// screen here, just a server appending rows on its own. The private key
// comes out of the downloaded JSON key file; in an env var its embedded
// newlines have to be written as literal `\n`, hence the unescape below.
const GOOGLE_SHEETS_CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const GOOGLE_SHEETS_PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const GOOGLE_SHEETS_SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
// Sheet tab + columns to append into. Change the tab name here if the sheet
// isn't called "Catering", or widen the range if columns are added.
const GOOGLE_SHEETS_RANGE = process.env.GOOGLE_SHEETS_RANGE ?? "Catering!A:G";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Exchanges the service account's key for a short-lived access token via a
// self-signed JWT — the standard "server-to-server" OAuth2 flow, no
// `googleapis` package needed for one endpoint.
async function getGoogleAccessToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: GOOGLE_SHEETS_CLIENT_EMAIL,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signature = base64url(
    createSign("RSA-SHA256").update(`${header}.${claims}`).sign(GOOGLE_SHEETS_PRIVATE_KEY as string),
  );
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(
      `Google token exchange failed (${response.status}): ${failure?.error_description ?? failure?.error ?? "unknown error"}`,
    );
  }

  const { access_token: accessToken } = (await response.json()) as { access_token: string };
  return accessToken;
}

async function appendInquiryRow(inquiry: Inquiry): Promise<void> {
  const accessToken = await getGoogleAccessToken();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEETS_SPREADSHEET_ID}/values/${encodeURIComponent(GOOGLE_SHEETS_RANGE)}:append?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      values: [
        [
          new Date().toISOString(),
          inquiry.name,
          inquiry.email,
          inquiry.phone,
          inquiry.eventDate,
          inquiry.guestCount,
          inquiry.details,
        ],
      ],
    }),
  });

  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(
      `Sheets append failed (${response.status}): ${failure?.error?.message ?? "unknown error"}`,
    );
  }
}

// The handoff point. Runs after the response has already gone out — a
// Sheets hiccup shouldn't make the form itself look broken to whoever's
// filling it in. Falls back to a console log when no service account is
// configured.
function onInquiry(inquiry: Inquiry) {
  logInquiry(inquiry);

  if (!GOOGLE_SHEETS_CLIENT_EMAIL || !GOOGLE_SHEETS_PRIVATE_KEY || !GOOGLE_SHEETS_SPREADSHEET_ID) {
    return;
  }

  after(async () => {
    try {
      await appendInquiryRow(inquiry);
    } catch (error) {
      console.error(`[catering] Sheets append failed for ${inquiry.email}:`, error);
    }
  });
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
