"use client";

import type { LatLngBounds } from "leaflet";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { setFulfillment } from "../../fulfillment";
import SearchResults, { type ResolvedPlace } from "./SearchResults";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";
import { LOCATIONS, searchLocations, type StoreLocation } from "./locations";

// Dressed in the shop's produce palette rather than the reference's own
// greys: deep olive carries the active state, cream is the ground, and the
// rules are the same two border weights the catalog uses. The reference's
// geometry is untouched — only its colours and typeface change, so the
// finder and the pantry read as one product.
const { cream, olive, onOlive, border, controlBorder, muted } = PALETTE;

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
        stroke={olive}
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
      <path d="M5 5l10 10M15 5L5 15" stroke={olive} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function LocationFinder() {
  const router = useRouter();
  // Home and Menu both open this screen; ?for=menu is how it knows which of
  // them to light in the tab bar. Anything else — a direct visit, the Home
  // tab — reads as Home.
  const activeTab = useSearchParams().get("for") === "menu" ? "menu" : "home";
  const [mode, setMode] = useState<Mode>("pickup");
  const [query, setQuery] = useState("");
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  // Where a searched city, state, or ZIP landed, for the map to fly to.
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [toastDismissed, setToastDismissed] = useState(false);

  // Pickup shows our own shops, Outpost shows the counters that carry our
  // sandwiches, and Delivery shows nothing on the map until an address is
  // entered — it's asking where the visitor is, not where we are.
  // Two different filters, which used to be one and shouldn't have been.
  //
  // `visible` is what the map shows: every location of this mode's kind,
  // narrowed only by "Search area". It deliberately ignores the query, because
  // the query is a place name — picking "Los Angeles, CA, USA" from the
  // results would otherwise substring-match against a shop whose address
  // reads "CA 90005", find nothing, and empty the map at the exact moment
  // the visitor asked to look there.
  const visible: StoreLocation[] = useMemo(() => {
    if (mode === "delivery") return [];
    const kind = mode === "pickup" ? "shop" : "outpost";
    const byKind = LOCATIONS.filter((location) => location.kind === kind);
    return bounds
      ? byKind.filter((location) => bounds.contains(location.position))
      : byKind;
  }, [mode, bounds]);

  // `matching` is the Shops tab in the results: our own locations whose name
  // or address contains what's typed. That is a text search, and it's the
  // only place one belongs.
  const matching: StoreLocation[] = useMemo(() => {
    if (mode === "delivery") return [];
    return searchLocations(query, mode === "pickup" ? "shop" : "outpost");
  }, [mode, query]);

  // Committing to a place: record where the order is going, then open the
  // menu. The shop is inert until this has happened — see the gate in
  // app/shop/layout.tsx — because a bagel picked up in Koreatown and one
  // delivered to an apartment are different orders.
  //
  // This is what the card's Order button and the pin's popup do, from either
  // entry point. Pressing something that says "Order" should order.
  function commitLocation(location: StoreLocation) {
    setFulfillment({
      mode: location.kind === "outpost" ? "outpost" : "pickup",
      locationId: location.id,
      label: location.name,
      detail: `${location.address}, ${location.city}`,
    });
    router.push("/shop");
  }

  // Picking a shop out of the search results, which means different things
  // depending on what opened this screen.
  //
  // From Menu you are already ordering — the map is only in the way, so
  // finding the shop by name or ZIP carries you straight through to it. From
  // Home you are looking, not buying: the same tap centres the map on the
  // shop and leaves you there, with the card's Order button as the separate,
  // deliberate step. Same screen, same search, different intent behind it.
  function pickLocation(location: StoreLocation) {
    if (activeTab === "menu") {
      commitLocation(location);
      return;
    }
    setFocus(location.position);
    setQuery("");
  }

  // Only ever called with an address Google resolved and the server confirmed
  // is inside the delivery radius — see SearchResults and /api/places. There
  // is deliberately no path from raw typed text to a delivery order any more.
  // Delivery commits from either entry point, unlike picking a shop. An
  // address isn't somewhere to browse — the map shows no pins in this mode,
  // so there is nothing to stay and look at, and "deliver to here" is already
  // the whole instruction.
  function chooseAddress(resolved: ResolvedPlace) {
    setFulfillment({ mode: "delivery", address: resolved.address });
    router.push("/shop");
  }

  function changeMode(next: Mode) {
    setMode(next);
    setBounds(null);
    setFocus(null);
    setQuery("");
    setToastDismissed(false);
  }

  // Delivery's prompt stands until an address is picked from the results —
  // the picker itself is what commits, so there's no Continue button to press
  // against text nobody has verified.
  const showToast =
    !toastDismissed &&
    (mode === "delivery" ? query.trim().length === 0 : visible.length === 0);
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
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
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
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[#EFEBDD]"
            style={{ borderColor: controlBorder }}
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
                    backgroundColor: active ? olive : "transparent",
                    color: active ? onOlive : olive,
                    borderColor: active ? olive : controlBorder,
                  }}
                  className="flex h-[34px] cursor-pointer items-center rounded-full border px-4 text-[15px] leading-none transition-colors duration-150 sm:px-5"
                >
                  {label}
                </button>
              );
            })}
          </div>

          <Link
            href="/"
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-[#EFEBDD]"
            style={{ borderColor: controlBorder }}
          >
            <CloseIcon />
          </Link>
        </div>

        <div className="relative px-5 pb-[17px] pt-[26px]">
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
            className="w-full bg-transparent pb-[11px] text-[16px] leading-[19px] text-[#3E4A30] outline-none placeholder:text-[#8A8672]"
            style={{ borderBottom: `1px solid ${controlBorder}` }}
          />
          {/* CLEAR, as in the reference — a long address is tedious to
              backspace out of on a phone. */}
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-5 top-[26px] cursor-pointer text-[13px] font-bold uppercase tracking-[0.08em] transition-opacity hover:opacity-60"
              style={{ color: muted }}
            >
              Clear
            </button>
          ) : null}
        </div>

        <SearchResults
          mode={mode}
          value={query}
          stores={matching}
          onValueChange={setQuery}
          onPickStore={pickLocation}
          onPickPlace={(place) => setFocus([place.lat, place.lng])}
          onResolvedAddress={chooseAddress}
        />
      </header>

      <StoreMap
        locations={visible}
        showSearchArea={mode !== "delivery"}
        onSearchArea={setBounds}
        onChoose={commitLocation}
        focus={focus}
      />

      {/* The toast sits between the map and the nav rather than over the map,
          as in the reference — it pushes the map up instead of covering it. */}
      {showToast ? (
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4"
          style={{ backgroundColor: "#EFEBDD", borderColor: border }}
        >
          <p className="m-0 text-[14px] text-[#3E4A30]">{toastText}</p>
          <button
            type="button"
            onClick={() => setToastDismissed(true)}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#B9B29C] transition-opacity hover:opacity-60"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="#3E4A30" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* The finder is the front door for Home, and the first step for Menu.
          Which one lit it is the only difference. */}
      <TabBar active={activeTab} />
    </div>
  );
}
