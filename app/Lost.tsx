"use client";

import Link from "next/link";
import TabBar from "./(marketing)/TabBar";
import BagelMark from "./BagelMark";
import { ButtonLink } from "./ui/Button";
import { useT, type StringKey } from "./i18n";

// The screen at the end of a road that does not go anywhere.
//
// ——— ⚠️ Why this is not a nicety ———
//
// Every unmatched route used to fall through to Next's stock 404: black
// Helvetica on white, no header, no tab bar, no link home, and English
// whichever of the ten languages the visitor had chosen. The only anchor on
// the page was the cookie banner's "consent".
//
// On the web that is merely off-brand — the browser's back button rescues
// anybody who lands there. Installed to a home screen there is no back button
// and no address bar, which makes a mistyped or stale link the end of the
// session. That is the whole reason this file exists: not to look better, but
// to be a way out.
//
// The tab bar is the way out. A single "back to the menu" button is one guess
// about where somebody wanted to be; the tab bar is every door the app has,
// and it is the same one they were using a moment ago.
//
// ——— One component, two doors ———
//
// A wrong URL and a crashed render are different events and the same problem:
// a person is looking at a screen that is not the app. So they share a shape
// and differ only in what they say and what the button does — retry for a
// crash, since a transient failure often clears; the menu for a 404, since
// that page is not coming back.
export default function Lost({
  title,
  lede,
  action,
}: {
  title: StringKey;
  lede: StringKey;
  /** The primary way out. A link on the not-found screen; a retry on the error
   *  screen, where trying the same route again is the thing most likely to
   *  work. */
  action?: { label: StringKey; onClick: () => void };
}) {
  const t = useT();

  return (
    // cb-app-shell, not a min-height of my own. The cookie banner docks to the
    // floor on every route and the shell shortens itself by --cb-consent-h to
    // make room; a bare 100svh puts the tab bar underneath the banner, which
    // is precisely the dead end this screen exists to prevent. It matters most
    // in an in-app browser, where the host chrome leaves about 560px.
    <div className="cb-app-shell flex w-full flex-col overflow-hidden bg-cream">
      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-10 text-center">
        {/* Decorative. The heading below carries the meaning, and a screen
            reader announcing "bagel" before "this page isn't here" is one
            word of noise in front of the sentence that matters. */}
        <span aria-hidden className="mb-6 block h-14 w-14 opacity-60">
          <BagelMark />
        </span>

        <h1 className="m-0 text-[22px] font-medium leading-tight tracking-[-0.01em] text-ink">
          {t(title)}
        </h1>
        <p className="m-0 mt-3 max-w-xs text-[14px] leading-[1.55] text-muted">{t(lede)}</p>

        <div className="mt-8 flex w-full max-w-[280px] flex-col gap-3">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="cb-press inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-on-ink transition-opacity hover:opacity-90"
            >
              {t(action.label)}
            </button>
          ) : null}
          <ButtonLink href="/shop" className="w-full">
            {t("common.backToMenu")}
          </ButtonLink>
          <Link
            href="/"
            className="cb-press inline-flex min-h-[44px] cursor-pointer items-center justify-center text-[14px] text-muted underline hover:text-ink"
          >
            {t("lost.goHome")}
          </Link>
        </div>
      </main>

      {/* ⚠️ The point of the whole screen. Without this a visitor in the
          installed app has no navigation at all — this is the component that
          turns a dead end back into a page of the app. */}
      <TabBar active="home" />
    </div>
  );
}
