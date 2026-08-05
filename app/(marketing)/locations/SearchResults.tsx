"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "../../shop/shopControls";
import type { StoreLocation } from "./locations";

const { olive, onOlive, controlBorder, muted, faint, border } = PALETTE;

export type Suggestion = { placeId: string; primary: string; secondary: string };

export type ResolvedPlace = {
  address: string;
  lat: number;
  lng: number;
  miles: number;
  inRange: boolean;
  radiusMiles: number;
};

// Google bills a run of autocomplete calls plus the one details call that
// follows as a single session, keyed by this token — minted once per thing
// the visitor is looking for, replaced as soon as one is chosen. Without it
// every keystroke bills separately.
function newSessionToken() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random()}`;
}

function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
      <path
        d="M1 1l6 6-6 6"
        stroke={faint}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The results panel under the search field, per the reference.
//
// The field promises "store, city, state, or zip", which is two searches, so
// there are two tabs with their counts: places from Google, and our own shops
// matched by name. Delivery has neither — it wants one address, so it shows a
// plain list and no tabs.
//
// Everything async carries the query it belongs to, and the render only shows
// what still matches what's typed. That keeps stale results off the screen
// without an effect reaching in to clear them.
export default function SearchResults({
  mode,
  value,
  stores,
  onValueChange,
  onPickStore,
  onPickPlace,
  onResolvedAddress,
}: {
  mode: "pickup" | "delivery" | "catering";
  value: string;
  // Our own locations of the kind this mode shows, already filtered by the
  // caller — matching them is a substring test over a handful of rows, so it
  // doesn't need a request.
  stores: StoreLocation[];
  onValueChange: (next: string) => void;
  onPickStore: (store: StoreLocation) => void;
  onPickPlace: (place: ResolvedPlace) => void;
  onResolvedAddress: (place: ResolvedPlace) => void;
}) {
  const isDelivery = mode === "delivery";
  // Which tab is showing is derived, not stored, so it can follow the query
  // without an effect resetting it: our own shops win by default whenever
  // they match, since someone typing "ktown" wants the shop, not the
  // neighbourhood. A tab the visitor actually picked overrides that — but
  // only for the query they picked it on, so the next search starts fresh.
  const [chosenTab, setChosenTab] = useState<{ forQuery: string; tab: "places" | "stores" } | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<{ forQuery: string; items: Suggestion[] }>({
    forQuery: "",
    items: [],
  });
  const [status, setStatus] = useState<{ forQuery: string; state: "searching" | "idle" }>({
    forQuery: "",
    state: "idle",
  });
  const [error, setError] = useState<{ forQuery: string; message: string } | null>(null);
  // Keyed by the text put in the field when the suggestion was chosen, not by
  // the resolved address — Google's formattedAddress is normalised and rarely
  // equals the suggestion text, which would hide this every time.
  const [outOfRange, setOutOfRange] = useState<
    { forQuery: string; resolved: ResolvedPlace } | null
  >(null);
  const sessionToken = useRef(newSessionToken());
  const justChose = useRef(false);

  useEffect(() => {
    if (justChose.current) {
      justChose.current = false;
      return;
    }
    const input = value.trim();
    if (input.length < 3) return;

    // Debounced: this is billed per call, and a fast typist would otherwise
    // fire one for every letter.
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
            kind: isDelivery ? "address" : "region",
            sessionToken: sessionToken.current,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Search failed.");
        setSuggestions({ forQuery: input, items: body?.suggestions ?? [] });
      } catch (searchError) {
        setSuggestions({ forQuery: input, items: [] });
        setError({
          forQuery: input,
          message: searchError instanceof Error ? searchError.message : "Search failed.",
        });
      } finally {
        setStatus({ forQuery: input, state: "idle" });
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value, isDelivery]);

  async function choosePlace(suggestion: Suggestion) {
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
      if (!response.ok) throw new Error(body?.error ?? "Couldn't read that.");
      // The session ends with the details call — the next search is a new one.
      sessionToken.current = newSessionToken();
      const resolved = body as ResolvedPlace;

      if (isDelivery) {
        if (!resolved.inRange) {
          setOutOfRange({ forQuery: chosenText, resolved });
          return;
        }
        onResolvedAddress(resolved);
        return;
      }
      // Pickup and Catering: a place is somewhere to point the map, not an
      // order destination. The shop is chosen from the card over the map.
      onPickPlace(resolved);
    } catch (detailsError) {
      setError({
        forQuery: chosenText,
        message:
          detailsError instanceof Error ? detailsError.message : "Couldn't read that.",
      });
    }
  }

  const query = value.trim();
  const items = suggestions.forQuery === query ? suggestions.items : [];
  const message = error?.forQuery === query ? error.message : null;
  const searching = status.forQuery === query && status.state === "searching";
  const rangeNotice = outOfRange?.forQuery === query ? outOfRange.resolved : null;

  if (query.length < 3) return null;
  if (items.length === 0 && stores.length === 0 && !message && !searching && !rangeNotice) {
    return null;
  }

  const defaultTab = stores.length > 0 ? "stores" : "places";
  const tab = chosenTab?.forQuery === query ? chosenTab.tab : defaultTab;
  const showStores = !isDelivery && tab === "stores";
  const rows = showStores ? stores : items;

  return (
    <div className="border-t px-5" style={{ borderColor: border }}>
      {/* The two counts from the reference. Delivery has one kind of answer,
          so it doesn't get them. */}
      {!isDelivery ? (
        <div className="flex items-center gap-3 pb-1 pt-4">
          {([
            ["places", "Places", items.length],
            // "Shops" under Pickup, "Kitchens" under Catering — the tab counts
            // ours, and which of ours depends on the mode.
            ["stores", mode === "catering" ? "Kitchens" : "Shops", stores.length],
          ] as const).map(([id, label, count]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setChosenTab({ forQuery: query, tab: id })}
                style={{
                  backgroundColor: active ? olive : "transparent",
                  color: active ? onOlive : faint,
                }}
                className="cursor-pointer rounded-full px-5 py-2.5 text-[15px] font-medium leading-none transition-colors"
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {rangeNotice ? (
        <div className="py-3">
          <p className="m-0 text-[14px] font-medium" style={{ color: olive }}>
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
      ) : searching && rows.length === 0 ? (
        <p className="m-0 py-3 text-[13px]" style={{ color: faint }}>
          Searching…
        </p>
      ) : rows.length === 0 ? (
        <p className="m-0 py-3 text-[13px]" style={{ color: faint }}>
          {showStores ? "No shops match that." : "Nothing found."}
        </p>
      ) : (
        <ul className="m-0 max-h-[46vh] list-none overflow-y-auto p-0">
          {showStores
            ? stores.map((store) => (
                <li key={store.id}>
                  <button
                    type="button"
                    onClick={() => onPickStore(store)}
                    className="flex w-full cursor-pointer items-center gap-3 border-b py-3.5 text-left transition-colors last:border-b-0 hover:bg-[#EFEBDD]"
                    style={{ borderColor: controlBorder }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]" style={{ color: olive }}>
                        {store.name}
                      </span>
                      <span className="block truncate text-[13px]" style={{ color: muted }}>
                        {store.address}, {store.city}
                      </span>
                    </span>
                    <Chevron />
                  </button>
                </li>
              ))
            : items.map((suggestion) => (
                <li key={suggestion.placeId}>
                  <button
                    type="button"
                    onClick={() => choosePlace(suggestion)}
                    className="flex w-full cursor-pointer items-center gap-3 border-b py-3.5 text-left transition-colors last:border-b-0 hover:bg-[#EFEBDD]"
                    style={{ borderColor: controlBorder }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]" style={{ color: olive }}>
                        {suggestion.primary}
                      </span>
                      {suggestion.secondary ? (
                        <span
                          className="block truncate text-[13px]"
                          style={{ color: muted }}
                        >
                          {suggestion.secondary}
                        </span>
                      ) : null}
                    </span>
                    <Chevron />
                  </button>
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}
