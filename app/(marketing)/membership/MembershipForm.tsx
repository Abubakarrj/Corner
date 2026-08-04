"use client";

import Link from "next/link";
import { useState } from "react";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";

// The same produce palette as the finder and the pantry, so all three read
// as one product rather than three visits to different sites.
const { cream, surface, olive, onOlive, border, controlBorder } = PALETTE;

// Must match HONEYPOT_FIELD in app/api/membership/route.ts. Off-screen rather
// than display:none, since some bots skip fields a naive check would catch.
const HONEYPOT_FIELD = "company";

type Tab = "join" | "signin";

// Membership, reached from the Reorder tab — signing in is what makes
// reordering possible, so that's the door it opens.
//
// There are no passwords here, and that is deliberate rather than
// unfinished: Corner Bagel has no auth backend yet, and a password field
// wired to a placeholder endpoint would collect real credentials people reuse
// elsewhere and put them somewhere that cannot keep them. Signing in requests
// a link by email instead, which is both safe to stub today and a pattern
// worth keeping once there is a real backend.
//
// IMPORTANT: /api/membership only logs. Nobody is enrolled and no link is
// sent until it's pointed at a real provider — Loops is already wired for the
// drop-list (see app/api/drop-list/route.ts) and is the obvious place to
// start.
export default function MembershipForm() {
  const [tab, setTab] = useState<Tab>("join");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = tab === "join" ? name.trim().length > 0 && emailValid : emailValid;

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
        body: JSON.stringify({
          intent: tab,
          name: tab === "join" ? name : undefined,
          email,
          [HONEYPOT_FIELD]: form.get(HONEYPOT_FIELD) ?? "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      setStatus("done");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    }
  }

  const fieldClass =
    "w-full bg-transparent pb-[11px] text-[16px] leading-[19px] text-[#3E4A30] outline-none placeholder:text-[#8A8672]";

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden"
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
    >
      {/* Same header rhythm as the location finder — 21px above a 34px pill
          row — so the two screens read as one app. */}
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-4 pt-[21px]">
          <Link
            href="/locations"
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

          <div className="flex flex-1 items-center justify-center gap-2">
            {([
              { id: "join", label: "Join" },
              { id: "signin", label: "Sign in" },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                aria-pressed={tab === id}
                style={{
                  backgroundColor: tab === id ? olive : "transparent",
                  color: tab === id ? onOlive : olive,
                  borderColor: tab === id ? olive : controlBorder,
                }}
                className="flex h-[34px] cursor-pointer items-center rounded-full border px-5 text-[15px] leading-none transition-colors duration-150"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Balances the back button so the pills sit centred. */}
          <span className="h-9 w-9 shrink-0" aria-hidden />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-8">
        <div className="mx-auto max-w-sm">
          <h1 className="m-0 text-[26px] font-bold leading-tight text-[#3E4A30]">
            {tab === "join" ? "Corner Bagel membership" : "Welcome back"}
          </h1>
          <p className="m-0 mt-2 text-[14px] leading-[1.5] text-[#6F6A5C]">
            {tab === "join"
              ? "Save your usual, reorder in a tap, and hear about drops before anyone else."
              : "Enter the email on your membership and we'll send you a sign-in link."}
          </p>

          {status === "done" ? (
            <div className="mt-8 rounded-2xl border p-5" style={{ borderColor: border, backgroundColor: surface }}>
              <p className="m-0 text-[15px] font-bold text-[#3E4A30]">
                {tab === "join" ? "You're on the list." : "Check your email."}
              </p>
              <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-[#6F6A5C]">
                {tab === "join"
                  ? "We'll be in touch at " + email.trim() + " as membership opens up."
                  : "If that address has a membership, a sign-in link is on its way."}
              </p>
              <button
                type="button"
                onClick={() => switchTab(tab)}
                className="mt-4 cursor-pointer text-[13px] text-[#6F6A5C] underline transition-opacity hover:opacity-70"
              >
                Back
              </button>
            </div>
          ) : (
            // key on the tab so switching clears the fields rather than
            // carrying a half-typed join into a sign-in.
            <form key={tab} onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-6">
              {/* A field no real visitor can see or reach. */}
              <input
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              />

              {tab === "join" ? (
                <input
                  type="text"
                  autoComplete="name"
                  aria-label="Name"
                  placeholder="Name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  className={fieldClass}
                  style={{ borderBottom: `1px solid ${controlBorder}` }}
                />
              ) : null}

              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-label="Email address"
                placeholder="Email address"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                className={fieldClass}
                style={{ borderBottom: `1px solid ${controlBorder}` }}
              />

              {error ? (
                <p role="alert" className="m-0 text-[13px]" style={{ color: "#BE1923" }}>
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!ready || status === "sending"}
                style={{ backgroundColor: olive, color: onOlive }}
                className="mt-2 cursor-pointer rounded-full py-3.5 text-[15px] font-bold transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30 disabled:hover:opacity-30"
              >
                {status === "sending"
                  ? "Sending…"
                  : tab === "join"
                    ? "Join"
                    : "Email me a sign-in link"}
              </button>

              <p className="m-0 text-center text-[13px] text-[#6F6A5C]">
                {tab === "join" ? "Already a member? " : "New here? "}
                <button
                  type="button"
                  onClick={() => switchTab(tab === "join" ? "signin" : "join")}
                  className="cursor-pointer underline transition-opacity hover:opacity-70"
                >
                  {tab === "join" ? "Sign in" : "Join"}
                </button>
              </p>
            </form>
          )}
        </div>
      </main>

      <TabBar active="reorder" />
    </div>
  );
}
