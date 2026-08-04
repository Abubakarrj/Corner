"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "../../shop/shopControls";

const { olive, controlBorder, muted, faint, border } = PALETTE;

type Suggestion = { placeId: string; primary: string; secondary: string };

export type ResolvedAddress = {
  address: string;
  lat: number;
  lng: number;
  miles: number;
  inRange: boolean;
  radiusMiles: number;
};

// Google bills a run of autocomplete calls plus the one details call that
// follows as a single session, keyed by this token — so it's minted once per
// address the visitor is looking for, and replaced as soon as one is chosen.
// Without it every keystroke bills separately.
function newSessionToken() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random()}`;
}

// The delivery address picker: type, get real addresses back, choose one.
//
// This replaces a plain text field that accepted anything — "asdf" included —
// and handed it to the kitchen as a delivery address. Nothing here is
// free-text: an address is only usable once it's been chosen from Google's
// results and resolved to coordinates, which is also what makes the
// delivery-radius check possible.
export default function AddressSearch({
  value,
  onValueChange,
  onResolved,
}: {
  value: string;
  onValueChange: (next: string) => void;
  onResolved: (resolved: ResolvedAddress) => void;
}) {
  // Every piece of async state carries the query it belongs to, and the
  // render below only shows it when that still matches what's typed. That's
  // what keeps stale results off the screen without an effect reaching in to
  // clear them — a synchronous setState inside an effect is both a cascading
  // render and, here, a race with the request already in flight.
  const [suggestions, setSuggestions] = useState<{ forQuery: string; items: Suggestion[] }>({
    forQuery: "",
    items: [],
  });
  const [status, setStatus] = useState<{ forQuery: string; state: "searching" | "idle" }>({
    forQuery: "",
    state: "idle",
  });
  const [error, setError] = useState<{ forQuery: string; message: string } | null>(null);
  // Keyed by the text that was put in the field when the suggestion was
  // chosen, not by the resolved address — Google's formattedAddress is
  // normalised ("...CA 95014, USA") and rarely equals the suggestion text
  // ("...CA, USA"), so comparing against it hid this notice every time.
  const [outOfRange, setOutOfRange] = useState<
    { forQuery: string; resolved: ResolvedAddress } | null
  >(null);
  const sessionToken = useRef(newSessionToken());
  // Set when a suggestion is chosen, so the results don't immediately
  // reappear for the text that choosing it just wrote into the field.
  const justChose = useRef(false);

  useEffect(() => {
    if (justChose.current) {
      justChose.current = false;
      return;
    }
    const input = value.trim();
    if (input.length < 3) return;

    // Debounced, because this is billed per call and a fast typist would
    // otherwise fire one for every letter.
    const timer = window.setTimeout(async () => {
      setStatus({ forQuery: input, state: "searching" });
      setError(null);
      try {
        const response = await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "autocomplete",
            input,
            sessionToken: sessionToken.current,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Address search failed.");
        setSuggestions({ forQuery: input, items: body?.suggestions ?? [] });
      } catch (searchError) {
        setSuggestions({ forQuery: input, items: [] });
        setError({
          forQuery: input,
          message:
            searchError instanceof Error ? searchError.message : "Address search failed.",
        });
      } finally {
        setStatus({ forQuery: input, state: "idle" });
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value]);

  async function choose(suggestion: Suggestion) {
    const chosenText = [suggestion.primary, suggestion.secondary]
      .filter(Boolean)
      .join(", ");
    justChose.current = true;
    onValueChange(chosenText);
    setSuggestions({ forQuery: chosenText, items: [] });
    setError(null);
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "details",
          placeId: suggestion.placeId,
          sessionToken: sessionToken.current,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Couldn't read that address.");
      // The session ends with the details call — the next search is a new one.
      sessionToken.current = newSessionToken();
      const resolved = body as ResolvedAddress;
      if (!resolved.inRange) {
        setOutOfRange({ forQuery: chosenText, resolved });
        return;
      }
      onResolved(resolved);
    } catch (detailsError) {
      setError({
        forQuery: chosenText,
        message:
          detailsError instanceof Error
            ? detailsError.message
            : "Couldn't read that address.",
      });
    }
  }

  // Only what belongs to what's currently typed survives to the render.
  const query = value.trim();
  const items = suggestions.forQuery === query ? suggestions.items : [];
  const message = error?.forQuery === query ? error.message : null;
  const searching = status.forQuery === query && status.state === "searching";
  const rangeNotice = outOfRange?.forQuery === query ? outOfRange.resolved : null;

  if (query.length < 3) return null;
  if (items.length === 0 && !message && !searching && !rangeNotice) return null;

  return (
    <div className="border-t px-5 py-2" style={{ borderColor: border }}>
      {rangeNotice ? (
        <div className="py-3">
          <p className="m-0 text-[14px] font-bold" style={{ color: olive }}>
            That address is outside our delivery area.
          </p>
          <p className="m-0 mt-1 text-[13px]" style={{ color: muted }}>
            {rangeNotice.address} is {rangeNotice.miles.toFixed(1)} miles out; we
            deliver within {rangeNotice.radiusMiles}. Pickup is still open.
          </p>
        </div>
      ) : message ? (
        <p className="m-0 py-3 text-[13px]" style={{ color: "#BE1923" }}>
          {message}
        </p>
      ) : searching && items.length === 0 ? (
        <p className="m-0 py-3 text-[13px]" style={{ color: faint }}>
          Searching…
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onClick={() => choose(suggestion)}
                className="flex w-full cursor-pointer items-center gap-3 border-b py-3 text-left transition-colors last:border-b-0 hover:bg-[#EFEBDD]"
                style={{ borderColor: controlBorder }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]" style={{ color: olive }}>
                    {suggestion.primary}
                  </span>
                  {suggestion.secondary ? (
                    <span className="block truncate text-[13px]" style={{ color: muted }}>
                      {suggestion.secondary}
                    </span>
                  ) : null}
                </span>
                {/* The chevron from the reference — these rows go somewhere. */}
                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
                  <path
                    d="M1 1l6 6-6 6"
                    stroke={faint}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
