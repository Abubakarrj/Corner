"use client";

import Link from "next/link";
import { useT } from "../i18n";

// "Work with us" — the way in to /careers, and the only one on the site.
//
// It rides in the corner strip with the language picker and the appearance
// switch: same 28px height, same pill, same border, so the three read as one
// strip of chrome rather than a link somebody stuck near a widget. That strip
// is also the right place for it — the alternatives were an About card whose
// spacing took real measurement to get right, a tab bar with five tabs and no
// sixth, and a shop header that would be advertising a job to somebody
// halfway through buying breakfast.
//
// `shell` matches LanguagePicker and ThemeToggle: the marketing front door is
// white, where the shop's warm --cb-line-soft reads as tan, and the shop's
// screens are cream, where the grey one reads as cold.
export default function WorkWithUsChip({
  className = "",
  shell = "surface",
}: {
  className?: string;
  shell?: "surface" | "page";
}) {
  const t = useT();
  const ring = shell === "page" ? "border-line-grey bg-page" : "border-line-soft bg-surface";

  return (
    <Link
      href="/careers"
      // whitespace-nowrap, no truncate: the label is the whole control, and
      // "Work wit…" is worse than a chip that wraps to its own line. The strip
      // it sits in wraps instead — see the marketing home page.
      className={`cb-press inline-flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium leading-none transition-colors hover:text-ink ${ring} ${
        shell === "page" ? "text-quiet" : "text-muted"
      } ${className}`}
    >
      {t("about.workWithUs")}
    </Link>
  );
}
