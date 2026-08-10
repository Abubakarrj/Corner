"use client";

import Link from "next/link";
import { useT } from "../i18n";

// "We are Hiring!" — the way in to /careers, and the only one on the site.
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
// What differs is the fill: olive, the brand's own green, with --cb-on-ink on
// top. That token is defined per theme as "whatever reads on a solid ground",
// which is what makes this work in both without a `dark:` variant — light
// olive is dark, so the label is near-white at 8.81:1; dark olive is light, so
// the label is near-black at 7.04:1. Against the page the chip itself sits at
// 9.43:1 and 7.47:1, well past the 3:1 a UI component's boundary needs.
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
      className={`cb-press inline-flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-transparent bg-olive px-2.5 text-[11px] font-semibold leading-none text-on-ink transition-opacity hover:opacity-90 ${className}`}
    >
      {t("about.workWithUs")}
    </Link>
  );
}
