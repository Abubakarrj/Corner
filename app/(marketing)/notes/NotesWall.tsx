"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import { Button } from "../../ui/Button";
import { MAX_NAME, MAX_NEIGHBORHOOD, MAX_NOTE, type CornerNote } from "../../cornerNotesShape";
import type { Drawing } from "../../drawing";
import Link from "next/link";
import DrawPad from "./DrawPad";
import Polaroid from "./Polaroid";
import { scatterStyle } from "./scatter";

// The visitor's log: the wall, and the two steps to add to it.
//
// ——— Two steps, because they are two different acts ———
//
// Saying who you are and drawing a picture want different postures — one is a
// keyboard and a moment's thought, the other is a fingertip and no thought at
// all — and on a phone the keyboard covers the half of the screen the pad needs
// to be in. So: who, then what.
//
// The drawing step is skippable, and the writing step nearly is. A note with a
// drawing and no words is a note. A name is optional too and becomes
// "anonymous", because a drawing signed by nobody is still worth putting up.
//
// ——— ⚠️ What this component believes ———
//
// Nothing, until the endpoint has said so. The new note is appended only after
// a 201, for the same reason the checkout renders its confirmation only after a
// 200: a wall that shows an optimistic card and then loses it is worse than one
// that takes a second.

type Step = "closed" | "who" | "draw" | "done";

