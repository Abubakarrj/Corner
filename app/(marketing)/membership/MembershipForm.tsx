"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "../../account";
import { SHOP_EMAIL } from "../../shopFacts";
import { Button, ButtonLink } from "../../ui/Button";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";

const { cream } = PALETTE;

// Must match HONEYPOT_FIELD in app/api/membership/route.ts. Off-screen rather
// than display:none, since some bots skip fields a naive check would catch.
const HONEYPOT_FIELD = "company";

// Four screens, one form. They share a layout, a validator and a submit, and
// differ in which fields show and where the links go — which is the whole
// reason they're one component rather than four routes with four drifting
// copies of the same field markup.
//
//   signin   email + password
//   join     name + email + password
//   recover  email only → "check your inbox"
//   reset    the screen a reset link lands on: new password, twice
//
// `reset` is not reachable from inside the app, on purpose: the only honest
// way in is a link in an email, and no email is sent yet. It's built and
// routable (/membership?step=reset) so the flow is complete the day there's a
// backend to send from.
type Step = "signin" | "join" | "recover" | "reset";

const COPY: Record<Step, { title: string; blurb?: string; submit: string }> = {
  signin: {
    title: "Login",
    blurb: "Sign into your Corner Bagel account.",
    submit: "Login",
  },
  join: {
    title: "Join",
    blurb: "Save your usual, reorder in a tap, and hear about drops first.",
    submit: "Create account",
  },
  recover: {
    title: "Recover password",
    blurb: "Enter the email on your account and we'll send a reset link.",
    submit: "Send reset link",
  },
  reset: {
    title: "New password",
    blurb: "Choose something you don't use anywhere else.",
    submit: "Save password",
  },
};

export default function MembershipForm({ initialStep = "signin" }: { initialStep?: Step }) {
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const wantsName = step === "join";
  const wantsEmail = step !== "reset";
  const wantsPassword = step === "signin" || step === "join" || step === "reset";

  // Long enough to be worth having, short enough not to lecture. Only enforced
  // where a password is being *created* — rejecting an existing short one at
  // the login screen tells an attacker something and helps nobody.
  const passwordLongEnough = password.length >= 8;
  const creating = step === "join" || step === "reset";

  const ready =
    (!wantsEmail || emailValid) &&
    (!wantsName || name.trim().length > 0) &&
    (!wantsPassword || (creating ? passwordLongEnough : password.length > 0)) &&
    (step !== "reset" || confirm === password);

  function go(next: Step) {
    setStep(next);
    setStatus("idle");
    setError(null);
    setPassword("");
    setConfirm("");
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
        // NO PASSWORD IN THIS BODY, on any step. There is no auth backend, and
        // a credential in a request log is a credential leaked — most people
        // reuse them. The fields exist because the screens need them; the
        // values stay on the device. When real auth lands, this line and the
        // endpoint change together.
        body: JSON.stringify({
          intent: step === "reset" ? "recover" : step,
          name: wantsName ? name : undefined,
          email,
          [HONEYPOT_FIELD]: form.get(HONEYPOT_FIELD) ?? "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong.");
      }
      // Signing in or joining records the name and email on this device so the
      // shop can show usuals and history. NOT a login — see the warning at the
      // top of app/account.ts. Recovering doesn't, because nothing was proved.
      if (step === "signin" || step === "join") {
        signIn({ name: wantsName ? name : "", email });
      }
      setStatus("done");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    }
  }

  const copy = COPY[step];

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden"
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
    >
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="px-5 pt-4">
          <BackButton onBack={step === "signin" ? undefined : () => go("signin")} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-2">
        {/* Keyed on the step so each screen animates in as its own thing
            rather than the fields silently swapping under a static heading. */}
        <div key={step} className="cb-rise mx-auto max-w-[380px]">
          <h1 className="m-0 text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-ink">
            {copy.title}
          </h1>
          {copy.blurb ? (
            <p className="m-0 mt-2 text-[14px] leading-[1.5] text-muted">{copy.blurb}</p>
          ) : null}

          {status === "done" ? (
            <Done step={step} email={email} onBack={() => go("signin")} />
          ) : (
            <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col">
              {/* A field no real visitor can see or reach. */}
              <input
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
              />

              <div className="flex flex-col gap-4">
                {wantsName ? (
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

                {wantsEmail ? (
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
                ) : null}

                {wantsPassword ? (
                  <Field
                    label={step === "reset" ? "New password" : "Password"}
                    type="password"
                    autoComplete={creating ? "new-password" : "current-password"}
                    value={password}
                    hint={
                      creating && password.length > 0 && !passwordLongEnough
                        ? "At least 8 characters."
                        : undefined
                    }
                    onChange={(next) => {
                      setPassword(next);
                      setError(null);
                    }}
                  />
                ) : null}

                {step === "reset" ? (
                  <Field
                    label="Confirm password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    hint={
                      confirm.length > 0 && confirm !== password
                        ? "These don't match."
                        : undefined
                    }
                    onChange={(next) => {
                      setConfirm(next);
                      setError(null);
                    }}
                  />
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="m-0 mt-4 text-[13px] text-brand-red">
                  {error}
                </p>
              ) : null}

              <Button type="submit" block disabled={!ready || status === "sending"} className="mt-6">
                {status === "sending" ? "One moment…" : copy.submit}
              </Button>

              {/* One line of links, not a stack: two full-width underlined rows
                  under a button read as three more buttons. */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[13px] text-muted">
                {step === "signin" ? (
                  <>
                    <Quiet onClick={() => go("recover")}>Forgot password?</Quiet>
                    <span aria-hidden>·</span>
                    <Quiet onClick={() => go("join")}>Create an account</Quiet>
                  </>
                ) : null}
                {step === "join" ? (
                  <Quiet onClick={() => go("signin")}>Already have an account?</Quiet>
                ) : null}
                {step === "recover" ? (
                  <Quiet onClick={() => go("signin")}>Back to login</Quiet>
                ) : null}
              </div>
            </form>
          )}
        </div>
      </main>

      <TabBar active="reorder" />
    </div>
  );
}

