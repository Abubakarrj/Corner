"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "../../account";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";

// The same produce palette as the finder and the pantry, so all three read
// as one product rather than three visits to different sites.
const { cream, surface, olive, onOlive, border, controlBorder, muted } = PALETTE;

// Must match HONEYPOT_FIELD in app/api/membership/route.ts. Off-screen rather
// than display:none, since some bots skip fields a naive check would catch.
const HONEYPOT_FIELD = "company";

// Three screens, one form. Recovering a password is the same layout with one
// field, so it's a mode rather than a route.
type Tab = "join" | "signin" | "recover";

// Membership, reached from the Reorder tab — signing in is what makes
// reordering possible, so that's the door it opens.
//
// Laid out to the supplied login reference: heading, one line of subtitle,
// outlined rounded-rect fields with their labels floated onto the border,
// two underlined links, and a full-width pill button. Two departures from
// that reference, both deliberate:
//
//  1. The button is Corner Bagel olive, not the reference's terracotta. The
//     structure is what's being copied; another brand's accent colour landing
//     in the middle of this palette would be the one thing on the screen that
//     doesn't belong to us.
//
//  2. THE PASSWORD NEVER LEAVES THE DEVICE. The field is here because the
//     reference has it, and it's required before the button enables, but the
//     value is not put in the request — /api/membership doesn't accept one
//     (see the note at the top of that file) and there is no auth backend to
//     hand it to. Sending it would put a credential people reuse elsewhere
//     into a request log for no benefit at all. When real auth arrives, this
//     is the line to change, together with that route.
//
// IMPORTANT, and following from the above: nothing here authenticates anyone.
// /api/membership only logs. "Login" produces the same we'll-be-in-touch stub
// the previous version of this screen did — the screen is finished, the
// system behind it is not.
export default function MembershipForm() {
  // The reference is a login screen and Reorder means "sign in to reorder",
  // so signing in is the state this opens in; joining is one tap away.
  const [tab, setTab] = useState<Tab>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const joining = tab === "join";
  const recovering = tab === "recover";
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready =
    emailValid &&
    (recovering || password.length > 0) &&
    (!joining || name.trim().length > 0);

  function switchTab(next: Tab) {
    setTab(next);
    setStatus("idle");
    setError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || status !== "idle") return;
    setStatus("sending");
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No password in this body, on purpose — see the note above.
        body: JSON.stringify({
          intent: tab,
          name: joining ? name : undefined,
          email,
          [HONEYPOT_FIELD]: form.get(HONEYPOT_FIELD) ?? "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      // Records the name and email on this device so the shop can show a
      // usuals list and an order history. NOT a login — see the warning at
      // the top of app/account.ts. It gates nothing.
      //
      // Signing in has no name field and none is invented: deriving one from
      // the local part of the address greets people as "ada", which is worse
      // than not greeting them by name at all. The account page falls back to
      // the address.
      if (!recovering) signIn({ name: joining ? name : "", email });
      setStatus("done");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    }
  }

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden"
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
    >
      {/* Same 21px top rhythm as the location finder, so the two screens read
          as one app. The pill toggle that used to sit here is gone — the
          reference switches modes with the link under the fields, and two
          controls for one choice is one too many. */}
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="px-4 pt-[21px]">
          {/* From Recover, back means the login screen — not out of the flow
              entirely, which is what a bare href would do. */}
          <Link
            href={recovering ? "/membership" : "/locations"}
            onClick={
              recovering
                ? (event) => {
                    event.preventDefault();
                    switchTab("signin");
                  }
                : undefined
            }
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[#EFEBDD]"
            style={{ borderColor: controlBorder }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M12.5 4L6.5 10l6 6"
                stroke={olive}
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6">
        <div className="mx-auto max-w-sm">
          <h1
            className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-0.02em]"
            style={{ color: olive }}
          >
            {joining ? "Join" : recovering ? "Recover password" : "Login"}
          </h1>
          {recovering ? null : (
            <p className="m-0 mt-2 text-[14px] leading-[1.5]" style={{ color: muted }}>
              {joining
                ? "Create your Corner Bagel account."
                : "Sign into your Corner Bagel account."}
            </p>
          )}

          {status === "done" ? (
            <div
              className="mt-8 rounded-2xl border p-5"
              style={{ borderColor: border, backgroundColor: surface }}
            >
              <p className="m-0 text-[15px] font-medium" style={{ color: olive }}>
                {recovering ? "Nothing to reset yet." : "You\u2019re in."}
              </p>
              <p className="m-0 mt-1.5 text-[13px] leading-[1.5]" style={{ color: muted }}>
                {recovering ? (
                  <>
                    Accounts aren&rsquo;t live yet, so there&rsquo;s no password
                    stored to reset. We&rsquo;ve noted {email.trim()} and
                    we&rsquo;ll write when they are.
                  </>
                ) : (
                  <>
                    Your usuals and your order history live in your account on
                    this device. Full membership — carrying it between devices,
                    and everything that needs a real sign-in — opens up soon,
                    and we&rsquo;ll write to {email.trim()} when it does.
                  </>
                )}
              </p>
              {recovering ? (
                <button
                  type="button"
                  onClick={() => switchTab("signin")}
                  className="mt-4 cursor-pointer text-[13px] underline transition-opacity hover:opacity-70"
                  style={{ color: muted }}
                >
                  Back to login
                </button>
              ) : (
                <Link
                  href="/shop/account"
                  style={{ backgroundColor: olive, color: onOlive }}
                  className="mt-4 inline-block cursor-pointer rounded-full px-5 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90"
                >
                  Go to your account
                </Link>
              )}
            </div>
          ) : (
            // key on the tab so switching clears the fields rather than
            // carrying a half-typed join into a sign-in.
            <form key={tab} onSubmit={onSubmit} noValidate className="mt-9 flex flex-col">
              {/* A field no real visitor can see or reach. */}
              <input
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              />

              {joining ? (
                <Field
                  label="Name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(next) => {
                    setName(next);
                    setError(null);
                  }}
                />
              ) : null}

              <Field
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(next) => {
                  setEmail(next);
                  setError(null);
                }}
              />

              {recovering ? null : (
                <Field
                  label="Password"
                  type="password"
                  autoComplete={joining ? "new-password" : "current-password"}
                  value={password}
                  onChange={(next) => {
                    setPassword(next);
                    setError(null);
                  }}
                />
              )}

              <div className="mt-5 flex flex-col items-start gap-2.5">
                {joining || recovering ? null : (
                  <button
                    type="button"
                    onClick={() => switchTab("recover")}
                    className="cursor-pointer text-[14px] underline underline-offset-2 transition-opacity hover:opacity-70"
                    style={{ color: olive }}
                  >
                    Forgot your password?
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => switchTab(joining ? "signin" : "join")}
                  className="cursor-pointer text-[14px] underline underline-offset-2 transition-opacity hover:opacity-70"
                  style={{ color: olive }}
                >
                  {joining ? "Already have an account?" : "Don't have an account yet?"}
                </button>
              </div>

              {error ? (
                <p role="alert" className="m-0 mt-5 text-[13px]" style={{ color: "#BE1923" }}>
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!ready || status === "sending"}
                style={{ backgroundColor: olive, color: onOlive }}
                className="mt-8 cursor-pointer rounded-full py-4 text-[16px] font-medium transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30 disabled:hover:opacity-30"
              >
                {status === "sending"
                  ? "Sending…"
                  : joining
                    ? "Join"
                    : recovering
                      ? "Recover password"
                      : "Login"}
              </button>
            </form>
          )}
        </div>
      </main>

      <TabBar active="reorder" />
    </div>
  );
}

// An outlined field with its label sitting on the top border, as in the
// reference. The label is a real <label> rather than a placeholder, so it
// stays legible once there's a value in the box and assistive tech gets it
// either way. The asterisk is decoration on top of `required`, so it's
// hidden from the accessible name.
function Field({
  label,
  value,
  onChange,
  ...input
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="relative mt-7 first:mt-0">
      <label
        htmlFor={id}
        className="absolute -top-[8px] left-4 px-1.5 text-[13px] leading-none"
        style={{ backgroundColor: cream, color: muted }}
      >
        {label} <span aria-hidden>*</span>
      </label>
      <input
        {...input}
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border bg-transparent px-4 py-3.5 text-[16px] leading-[20px] outline-none transition-colors focus:border-[#3E4A30]"
        style={{ borderColor: controlBorder, color: olive }}
      />
    </div>
  );
}
