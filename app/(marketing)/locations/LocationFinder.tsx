"use client";

import type { LatLngBounds } from "leaflet";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { setFulfillment } from "../../fulfillment";
import {
  BackIcon,
  CloseIcon,
  IconButtonLink,
} from "../../ui/IconButton";
import CateringModal from "./CateringModal";
import SearchResults, { type ResolvedPlace } from "./SearchResults";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";
import { LOCATIONS, searchLocations, type StoreLocation } from "./locations";

// Dressed in the shop's produce palette rather than the reference's own
// greys: deep ink carries the active state, cream is the ground, and the
// rules are the same two border weights the catalog uses. The reference's
// geometry is untouched — only its colours and typeface change, so the
// finder and the pantry read as one product.
const { cream, ink, onInk, border, controlBorder, muted } = PALETTE;

// Leaflet touches window at import time, so the map can only ever be a
// client-side chunk — ssr:false is load-bearing, not a preference. The
// placeholder holds the map's space so the header and nav don't jump when it
// arrives.
const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1" style={{ background: "var(--cb-raise)" }} />,
});

type Mode = "pickup" | "delivery" | "catering";

const MODES: { id: Mode; label: string }[] = [
  { id: "pickup", label: "Pickup" },
  { id: "delivery", label: "Delivery" },
  { id: "catering", label: "Catering" },
];

// Delivery asks for the visitor's address; the other two search ours. That
// one difference drives the placeholder, the "Search area" button, and the
// empty-state toast.
const PLACEHOLDER: Record<Mode, string> = {
  pickup: "Search store, city, state, or zip",
  delivery: "Enter delivery address",
  catering: "Search store, city, state, or zip",
};

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
  // The shop whose catering sheet is up, or null. Catering doesn't open the
  // menu — see CateringModal.
  const [cateringFor, setCateringFor] = useState<StoreLocation | null>(null);

  // Pickup shows the shops you can walk up to, Catering shows the kitchens
  // that build trays, and Delivery shows nothing on the map until an address
  // is entered — it's asking where the visitor is, not where we are.
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
    const byKind = LOCATIONS.filter((location) =>
      mode === "catering" ? location.catering === true : location.kind === "shop",
    );
    return bounds
      ? byKind.filter((location) => bounds.contains(location.position))
      : byKind;
  }, [mode, bounds]);

  // `matching` is the Shops tab in the results: our own locations whose name
  // or address contains what's typed. That is a text search, and it's the
  // only place one belongs.
  const matching: StoreLocation[] = useMemo(() => {
    if (mode === "delivery") return [];
    return searchLocations(query, mode === "pickup" ? "shop" : "catering");
  }, [mode, query]);

  // Choosing a shop: record where the order is going, then open the menu.
  // The shop is inert until this has happened — see the gate in
  // app/shop/layout.tsx — because a bagel picked up in Koreatown and one
  // delivered to an apartment are different orders.
  //
  // This is the Order press — on the card or in the pin's popup. Naming a
  // shop in the search results is a lighter act; see pickFromSearch. Home and
  // Menu behave identically here; the only thing that differs between them is
  // which tab is lit, since they're the same screen reached two ways.
  function chooseLocation(location: StoreLocation) {
    // Catering is a conversation, not a basket. Ordering from a shop under
    // that mode opens the request sheet instead of committing a destination.
    if (mode === "catering") {
      setCateringFor(location);
      return;
    }
    setFulfillment({
      mode: "pickup",
      locationId: location.id,
      label: location.name,
      detail: `${location.address}, ${location.city}`,
    });
    router.push("/shop");
  }

  // Picking a shop out of the search results is not the same act as pressing
  // Order on its card. Under Pickup the two coincide — naming a shop is
  // choosing it — but catering has a step in between: you say which counter
  // you're asking, look at it, then decide. So a catering search result flies
  // the map to that shop and leaves its card under your thumb, and the sheet
  // waits for the Order press.
  function pickFromSearch(location: StoreLocation) {
    if (mode === "catering") {
      setFocus(location.position);
      // The results panel is keyed off the query; emptying it puts the map
      // and the shop's card back in view, which is the thing being pointed at.
      setQuery("");
      return;
    }
    chooseLocation(location);
  }

  // The delivery equivalent: a resolved, in-range address is a destination,
  // so it opens the menu the same way choosing a shop does.
  function chooseAddress(resolved: ResolvedPlace) {
    setFulfillment({ mode: "delivery", address: resolved.address });
    router.push("/shop");
  }

  function changeMode(next: Mode) {
    setMode(next);
    setCateringFor(null);
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
      : mode === "catering"
        ? "No catering here yet."
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
          <IconButtonLink href="/" label="Back">
            <BackIcon />
          </IconButtonLink>

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
                    backgroundColor: active ? ink : "transparent",
                    color: active ? onInk : ink,
                    borderColor: active ? ink : controlBorder,
                  }}
                  className="flex h-[34px] cursor-pointer items-center rounded-full border px-4 text-[15px] leading-none transition-colors duration-150 sm:px-5"
                >
                  {label}
                </button>
              );
            })}
          </div>

          <IconButtonLink href="/" label="Close">
            <CloseIcon />
          </IconButtonLink>
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
            className="w-full bg-transparent pb-[11px] text-[16px] leading-[19px] text-ink outline-none placeholder:text-faint"
            style={{ borderBottom: `1px solid ${controlBorder}` }}
          />
          {/* CLEAR, as in the reference — a long address is tedious to
              backspace out of on a phone. */}
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-5 top-[26px] cursor-pointer text-[13px] font-medium uppercase tracking-[0.08em] transition-opacity hover:opacity-60"
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
          onPickStore={pickFromSearch}
          onPickPlace={(place) => setFocus([place.lat, place.lng])}
          onResolvedAddress={chooseAddress}
        />
      </header>

      <StoreMap
        locations={visible}
        showSearchArea={mode !== "delivery"}
        onSearchArea={setBounds}
        onChoose={chooseLocation}
        focus={focus}
      />

      {/* The toast sits between the map and the nav rather than over the map,
          as in the reference — it pushes the map up instead of covering it. */}
      {showToast ? (
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4"
          style={{ backgroundColor: "var(--cb-raise)", borderColor: border }}
        >
          <p className="m-0 text-[14px] text-ink">{toastText}</p>
          <button
            type="button"
            onClick={() => setToastDismissed(true)}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--cb-faint)] transition-opacity hover:opacity-60"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="var(--cb-ink)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* The finder is the front door for Home, and the first step for Menu.
          Which one lit it is the only difference. */}
      <CateringModal location={cateringFor} onClose={() => setCateringFor(null)} />

      <TabBar active={activeTab} />
    </div>
  );
}
