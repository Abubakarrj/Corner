"use client";

import type { LatLngBounds } from "leaflet";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import TabBar from "../TabBar";
import { LOCATIONS, type StoreLocation } from "./locations";

const BRAND_RED = "#BE1923";

// Sampled off the reference frame rather than guessed: the chrome is a warm
// off-white, the resting pills a half-step darker, and the rule under the
// search field a desaturated grey-green.
const CHROME = "#F4F4EC";
const PILL_REST = "#E9E9E1";
const INK = "#1B1D16";
const HAIRLINE = "#B2B3A5";

// Leaflet touches window at import time, so the map can only ever be a
// client-side chunk — ssr:false is load-bearing, not a preference. The
// placeholder holds the map's space so the header and nav don't jump when it
// arrives.
const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1" style={{ background: "#EAF0DC" }} />,
});

type Mode = "pickup" | "delivery" | "outpost";

const MODES: { id: Mode; label: string }[] = [
  { id: "pickup", label: "Pickup" },
  { id: "delivery", label: "Delivery" },
  { id: "outpost", label: "Outpost" },
];

// Delivery asks for the visitor's address; the other two search ours. That
// one difference drives the placeholder, the "Search area" button, and the
// empty-state toast.
const PLACEHOLDER: Record<Mode, string> = {
  pickup: "Search store, city, state, or zip",
  delivery: "Enter delivery address",
  outpost: "Search store, city, state, or zip",
};

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M12.5 4L6.5 10l6 6"
        stroke={INK}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function LocationFinder() {
  const [mode, setMode] = useState<Mode>("pickup");
  const [query, setQuery] = useState("");
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  const [toastDismissed, setToastDismissed] = useState(false);

  // Pickup shows our own shops, Outpost shows the counters that carry our
  // sandwiches, and Delivery shows nothing on the map until an address is
  // entered — it's asking where the visitor is, not where we are.
  const visible: StoreLocation[] = useMemo(() => {
    if (mode === "delivery") return [];
    const kind = mode === "pickup" ? "shop" : "outpost";
    const byKind = LOCATIONS.filter((location) => location.kind === kind);
    const text = query.trim().toLowerCase();
    const matched = text
      ? byKind.filter((location) =>
          `${location.name} ${location.address} ${location.city}`
            .toLowerCase()
            .includes(text),
        )
      : byKind;
    // "Search area" narrows to what the map is currently showing. Cleared
    // whenever the mode or the query changes, since both mean a new search.
    return bounds
      ? matched.filter((location) => bounds.contains(location.position))
      : matched;
  }, [mode, query, bounds]);

  function changeMode(next: Mode) {
    setMode(next);
    setBounds(null);
    setToastDismissed(false);
  }

  const showToast =
    !toastDismissed && (mode === "delivery" ? query.trim() === "" : visible.length === 0);
  const toastText =
    mode === "delivery"
      ? "Enter an address above to get started."
      : mode === "outpost"
        ? "No outposts here yet."
        : "No shops here yet.";

  return (
    // dvh, and the map takes the leftover height — so the header stays put,
    // the nav stays put, and the map absorbs a mobile browser's toolbars
    // coming and going rather than the page growing a scrollbar.
    <div
      className="flex h-dvh w-full flex-col overflow-hidden"
      style={{ backgroundColor: CHROME, fontFamily: "var(--font-geist-sans), sans-serif" }}
    >
      {/* Spacings measured off the reference frame rather than eyeballed: at
          its 440px width the pill row is 34px tall sitting 21px down, the
          rule under the search field lands 116px into the header, and the
          header is 133px overall. */}
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-4 pt-[21px]">
          <Link
            href="/"
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ backgroundColor: PILL_REST }}
          >
            <BackIcon />
          </Link>

          {/* The three modes, centred between the two circular buttons. */}
          <div className="flex flex-1 items-center justify-center gap-2">
            {MODES.map(({ id, label }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeMode(id)}
                  aria-pressed={active}
                  style={{
                    backgroundColor: active ? BRAND_RED : PILL_REST,
                    color: active ? "#FFFFFF" : INK,
                  }}
                  className="flex h-[34px] cursor-pointer items-center rounded-full px-4 text-[15px] leading-none transition-colors duration-150 sm:px-5"
                >
                  {label}
                </button>
              );
            })}
          </div>

          <Link
            href="/"
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ backgroundColor: PILL_REST }}
          >
            <CloseIcon />
          </Link>
        </div>

        <div className="px-5 pb-[17px] pt-[26px]">
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            aria-label={PLACEHOLDER[mode]}
            placeholder={PLACEHOLDER[mode]}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setBounds(null);
            }}
            // 16px so iOS doesn't zoom the viewport on focus.
            className="w-full bg-transparent pb-[11px] text-[16px] leading-[19px] text-[#1B1D16] outline-none placeholder:text-[#44463E]"
            style={{ borderBottom: `1px solid ${HAIRLINE}` }}
          />
        </div>
      </header>

      <StoreMap
        locations={visible}
        showSearchArea={mode !== "delivery"}
        onSearchArea={setBounds}
      />

      {/* The toast sits between the map and the nav rather than over the map,
          as in the reference — it pushes the map up instead of covering it. */}
      {showToast ? (
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ backgroundColor: "#E8E8E0" }}
        >
          <p className="m-0 text-[14px] text-[#1B1D16]">{toastText}</p>
          <button
            type="button"
            onClick={() => setToastDismissed(true)}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#9A9C90] transition-opacity hover:opacity-60"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="#1B1D16" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* Home is this page — the finder is the front door, not a sub-page. */}
      <TabBar active="home" />
    </div>
  );
}
