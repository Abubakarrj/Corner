"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../../../i18n";

// The shop, putting its key in.
//
// ——— ⚠️ One field, and nothing that helps somebody guess ———
//
// This is the only form on a public site that takes the shop's key, so it is
// the only place a stranger can sit and try. Everything that would normally
// make a sign-in form pleasant is what would make this worse: no "that key
// looks too short", no counter, no distinction between a wrong key and a
// deploy with no key set. One message for every way of not getting in, and the
// endpoint behind it answers the same way — see app/api/shop-key.
//
// type="password" so it does not sit in plain view on a counter, and
// autoComplete="off" so a browser does not offer to remember a shared key on a
// device that might be shared too.

export default function KeeperForm({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async (body: Record<string, unknown>) => {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/shop-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || answer?.ok !== true) {
        setFailed(true);
        return;
      }
      setKey("");
      // ⚠️ refresh, not a redirect. Whether the shop is signed in is decided on
      // the server while rendering, so the page has to be asked again — pushing
      // to /notes would serve whatever was cached for a signed-out visitor and
      // show a wall with no controls on it, which reads as a key that did not
      // work.
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  if (signedIn) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-[14px] text-ink">{t("keeper.signedIn")}</p>
        <p className="m-0 text-[13px] leading-[1.5] text-muted">{t("keeper.signedInHow")}</p>
        <button
          type="button"
          onClick={() => void send({ out: true })}
          disabled={sending}
          className="cb-press cb-tap cursor-pointer rounded-full border border-line-soft px-4 py-2 text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {t("keeper.signOut")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send({ key });
      }}
      className="flex flex-col items-start gap-3"
    >
      <label htmlFor="cb-shop-key" className="text-[13px] text-muted">
        {t("keeper.label")}
      </label>
      <input
        id="cb-shop-key"
        type="password"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full max-w-sm rounded-xl border border-line-soft bg-surface px-3 py-2.5 text-[15px] text-ink outline-none focus:border-ink"
      />
      <button
        type="submit"
        disabled={sending || key.length === 0}
        className="cb-press cb-tap cursor-pointer rounded-full bg-primary px-5 py-2.5 text-[14px] text-on-primary transition-opacity disabled:opacity-50"
      >
        {t("keeper.signIn")}
      </button>
      {/* ⚠️ One message, whatever went wrong. role="alert" so it is spoken
          rather than only shown — a person who cannot see the form still needs
          to know the key did not take. */}
      {failed ? (
        <p role="alert" className="m-0 text-[13px] text-red">
          {t("keeper.failed")}
        </p>
      ) : null}
    </form>
  );
}
