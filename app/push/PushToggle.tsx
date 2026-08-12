"use client";

import { useLocale, useT } from "../i18n";
import { usePush, type PushOrder } from "./usePush";

// The one place a customer turns notifications on.
//
// On the tracker, and nowhere else. Two reasons, and they are the same reason:
// a permission prompt only gets granted when the person can see what it is
// for, and this screen is the only one where "tell me when this is ready" is
// something they are already waiting to know. Asking on the front door, or on
// page load anywhere, is how a site gets denied permanently — and a denial can
// only be undone in browser settings, which nobody does.
//
// Every state is a sentence rather than a disabled control. "Off" on an iPhone
// in a Safari tab is a lie: it will work, once the app is on the Home Screen,
// and saying so is the difference between a feature nobody can find and one
// somebody installs the app for.
export default function PushToggle({ order }: { order: PushOrder | null }) {
  const t = useT();
  const locale = useLocale();
  const { state, enable, disable } = usePush(order, locale);

  if (state === "unsupported" || state === "unconfigured" || !order) return null;

  const line = "mt-3 rounded-xl px-4 py-3 text-[13px] leading-[1.5]";

  if (state === "needs-install") {
    return (
      <p className={`${line} bg-raise text-muted`}>{t("push.installFirst")}</p>
    );
  }
  if (state === "denied") {
    return <p className={`${line} bg-raise text-muted`}>{t("push.blocked")}</p>;
  }

  const on = state === "on";
  const busy = state === "working";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void (on ? disable() : enable())}
      aria-pressed={on}
      className={`cb-press mt-3 flex w-full cursor-pointer items-center justify-between gap-3 rounded-full border px-4 py-2.5 text-[13px] font-medium transition-colors disabled:cursor-default ${
        on ? "border-ink bg-raise text-ink" : "border-line-soft text-ink hover:bg-raise"
      }`}
    >
      <span>{busy ? t("push.working") : on ? t("push.on") : t("push.turnOn")}</span>
      <span aria-hidden className="text-[15px] leading-none">
        {on ? "✓" : "→"}
      </span>
    </button>
  );
}
