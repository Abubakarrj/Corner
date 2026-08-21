"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../../i18n";
import { Button } from "../../ui/Button";
import { MAX_NAME, MAX_NEIGHBORHOOD, MAX_NOTE } from "../../cornerNotesShape";
import type { Drawing } from "../../drawing";
import DrawPad from "./DrawPad";
import { takePhoto } from "./takePhoto";
import { rememberNote } from "./mine";

// Writing one, in two steps.
//
// ——— Two steps, because they are two different acts ———
//
// Saying who you are and drawing a picture want different postures — one is a
// keyboard and a moment's thought, the other is a fingertip and no thought at
// all — and on a phone the keyboard covers the half of the screen the pad needs
// to be in. So: who, then what.
//
// The drawing step is skippable and the writing step nearly is. A note with a
// drawing and no words is a note. A name is optional too and becomes
// "anonymous", because a drawing signed by nobody is still worth putting up.
//
// ——— ⚠️ It believes nothing until the endpoint has said so ———
//
// The thanks box appears only after a 201, for the same reason the checkout
// renders its confirmation only after a 200: telling somebody their note is up
// and then losing it is worse than taking a second to be sure.
//
// ——— ⚠️ router.refresh(), not an optimistic card ———
//
// The wall used to prepend the new note to a list it held in state. That was
// right when the composer lived on a page showing every note in date order. It
// is wrong here: this page can be filtered to one neighbourhood, and a note
// written from Koreatown prepended onto a list filtered to Echo Park is a card
// that contradicts the filter above it.
//
// So the server re-renders and decides for itself whether the new note belongs
// in what is on screen. It costs a round trip and it cannot be wrong.
//
// ——— The camera sits on the drawing step, not on a third one ———
//
// A photograph and a scribble are the same act here: the picture on the card.
// They also compose — the photo becomes the pad's background and the strokes go
// on top, so drawing on your own photo is not a feature anybody had to build,
// it is what happens when the two share a square.
//
// ⚠️ Everything about the picture is decided in this browser. takePhoto()
// shrinks and re-encodes it, which is what removes the location the phone wrote
// into the file. See the note at the top of takePhoto.ts.

type Step = "closed" | "who" | "draw" | "done";

