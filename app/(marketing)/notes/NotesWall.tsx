"use client";

import Link from "next/link";
import { useT } from "../../i18n";
import type { CornerNote } from "../../cornerNotesShape";
import Polaroid from "./Polaroid";
import { scatterStyle } from "./scatter";

// The wall: what people left, laid out like a bench.
//
// ——— ⚠️ No composer here any more ———
//
// Writing a note used to start on this page. It lives on /notes/all now, and
// the cost of that is worth stating plainly rather than discovering: this page
// no longer offers a way in, so "See all notes" is the only route to the form.
//
// What this buys is one page with one job. The wall is the thing people come
// back to look at, and a form sitting on top of it was the first thing the eye
// landed on every time — a request, above the thing being requested.
//
// ——— This component holds nothing ———
//
// It used to keep the notes in state so it could prepend a new one. With the
// composer gone there is nothing to prepend, so the list is a prop and the
// server owns it. Every re-render draws the same wall.

export default function NotesWall({
  notes,
  reachable,
}: {
  /** The wall itself, read on the server so the page is not an empty box while
   *  a fetch happens. */
  notes: CornerNote[];
  /** False when there is no database behind this. The wall says so rather than
   *  showing an empty grid that reads as "nobody has written". */
  reachable: boolean;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-8">
      {reachable ? (
        <p className="m-0 self-center max-w-md text-center text-[14px] leading-[1.55] text-muted">
          {t("notes.blurb")}
        </p>
      ) : (
        // ⚠️ Not an empty wall. See listNotes(): "nobody has written" and "we
        // cannot reach the wall" are different sentences.
        <p role="status" className="m-0 text-center text-[14px] text-muted">
          {t("notes.unavailable")}
        </p>
      )}

      {/* ——— The wall ———

          ⚠️ Laid out like a bench rather than a table: every card is tilted a
          few degrees and nudged, from its own id so the angle is the same on
          the server, in the browser and tomorrow. See scatter.ts for why a
          random angle would tear the page in half at hydration.

          The gap is wider than a plain grid's and the container clips, because
          a rotated card is wider than an upright one and the corner of a
          five-degree tilt has to go somewhere. */}
      {notes.length === 0 && reachable ? (
        <p className="m-0 text-center text-[14px] text-muted">{t("notes.beFirst")}</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-6 overflow-hidden p-1 sm:grid-cols-3">
          {notes.map((entry) => (
            <li key={entry.id} style={scatterStyle(entry.id)}>
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

      {/* ——— The one control on the page ———

          ⚠️ Shown whenever the wall is reachable, empty or not. It used to
          appear only once the wall overflowed, then only once it had anything;
          both of those are wrong now that the form lives on the other side of
          it. An empty wall saying "be the first" with nothing to press is a
          dead end.

          ⚠️ And the label changes with the wall, because one pill is doing two
          jobs. On a wall with cards the destination is the by-place view, so
          it says so. On an empty wall there is nothing to see there and the
          only reason to go is to write — a pill reading "See all notes" over
          "Nobody's written yet" sends you to a second empty page. */}
      {reachable ? (
        <Link
          href="/notes/all"
          className="cb-press cb-tap mx-auto inline-flex cursor-pointer items-center rounded-full border border-line-soft px-4 py-2 text-[13px] text-muted transition-colors hover:text-ink"
        >
          {/* ⚠️ No arrow, drawn or typed. This had a "→" character, then a
              stroked chevron sized to the type — and the icon was never the
              problem. A pill whose whole label is "See all notes" is already
              a link to a page; an arrow beside it repeats what the words say
              and gives the eye a second thing to land on.

              Same reasoning as AboutMenu, which carries no caret for the same
              reason: a chip whose job is to be quiet does not need a glyph
              announcing that it goes somewhere. */}
          {notes.length === 0 ? t("notes.write") : t("notes.seeAll")}
        </Link>
      ) : null}
    </div>
  );
}
