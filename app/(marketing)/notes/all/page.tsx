import Link from "next/link";
import type { Metadata } from "next";
import PageTitle from "../../../ui/PageTitle";
import BackButton from "../../../ui/BackButton";
import { countNotes, listNeighborhoods, listNotes } from "../../../cornerNotes";
import Polaroid from "../Polaroid";

// Every note, by neighbourhood.
//
// ——— ⚠️ Why this is a different page and not a "load more" ———
//
// The wall is scattered, newest first, and that is right for the thing people
// come back to look at. It is the wrong shape for four hundred cards: tilted
// cards are harder to scan, newest-first answers a question nobody asks ("what
// came in on Tuesday"), and an infinite scroll of them has no end to reach.
//
// So the full list is its own page, laid flat and ordered by place, because
// "who else is in Koreatown" is a question somebody actually has. The chips
// filter it; the grid is square and aligned, which is what a list is for.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Corner Notes",
  description: "Every note left at Corner Bagel, by neighborhood.",
};

export default async function AllNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ in?: string }>;
}) {
  const { in: where } = await searchParams;
  const [notes, places, total] = await Promise.all([
    // ⚠️ 120 is the cap listNotes() enforces anyway. Said here so the number on
    // screen and the number fetched are the same decision rather than two.
    listNotes(120, 0, { byPlace: true, ...(where ? { in: where } : {}) }),
    listNeighborhoods(),
    countNotes(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
      <PageTitle k="notes.allTitle" />

      <div className="flex items-center gap-1">
        {/* The app's own back control, not a link of this page's own. It goes
            where you came from when there is somewhere, and up a level when
            there is not — see BackButton. */}
        <BackButton fallback="/notes" className="-ml-2.5" />
        <p className="m-0 text-[20px] font-medium text-ink">All notes</p>
        {total !== null ? (
          <span className="ms-auto text-[13px] tabular-nums text-quiet">{total}</span>
        ) : null}
      </div>

      {/* ——— By place ———

          A row of chips rather than a dropdown: there are rarely more than a
          dozen and they are the interesting content of this page, not a
          setting to be tucked away. Links rather than buttons, so each filter
          is a URL somebody can send. */}
      {places && places.length > 0 ? (
        <nav aria-label="Neighborhoods" className="mt-4 flex flex-wrap gap-1.5">
          <Chip href="/notes/all" active={!where} label="Everywhere" />
          {places.map((place) => (
            <Chip
              key={place.name}
              href={`/notes/all?in=${encodeURIComponent(place.name)}`}
              active={(where ?? "").toLowerCase() === place.name.toLowerCase()}
              label={place.name}
              count={place.count}
            />
          ))}
        </nav>
      ) : null}

      {notes === null ? (
        <p role="status" className="mt-8 text-center text-[14px] text-muted">
          The wall is having a moment. Try again in a bit.
        </p>
      ) : notes.length === 0 ? (
        <p className="mt-8 text-center text-[14px] text-muted">
          Nothing from here yet.{" "}
          <Link href="/notes" className="cursor-pointer underline">
            Write the first one
          </Link>
          .
        </p>
      ) : (
        // Flat and aligned, unlike the wall. See the note at the top.
        <ul className="m-0 mt-6 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {notes.map((entry) => (
            <li key={entry.id}>
              <Polaroid
                name={entry.name}
                neighborhood={entry.neighborhood}
                note={entry.note}
                drawing={entry.drawing}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      // aria-current, so the chosen one is announced as the current filter
      // rather than as one more link that happens to look different.
      aria-current={active ? "true" : undefined}
      className={`cb-press cb-tap inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] leading-none transition-colors ${
        active
          ? "border-ink bg-ink text-on-ink"
          : "border-line-soft text-muted hover:text-ink"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span className={active ? "opacity-70" : "text-faint"}>{count}</span>
      ) : null}
    </Link>
  );
}
