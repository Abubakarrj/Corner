"use client";

import { useRouter } from "next/navigation";
import { useServerText, useT, type StringKey } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { signIn } from "../../account";
import { Button } from "../../ui/Button";
import { BackIcon, IconButton } from "../../ui/IconButton";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";

const { cream } = PALETTE;

// Signing in, without a password.
//
// There is no password anywhere in this flow, and that's the design rather
// than a stage of it: you type an email, Auth0 mails a six-digit code, you
// type the code back. Nothing to leak, nothing to reset, nothing for this app
// to be trusted with. The "Recover password" and "New password" screens that
// used to live here are gone, because there is no password to recover — the
// code *is* the recovery.
//
// Both halves of the exchange go through our own /api/auth routes, which hold
// the Auth0 client secret. The browser never talks to Auth0 directly, so this
// screen stays entirely ours: our type, our spacing, our copy, our errors.
//
// Login and Join are the same act. Auth0's email connection creates the user
// on first code, so asking somebody whether they're new is asking a question
// the system doesn't need answered — the two differ only in what the heading
// promises.
type Step = "email" | "code";
type Intent = "signin" | "join";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// String keys, resolved at render — see the note in app/i18n.
const COPY: Record<Intent, { title: StringKey; blurb: StringKey }> = {
  signin: { title: "membership.loginTitle", blurb: "membership.loginBlurb" },
  join: { title: "membership.joinTitle", blurb: "membership.joinBlurb" },
};

export default function MembershipForm({
  initialStep = "signin",
}: {
  initialStep?: Intent;
}) {
  const t = useT();
  // The API answers with string keys, not sentences — see serverText().
  const st = useServerText();
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>(initialStep);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // The code field takes focus when it appears. The keyboard is already up
  // from the email step, and making somebody tap into the next box is a step
  // that achieves nothing.
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const copy = COPY[intent];

  async function sendCode(address: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "api.codeSendFailed");
      setStep("code");
      setCode("");
      return true;
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "checkout.somethingWentWrong",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitEmail(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      setError("checkout.validEmail");
      return;
    }
    if (busy) return;
    await sendCode(address);
  }

  async function onSubmitCode(event: React.FormEvent) {
    event.preventDefault();
    const digits = code.trim();
    if (digits.length < 4) {
      setError("api.enterCode");
      return;
    }
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: digits }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        user?: { email: string; name: string };
      } | null;
      if (!response.ok || !body?.user) {
        throw new Error(body?.error ?? "api.codeCheckFailed");
      }
      // The cookie is already set. This is the local echo, so the next screen
      // knows who you are without waiting on a round trip.
      signIn(body.user);
      router.push("/shop/account");
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : "checkout.somethingWentWrong",
      );
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="cb-app-shell flex w-full flex-col overflow-hidden"
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
    >
      {/* No back button on the first step — you arrive from the Reorder tab,
          so there's nothing behind you. The code step does have somewhere to
          go back to: the address you typed. */}
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        {step === "code" ? (
          <div className="px-5 pt-4">
            <IconButton
              label={t("common.back")}
              onClick={() => {
                setStep("email");
                setError(null);
                setResent(false);
              }}
            >
              <BackIcon />
            </IconButton>
          </div>
        ) : null}
      </header>

      <main
        className={`min-h-0 flex-1 overflow-y-auto px-5 pb-8 ${
          step === "code" ? "pt-2" : "pt-8"
        }`}
      >
        <div key={step} className="cb-rise mx-auto max-w-[380px]">
          {step === "email" ? (
            <>
              <h1 className="m-0 text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-ink">
                {t(copy.title)}
              </h1>
              <p className="m-0 mt-2 text-[14px] leading-[1.5] text-muted">{t(copy.blurb)}</p>

              <form onSubmit={onSubmitEmail} noValidate className="mt-7 flex flex-col">
                <Field
                  label={t("checkout.email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(next) => {
                    setEmail(next);
                    setError(null);
                  }}
                  hint={error ? st(error) : undefined}
                />

                <Button type="submit" block className="mt-6" disabled={busy}>
                  {busy ? t("membership.sending") : t("membership.emailMeCode")}
                </Button>

                <p className="m-0 mt-4 text-center text-[13px] text-muted">
                  {intent === "signin" ? (
                    <>
                      {t("membership.newHere")}{" "}
                      <Quiet onClick={() => setIntent("join")}>{t("membership.createAccount")}</Quiet>
                    </>
                  ) : (
                    <>
                      {t("membership.alreadyHaveOne")} <Quiet onClick={() => setIntent("signin")}>{t("membership.logIn")}</Quiet>
                    </>
                  )}
                </p>
              </form>
            </>
          ) : (
            <>
              <h1 className="m-0 text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-ink">
                {t("membership.checkEmail")}
              </h1>
              <p className="m-0 mt-2 text-[14px] leading-[1.5] text-muted">
                {(() => {
                  // Split around {email} so the address can sit wherever the
                  // sentence puts it, and still be marked up as the one part
                  // of it that isn't prose.
                  const [before, after = ""] = t("membership.codeGoodFor").split("{email}");
                  return (
                    <>
                      {before}
                      <span className="text-ink">{email.trim().toLowerCase()}</span>
                      {after}
                    </>
                  );
                })()}
              </p>

              <form onSubmit={onSubmitCode} noValidate className="mt-7 flex flex-col">
                <Field
                  ref={codeRef}
                  label={t("membership.code")}
                  inputMode="numeric"
                  // one-time-code lets iOS and Android offer the code straight
                  // from the notification, which is most of the point of doing
                  // this with a code rather than a link.
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(next) => {
                    setCode(next.replace(/\D/g, ""));
                    setError(null);
                  }}
                  hint={error ? st(error) : undefined}
                  className="text-center text-[22px] tracking-[0.3em]"
                />

                <Button type="submit" block className="mt-6" disabled={busy}>
                  {busy ? t("membership.checking") : t("membership.continue")}
                </Button>

                <p className="m-0 mt-4 text-center text-[13px] text-muted">
                  {resent ? (
                    t("membership.sentAgain")
                  ) : (
                    <>
                      {t("membership.didntArrive")}{" "}
                      <Quiet
                        onClick={async () => {
                          const sent = await sendCode(email.trim().toLowerCase());
                          if (sent) setResent(true);
                        }}
                      >
                        {t("common.sendAnother")}
                      </Quiet>
                    </>
                  )}
                </p>
              </form>
            </>
          )}
        </div>
      </main>

      <TabBar active="account" />
    </div>
  );
}

function Quiet({
  onClick,
  children,
}: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="cb-press cursor-pointer underline underline-offset-2 hover:text-ink"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  ref,
  className = "",
  ...input
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  // Shown under the field, for the one thing it needs to say right now. Not
  // for a standing rule — a hint that's always there is a label.
  hint?: string;
  ref?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "ref">) {
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
          ref={ref}
          id={id}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-xl border border-line-soft bg-transparent px-3.5 py-3 text-[16px] leading-[20px] text-ink outline-none transition-colors focus:border-ink ${className}`}
        />
      </div>
      {hint ? <p className="m-0 mt-1.5 pl-1 text-[12px] text-brand-red">{hint}</p> : null}
    </div>
  );
}
