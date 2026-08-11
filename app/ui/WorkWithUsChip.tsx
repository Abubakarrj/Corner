"use client";

import Link from "next/link";
import { useT } from "../i18n";

// "We Are Hiring!" — the way in to /careers, and the only one on the site.
//
// It rides in the corner strip with the language picker and the appearance
// switch, and for a while it was dressed exactly like them: same pill, same
// hairline border, same quiet grey label. That was the mistake. Those two are
// settings — things you adjust about the page you are already on — and a job
// opening is not a setting. Wearing their clothes, it read as a third
// preference nobody had reason to touch.
//
// So the geometry stays and the voice changes. Same 28px height, same radius,
// same 10px of side padding, and a transparent border in place of the hairline
// so the box measures identically and the three still line up as one strip.
// What differs is the fill: the mark's own red, the colour of the logo four
// inches below it. It was olive for a while, on the reasoning that the brand
// green was underused — but red is the colour this shop actually is, and a
// hiring chip in it reads as part of the logo rather than as a widget that
// happens to be green.
//
// --cb-red-fill, not --cb-red. Those are two different jobs and two different
// values: --cb-red is text, and at night it is lifted to #f08a90 so it can be
// read on near-black, which as a solid pill is pale pink beside a logo that
// stays #BE1923 in both themes. The fill token is the mark's red in light and
// the smallest lift off it that clears contrast in dark. White label either
// way: 5.85:1 light, 4.92:1 dark, and the pill against the page 6.26:1 and
// 3.43:1 — past the 4.5:1 an 11px label needs and the 3:1 a component's
// boundary needs.
//
// hover:opacity-90 rather than the neighbours' hover:text-ink: on a filled
// control there is no text colour left to darken, and this is the same hover
// every other filled thing in the app uses (Button, TipPicker, ChatConfigure).
//
// The `shell` prop went with the border. Its whole job was choosing between
// the marketing front door's grey hairline and the shop's warm one, and a
// chip with no hairline has nothing to choose.
export default function WorkWithUsChip({ className = "" }: { className?: string }) {
  const t = useT();

  return (
    <Link
      href="/careers"
      // whitespace-nowrap, no truncate: the label is the whole control, and
      // "We are Hiri…" is worse than a chip that wraps to its own line. The
      // strip it sits in wraps instead — see the marketing home page.
      className={`cb-press inline-flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-transparent bg-brand-red-fill px-2.5 text-[11px] font-semibold leading-none text-on-red transition-opacity hover:opacity-90 ${className}`}
    >
      {t("about.workWithUs")}
    </Link>
  );
}