export default function NotesWall({
  initial,
  reachable,
  seeAll = false,
}: {
  /** The first page of the wall, rendered on the server so the page is not an
   *  empty box while a fetch happens. */
  initial: CornerNote[];
  /** False when there is no database behind this. The wall says so rather than
   *  offering a form that cannot save anything. */
  reachable: boolean;
  /** Whether there are more notes than this page is showing. */
  seeAll?: boolean;
}) {
  const t = useT();
  const [notes, setNotes] = useState<CornerNote[]>(initial);
  const [step, setStep] = useState<Step>("closed");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState<Drawing>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the composer, the way it closes every other layer in this
  // app. Without it the only way out of a half-written note on a phone is the
  // back button, which leaves the page.
  useEffect(() => {
    if (step === "closed") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStep("closed");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  const submit = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/corner-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, neighborhood, note, drawing }),
      });
      if (!response.ok) {
        const answer = (await response.json().catch(() => null)) as { error?: string } | null;
        // The endpoint's own reasons, translated. A 429 is the one worth
        // wording carefully: somebody who has left six notes today is not doing
        // anything wrong, they are just done for now.
        setError(
          answer?.error === "notes.tooMany"
            ? t("notes.errTooMany")
            : answer?.error === "notes.empty"
              ? t("notes.errEmpty")
              : t("notes.errSaveFailed"),
        );
        return;
      }
      const saved = (await response.json()) as { id: string };
      // Prepended rather than refetched: the wall is newest-first, this is the
      // newest, and a refetch would scroll somebody's own note out from under
      // them while it loaded.
      setNotes((was) => [
        {
          id: saved.id,
          name: name.trim() || "anonymous",
          neighborhood: neighborhood.trim() || null,
          note: note.trim(),
          drawing,
          at: new Date().toISOString(),
        },
        ...was,
      ]);
      setStep("done");
    } catch {
      setError(t("notes.errSaveFailed"));
    } finally {
      setSending(false);
    }
  }, [drawing, name, neighborhood, note, sending, t]);

  const startOver = () => {
    setName("");
    setNeighborhood("");
    setNote("");
    setDrawing([]);
    setStep("closed");
  };

  return (
    <div className="flex flex-col gap-8">
      {/* ——— The invitation ——— */}
      {reachable ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="m-0 max-w-md text-[14px] leading-[1.55] text-muted">
            {t("notes.blurb")}
          </p>
          {step === "closed" ? (
            <Button onClick={() => setStep("who")} className="w-full max-w-[280px]">
              {t("notes.write")}
            </Button>
          ) : null}
        </div>
      ) : (
        // ⚠️ Not an empty wall. See listNotes(): "nobody has written" and "we
        // cannot reach the wall" are different sentences.
        <p role="status" className="m-0 text-center text-[14px] text-muted">
          {t("notes.unavailable")}
        </p>
      )}

      {/* ——— Who ——— */}
      {step === "who" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStep("draw");
          }}
          className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-4"
        >
          <Field
            label={t("notes.yourName")}
            value={name}
            onChange={setName}
            max={MAX_NAME}
            placeholder={t("notes.namePlaceholder")}
            autoComplete="nickname"
          />
          {/* The field that makes this a neighbourhood wall rather than a
              guestbook. Optional, and often the best line on the card. */}
          <Field
            label={t("notes.neighborhood")}
            value={neighborhood}
            onChange={setNeighborhood}
            max={MAX_NEIGHBORHOOD}
            placeholder={t("notes.neighborhoodPlaceholder")}
          />
          <Field
            label={t("notes.yourNote")}
            value={note}
            onChange={setNote}
            max={MAX_NOTE}
            placeholder={t("notes.notePlaceholder")}
            multiline
          />
          <div className="flex gap-2">
            <Button type="submit" block>
              {t("notes.next")}
            </Button>
          </div>
          <button
            type="button"
            onClick={startOver}
            className="cb-tap cursor-pointer text-center text-[13px] text-muted underline"
          >
            {t("notes.cancel")}
          </button>
        </form>
      ) : null}

      {/* ——— Draw ——— */}
      {step === "draw" ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-4">
          <p className="m-0 text-[13px] leading-[1.5] text-muted">{t("notes.drawBlurb")}</p>
          <DrawPad value={drawing} onChange={setDrawing} />

          {error ? (
            <p role="alert" className="m-0 text-[13px] text-brand-red">
              {error}
            </p>
          ) : null}

          <Button onClick={() => void submit()} disabled={sending} block>
            {sending ? t("notes.pinning") : t("notes.pinItUp")}
          </Button>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep("who")}
              className="cb-tap cursor-pointer text-[13px] text-muted underline"
            >
              {t("common.back")}
            </button>
            <button
              type="button"
              onClick={startOver}
              className="cb-tap cursor-pointer text-[13px] text-muted underline"
            >
              {t("notes.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {/* ——— Up on the wall ——— */}
      {step === "done" ? (
        <div
          role="status"
          style={{ backgroundColor: "var(--cb-good-bg)" }}
          className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl p-4 text-center"
        >
          <p className="m-0 text-[14px] font-medium text-ink">{t("notes.thanks")}</p>
          <button
            type="button"
            onClick={startOver}
            className="cb-tap cursor-pointer text-[13px] text-muted underline"
          >
            {t("notes.writeAnother")}
          </button>
        </div>
      ) : null}

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

      {/* ⚠️ Shown whenever there is anything on the wall, not only once there
          is more than fits. The first version of this appeared only when the
          wall was truncated, on the reasoning that a link to "all" from a page
          already showing all is a link to itself — which is true of the count
          and false of the page. /notes/all is the by-place view, and hiding it
          on a young wall means the only way to read the wall by neighbourhood
          is to wait for it to get busy. */}
      {seeAll ? (
        <Link
          href="/notes/all"
          className="cb-press cb-tap mx-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-soft px-4 py-2 text-[13px] text-muted transition-colors hover:text-ink"
        >
          {t("notes.seeAll")}
          {/* ⚠️ Drawn, not typed. This was a "→" character, and a font glyph
              is not a sized icon: the arrow in a system UI font is drawn to
              its own optical weight and cap height, so beside 13px text it
              came out heavier and taller than the label it belonged to and
              sat off the baseline. Nothing about the pill could fix that,
              because the shape was the font's rather than ours.

              A stroked chevron at 1.7, matching BackButton, which is the only
              other arrow this app draws.

              ⚠️ Sized in em rather than pixels, so it is exactly as tall as
              the type it sits beside and stays that way if the label's size
              ever changes. A fixed 14 next to 13px text is the same drift the
              glyph had, one pixel smaller.

              `rtl:-scale-x-100`, matching CareersLanding, because "onward" is
              leftward in Urdu and Persian and this is the one arrow in the app
              that points along the reading direction. Mirrored rather than
              rotated: at this weight a 180° turn and a flip look identical,
              and the flip is the idiom already in the codebase. */}
          <svg
            width="1em"
            height="1em"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="shrink-0 rtl:-scale-x-100"
          >
            <path
              d="M3.4 8h9.2M9 4.4 12.6 8 9 11.6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}

/** One labelled field, with the cap enforced in the input rather than only on
 *  the server — so the counter and the refusal agree with each other. */
function Field({
  label,
  value,
  onChange,
  max,
  placeholder,
  multiline,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  max: number;
  placeholder: string;
  multiline?: boolean;
  autoComplete?: string;
}) {
  const shared =
    "w-full rounded-xl border border-line-soft bg-page px-3.5 py-2.5 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-muted">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          maxLength={max}
          rows={3}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={value}
          maxLength={max}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={shared}
        />
      )}
    </label>
  );
}
