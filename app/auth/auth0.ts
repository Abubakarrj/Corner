import "server-only";

import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

import { testLogin } from "./testLogin";

// Auth0, passwordless by email code.
//
// There is no password anywhere in this system. Somebody types an email, Auth0
// mails them a six-digit code, they type the code back. That means there is no
// password to leak, none to reset, none sitting in a request log, and none for
// this app to be trusted with — which is why the whole "recover password" and
// "new password" flow that used to live in MembershipForm is gone rather than
// wired up.
//
// Both calls to Auth0 happen here, on the server, because they carry the
// client secret. The browser talks to our own /api/auth routes and never sees
// a credential of Auth0's.
//
// The flow, from Auth0's Authentication API:
//
//   POST {issuer}/passwordless/start
//     { client_id, client_secret, connection: "email", email, send: "code" }
//     -> Auth0 sends the mail. Returns 200 with the email echoed back.
//
//   POST {issuer}/oauth/token
//     { grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
//       client_id, client_secret, username: <email>, otp: <code>,
//       realm: "email", scope: "openid profile email" }
//     -> { id_token, access_token, ... }
//
// The tenant needs the Passwordless OTP grant enabled on the application, and
// an Email passwordless connection turned on. Both are switches in the
// dashboard; see the env var names below for what has to come out of it.

export type Auth0Config = {
  // e.g. https://corner-bagel.us.auth0.com — no trailing slash.
  issuer: string;
  clientId: string;
  clientSecret: string;
  // Signs our own session cookie. Not Auth0's; ours. 32+ random bytes.
  sessionSecret: string;
};

export function auth0Config(): Auth0Config | null {
  const issuer = process.env.AUTH0_ISSUER_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  const sessionSecret = process.env.AUTH0_SESSION_SECRET;
  if (!issuer || !clientId || !clientSecret || !sessionSecret) return null;
  return { issuer, clientId, clientSecret, sessionSecret };
}

export function isAuthConfigured(): boolean {
  return auth0Config() !== null;
}

// ——— The cookie's secret, on its own ———
//
// Session signing has nothing to do with Auth0's client credentials, and tying
// it to them meant a deploy with no tenant could not hold a session at all —
// mintSession and readSession both went through auth0Config(), so all four
// variables had to be present for a cookie to be signed with one of them.
//
// That mattered the moment there was a second way to sign in. The test login
// in ./testLogin.ts never talks to Auth0, so on a tenant-less deploy it could
// authenticate somebody and then have nowhere to put the result.
export function sessionSecret(): string | null {
  return process.env.AUTH0_SESSION_SECRET || null;
}

/** Whether anybody can sign in by any route. Auth0 is one; the debug bypass in
 *  ./testLogin.ts is the other, and to a screen deciding whether to offer a
 *  sign-in button they are the same question. */
export function canSignIn(): boolean {
  return isAuthConfigured() || testLogin() !== null;
}

// Auth0's public keys, fetched once and cached by the library. Recreated only
// when the issuer changes, which in practice is never.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer = "";

function keys(issuer: string) {
  if (!jwks || jwksIssuer !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksIssuer = issuer;
  }
  return jwks;
}

export type StartResult = { ok: true } | { ok: false; error: string };

// Asks Auth0 to mail a code.
//
// The answer is deliberately the same whether or not that email has an account:
// telling a stranger "no account with that address" turns this endpoint into a
// way to find out who has one.
export async function startEmailCode(email: string): Promise<StartResult> {
  const config = auth0Config();
  if (!config) return { ok: false, error: "not-configured" };

  const response = await fetch(`${config.issuer}/passwordless/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      connection: "email",
      email,
      send: "code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `auth0-start-${response.status}: ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}

export type Verified = {
  sub: string;
  email: string;
  name: string;
};

export type VerifyResult =
  | { ok: true; user: Verified }
  | { ok: false; error: string; wrongCode?: boolean };

// Trades the code for tokens, then checks the ID token rather than trusting it.
//
// Verifying is not optional even though the token came straight from Auth0 over
// TLS: the signature check is what makes the claims inside it mean anything,
// and skipping it is the single most common way an OIDC integration ends up
// accepting a forged identity.
export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<VerifyResult> {
  const config = auth0Config();
  if (!config) return { ok: false, error: "not-configured" };

  const response = await fetch(`${config.issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: email,
      otp: code,
      realm: "email",
      scope: "openid profile email",
    }),
  });

  if (!response.ok) {
    // Auth0 answers a bad or expired code with 403 invalid_grant. That one is
    // the visitor's problem to fix and gets said plainly; everything else is
    // ours and gets a generic message plus a log.
    const body = (await response.json().catch(() => null)) as
      | { error?: string; error_description?: string }
      | null;
    const wrongCode = response.status === 403 || body?.error === "invalid_grant";
    return {
      ok: false,
      wrongCode,
      error: wrongCode
        ? "that-code-didnt-work"
        : `auth0-token-${response.status}: ${body?.error_description ?? ""}`.slice(0, 200),
    };
  }

  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) return { ok: false, error: "no-id-token" };

  try {
    const { payload } = await jwtVerify(tokens.id_token, keys(config.issuer), {
      issuer: `${config.issuer}/`,
      audience: config.clientId,
    });
    const claimedEmail = typeof payload.email === "string" ? payload.email : "";
    if (!payload.sub || !claimedEmail) return { ok: false, error: "incomplete-id-token" };
    return {
      ok: true,
      user: {
        sub: payload.sub,
        email: claimedEmail,
        // Passwordless email accounts have no profile name unless one has been
        // set; the local part of the address is a better greeting than "".
        name:
          typeof payload.name === "string" && !payload.name.includes("@")
            ? payload.name
            : claimedEmail.split("@")[0],
      },
    };
  } catch (verifyError) {
    return {
      ok: false,
      error: `id-token-invalid: ${verifyError instanceof Error ? verifyError.message : ""}`,
    };
  }
}

// ——— Our own session ———
//
// Auth0's tokens aren't kept. What's kept is a small signed JWT of our own in
// an httpOnly cookie: the subject, the email, the name. That's everything the
// app needs, it can't be read by script, and there's no access token sitting in
// a browser waiting to be stolen.

export const SESSION_COOKIE = "cb_session";
const SESSION_DAYS = 30;

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function mintSession(user: Verified): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("mintSession without AUTH0_SESSION_SECRET");
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey(secret));
}

export async function readSession(token: string | undefined): Promise<Verified | null> {
  const secret = sessionSecret();
  if (!secret || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : payload.email.split("@")[0],
    };
  } catch {
    // Expired or tampered with. Either way there is no session.
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