export default function NoteComposer() {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState<Drawing>([]);
  // The photo, as the data URL that gets sent. One at a time: a polaroid has
  // one window.
  const [photo, setPhoto] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes it, the way it closes every other layer in this app. Without
  // it the only way out of a half-written note on a phone is the back button,
  // which leaves the page.
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
        body: JSON.stringify({ name, neighborhood, note, drawing, photo }),
      });
      if (!response.ok) {
        const answer = (await response.json().catch(() => null)) as { error?: string } | null;
        // The endpoint's own reasons, translated. A 429 is the one worth
        // wording carefully: somebody who has left six notes today is not doing
        // anything wrong, they are just done for now.
        //
        // ⚠️ `notes.language` says a note was refused and not which field or
        // which word — see the route for why. It is also the only one of these
        // that is worth showing on the step somebody can act on: the name and
        // the neighbourhood are back on the first screen, so this sends them
        // there rather than leaving the message beside a drawing pad that has
        // nothing to do with it.
        if (answer?.error === "notes.language") {
          setError(t("notes.language"));
          setStep("who");
          return;
        }
        setError(
          answer?.error === "notes.tooMany"
            ? t("notes.errTooMany")
            : answer?.error === "notes.empty"
              ? t("notes.errEmpty")
              : // Both photo refusals say the same thing, because from where
                // somebody is standing they are the same thing: the picture did
                // not go. One is "that file was not a photo we can take" and
                // the other is "the whole request was too large", and neither
                // is worth two sentences to a person holding a phone.
                answer?.error === "notes.photoBad" || answer?.error === "notes.tooBig"
                ? t("notes.errPhoto")
                : t("notes.errSaveFailed"),
        );
        return;
      }
      // ⚠️ The token comes back once, in this response and no other. Kept
      // before anything else happens, because a refresh that lands first would
      // re-render the wall with a card this browser cannot prove it wrote.
      // See app/noteOwner.ts.
      const saved = (await response.json().catch(() => null)) as
        | { id?: unknown; unpin?: unknown }
        | null;
      if (typeof saved?.id === "string" && typeof saved.unpin === "string") {
        rememberNote(saved.id, saved.unpin);
      }
      setStep("done");
      // The page re-reads itself, filter and ordering intact. See the note at
      // the top for why this is not an optimistic prepend.
      router.refresh();
    } catch {
      setError(t("notes.errSaveFailed"));
    } finally {
      setSending(false);
    }
  }, [drawing, name, neighborhood, note, photo, router, sending, t]);

  const startOver = () => {
    setName("");
    setNeighborhood("");
    setNote("");
    setDrawing([]);
    setPhoto(null);
    setStep("closed");
  };

  /** A file off the camera or the library, made into something sendable.
   *
   *  ⚠️ The input's value is cleared at the end whatever happened. Without it,
   *  choosing a photo, removing it, and choosing the same one again fires no
   *  change event at all — the value did not change — and the camera button
   *  looks broken for exactly the person who is being careful. */
  const choosePhoto = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setLoadingPhoto(true);
      setError(null);
      try {
        const shrunk = await takePhoto(file);
        if (shrunk) setPhoto(shrunk);
        else setError(t("notes.errPhoto"));
      } finally {
        setLoadingPhoto(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [t],
  );

  if (step === "closed") {
    return (
      <Button onClick={() => setStep("who")} className="w-full max-w-[280px]">
        {t("notes.write")}
      </Button>
    );
  }

  if (step === "done") {
    return (
      <div
        role="status"
        style={{ backgroundColor: "var(--cb-good-bg)" }}
        className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl p-4 text-center"
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
    );
  }

  if (step === "who") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Cleared on the way out, not on the way in. A refusal that stays on
          // screen while somebody edits the field it was about is the point of
          // it; one that survives into the next attempt is just noise.
          setError(null);
          setStep("draw");
        }}
        className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-4 text-start"
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
        {/* Shown here as well as on the drawing step, because a refusal about
            words belongs beside the words. Coming back from a failed submit
            lands on this step for that reason. */}
        {error ? (
          <p role="alert" className="m-0 text-[13px] text-brand-red">
            {error}
          </p>
        ) : null}
        <Button type="submit" block>
          {t("notes.next")}
        </Button>
        <button
          type="button"
          onClick={startOver}
          className="cb-tap cursor-pointer text-center text-[13px] text-muted underline"
        >
          {t("notes.cancel")}
        </button>
      </form>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-4 text-start">
      <p className="m-0 text-[13px] leading-[1.5] text-muted">{t("notes.drawBlurb")}</p>
      <DrawPad value={drawing} onChange={setDrawing} photo={photo} />

      {/* ——— The camera ———

          A file input styled as nothing and driven by the button beside it,
          which is the only way to get a control that looks like the rest of
          this form. `capture="environment"` is a hint, not a rule: on a phone
          it opens the back camera straight away, and on a laptop the browser
          ignores it and offers the file picker, which is the right answer
          there. accept="image/*" rather than image/jpeg — a phone hands over
          HEIC and the canvas turns it into a JPEG on the way through, and
          refusing it at the picker would mean an iPhone could not take part. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void choosePhoto(event.target.files?.[0])}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loadingPhoto}
          className="cb-press cb-tap inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-40"
        >
          <CameraIcon />
          {loadingPhoto ? t("notes.photoBusy") : photo ? t("notes.retakePhoto") : t("notes.addPhoto")}
        </button>
        {photo ? (
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className="cb-press cb-tap cursor-pointer rounded-full border border-line-soft px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            {t("notes.removePhoto")}
          </button>
        ) : null}
      </div>

      {/* ⚠️ Said before the photo is sent, not after it fails to appear. A
          picture that goes up a minute after the note does is fine; a picture
          that goes up a minute after the note with no warning is a shop that
          looks broken to the person who just used it. */}
      {photo ? (
        <p className="m-0 text-[12px] leading-[1.45] text-quiet">{t("notes.photoWait")}</p>
      ) : null}

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
  );
}

/** A camera, at the size of the text beside it.
 *
 *  aria-hidden and no title: the button says what it does in ten languages, and
 *  an icon that also announces itself makes a screen reader say it twice. */
function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* The body, with the little raised bump over the lens that is the one
          detail that makes a rounded rectangle read as a camera. */}
      <path d="M3 8.5a2 2 0 0 1 2-2h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
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
