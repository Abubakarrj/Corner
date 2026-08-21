"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "../../i18n";
import { Button } from "../../ui/Button";
import { MAX_NAME, MAX_NEIGHBORHOOD, MAX_NOTE } from "../../cornerNotesShape";
import type { Drawing } from "../../drawing";
import DrawPad from "./DrawPad";

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

type Step = "closed" | "who" | "draw" | "done";

export default function NoteComposer() {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [note, setNote] = useState("");
  const [drawing, setDrawing] = useState<Drawing>([]);
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
      setStep("done");
      // The page re-reads itself, filter and ordering intact. See the note at
      // the top for why this is not an optimistic prepend.
      router.refresh();
    } catch {
      setError(t("notes.errSaveFailed"));
    } finally {
      setSending(false);
    }
  }, [drawing, name, neighborhood, note, router, sending, t]);

  const startOver = () => {
    setName("");
    setNeighborhood("");
    setNote("");
    setDrawing([]);
    setStep("closed");
  };

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