function BackButton({ onBack }: { onBack?: () => void }) {
  const icon = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.5 4L6.5 10l6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const className =
    "cb-press flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-soft bg-surface text-ink hover:bg-raise";

  // Inside the flow, back means the previous screen; at the start of it, back
  // means out. A bare href from Recover would drop someone on the map.
  return onBack ? (
    <button type="button" onClick={onBack} aria-label="Back" className={className}>
      {icon}
    </button>
  ) : (
    <Link href="/locations" aria-label="Back" className={className}>
      {icon}
    </Link>
  );
}

function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cb-press cursor-pointer underline underline-offset-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

// What each step says once it's submitted. All of them are honest about the
// same underlying fact — there is no auth backend — but each says it in the
// terms of what was just attempted, rather than one generic message.
function Done({
  step,
  email,
  onBack,
}: {
  step: Step;
  email: string;
  onBack: () => void;
}) {
  const address = email.trim();

  if (step === "recover" || step === "reset") {
    return (
      <div className="cb-rise mt-7 rounded-2xl border border-line bg-surface p-5">
        <p className="m-0 text-[15px] font-medium text-ink">
          {step === "recover" ? "Check your inbox" : "Password saved"}
        </p>
        <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted">
          {step === "recover" ? (
            <>
              If {address} has an account, a reset link is on its way.{" "}
              <span className="font-medium text-ink">Accounts aren&rsquo;t live yet</span>
              , so nothing is actually sent — we&rsquo;ve noted the address and
              we&rsquo;ll write when they are. Email {SHOP_EMAIL} if you need
              something sooner.
            </>
          ) : (
            <>
              Saved on this device. Passwords don&rsquo;t leave it yet, so this
              won&rsquo;t carry to another phone until accounts are live.
            </>
          )}
        </p>
        <Button variant="quiet" size="sm" onClick={onBack} className="mt-4 -ml-4">
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <div className="cb-rise mt-7 rounded-2xl border border-line bg-surface p-5">
      <p className="m-0 text-[15px] font-medium text-ink">You&rsquo;re in.</p>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-muted">
        Your usuals and your order history live in your account on this device.
        Full membership — carrying it between devices, and everything that needs
        a real sign-in — opens up soon, and we&rsquo;ll write to {address} when
        it does.
      </p>
      <ButtonLink href="/shop/account" size="sm" className="mt-4">
        Go to your account
      </ButtonLink>
    </div>
  );
}

// An outlined field with its label sitting on the top border. The label is a
// real <label> rather than a placeholder, so it stays legible once there's a
// value and assistive tech gets it either way.
function Field({
  label,
  value,
  onChange,
  hint,
  ...input
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  // Shown under the field, for the one thing it needs to say right now. Not
  // for a standing rule — a hint that's always there is a label.
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <div className="relative">
        <label
          htmlFor={id}
          className="absolute -top-[8px] left-3.5 bg-cream px-1.5 text-[12px] leading-none text-muted"
        >
          {label}
        </label>
        <input
          {...input}
          id={id}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-line-soft bg-transparent px-3.5 py-3 text-[16px] leading-[20px] text-ink outline-none transition-colors focus:border-ink"
        />
      </div>
      {hint ? <p className="m-0 mt-1.5 pl-1 text-[12px] text-brand-red">{hint}</p> : null}
    </div>
  );
}
