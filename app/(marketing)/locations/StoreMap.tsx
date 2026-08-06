"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PALETTE } from "../../shop/shopControls";
import { mapsConfig } from "../../googleMapsPublic";
import { useResolvedTheme } from "../../theme";
import { INITIAL_BOUNDS, type MapBounds, type StoreLocation } from "./locations";
import type { EngineFactory, MapEngine } from "./mapEngine";

const { ink, onInk, muted } = PALETTE;

// A real slippy map: it pans, it zooms, and "Search area" means something
// because there are real bounds to read.
//
// Everything on this screen lives here, and the basemap underneath it does
// not. Two engines implement the seam in mapEngine.ts, Google and Protomaps,
// and this file neither knows nor cares which one answered. That is what makes
// them comparable: swap the engine and the only thing that changes is the map.
//
// Which one runs comes from MAP_PROVIDER, overridable per visit with
// ?map=google or ?map=protomaps on /locations. They differ in what they oblige
// you to show. Google draws its own logo and Terms along the base of the
// canvas and forbids modifying or obscuring any of it. Protomaps needs a
// single pill reading "Protomaps © OpenStreetMap", because that is all
// OpenStreetMap's licence asks for.

function LocateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill={ink} />
      <circle cx="12" cy="12" r="7" stroke={ink} strokeWidth="1.8" />
      <path
        d="M12 1.5v3.2M12 19.3v3.2M22.5 12h-3.2M4.7 12H1.5"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Where the map should be looking, and what should be open on it.
//
// One object rather than three props because they are one intention: a search
// resolved, so point the camera there, get that close, and open that shop's
// card. Sending them separately meant three effects racing to describe a
// single answer.
export type MapFocus = {
  at: [number, number];
  zoom?: number;
  // The location whose popup should open, if any. This is how a pickup search
  // ends up showing the shop's own card, address and all, over the shop.
  openId?: string;
};

export default function StoreMap({
  locations,
  cards,
  showSearchArea,
  onSearchArea,
  onChoose,
  focus,
}: {
  // Pins on the map: where we are. Present from the first frame, because a map
  // of the country with nothing marked on it says we don't exist.
  locations: StoreLocation[];
  // The rail along the bottom: the answer to a search. Empty until one has
  // been made, since a card offering to order from a shop is a result and not
  // a greeting.
  cards: StoreLocation[];
  // Delivery has no "search this area", there is nothing to search until an
  // address is entered, so the button is the caller's decision, not ours.
  showSearchArea: boolean;
  onSearchArea: (bounds: MapBounds) => void;
  // Committing to a location is the whole point of this screen: the menu
  // can't price or route an order without knowing where it's going.
  onChoose: (location: StoreLocation) => void;
  focus: MapFocus | null;
}) {
  const theme = useResolvedTheme();
  const holderRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(false);
  // Shown only once the visitor has actually moved the map. Offering to
  // re-search an area nobody has changed is noise.
  const [moved, setMoved] = useState(false);
  // Which card the rail is centred on, for the dots and for panning the map
  // to match. Derived from scroll position rather than driving it, so the
  // finger stays in charge.
  const [cardIndex, setCardIndex] = useState(0);
  // Which card's Order button has been pressed. The button is white at rest
  // and fills ink when it's chosen, and this holds that state long enough to
  // be seen: the tap navigates away, so without the beat the confirmation
  // would be a frame of colour nobody registers.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);

  // The latest onChoose, without it being a dependency of the map's lifecycle.
  // Marker listeners are attached once; re-creating the map because a parent
  // re-rendered would tear down the basemap mid-pan.
  const chooseRef = useRef(onChoose);
  useEffect(() => {
    chooseRef.current = onChoose;
  }, [onChoose]);

  // Create once.
  useEffect(() => {
    let cancelled = false;

    // Caught and logged rather than left to float. An unhandled rejection here
    // is invisible: the effect stops, no map is built, and what's on screen is
    // the tinted holder, which looks exactly like a map that hasn't loaded
    // yet. A blank panel should always be able to say why it's blank.
    void (async () => {
      const config = await mapsConfig();
      if (cancelled) return;

      // The query parameter wins over the deployment's default, so both maps
      // can be looked at on one deployment without a redeploy between them.
      const asked = new URLSearchParams(window.location.search).get("map");
      const provider =
        asked === "google" || asked === "protomaps" ? asked : config.provider;

      // Imported here rather than at the top of the file so only the engine in
      // use is downloaded. MapLibre and the Protomaps style are a few hundred
      // kilobytes, and a visitor on the Google path should never pay for them.
      const create: EngineFactory =
        provider === "protomaps"
          ? (await import("./engineProtomaps")).createProtomapsEngine
          : (await import("./engineGoogle")).createGoogleEngine;

      const holder = holderRef.current;
      if (cancelled || !holder || engineRef.current) return;

      const engine = await create(holder, {
        theme,
        initialBounds: {
          south: INITIAL_BOUNDS[0][0],
          west: INITIAL_BOUNDS[0][1],
          north: INITIAL_BOUNDS[1][0],
          east: INITIAL_BOUNDS[1][1],
        },
        onMoved: () => setMoved(true),
      });
      if (cancelled || !engine) {
        engine?.destroy();
        return;
      }

      engineRef.current = engine;
      setReady(true);
    })().catch((error: unknown) => {
      console.error("[map] could not build the map", error);
    });

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // theme is applied by the effect below rather than by rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the app's light/dark switch.
  useEffect(() => {
    if (ready) engineRef.current?.setTheme(theme);
  }, [theme, ready]);

  // Markers, redrawn whenever the visible set changes.
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setMarkers(locations, (location) => chooseRef.current(location));
  }, [locations, ready]);

  // Where to look, and what to open. Runs after the markers effect above, so
  // the popup it asks for belongs to a marker that exists.
  useEffect(() => {
    if (!ready || !focus) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.panTo(focus.at, focus.zoom ?? 12);
    if (focus.openId) engine.openPopup(focus.openId);
  }, [focus, ready, locations]);

  const onRailScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    // Debounced to the end of the gesture: panning the map on every scroll
    // frame fights the swipe and burns tile requests.
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const width = rail.clientWidth;
      if (width === 0) return;
      const index = Math.round(rail.scrollLeft / width);
      const location = cards[index];
      if (!location) return;
      setCardIndex(index);
      engineRef.current?.panTo(location.position);
    }, 120);
  }, [cards]);

  function order(location: StoreLocation) {
    if (chosenId) return;
    setChosenId(location.id);
    window.setTimeout(() => {
      onChoose(location);
      // Under Pickup this tap navigates away and the reset never runs. Under
      // Catering it doesn't, the sheet opens over the map, so the button has
      // to come back to rest or closing the sheet leaves a filled Order that
      // the guard above refuses to press a second time.
      window.setTimeout(() => setChosenId(null), 500);
    }, 220);
  }

  return (
    <div className="relative min-h-0 flex-1">
      {/* The tinted ground shows through until the basemap paints, and stays
          if nothing is configured. A white gap where a map should be reads as
          broken; a filled panel with the pins and controls still on it reads
          as a map that hasn't loaded, which is the truth. */}
      <div
        ref={holderRef}
        className="h-full w-full"
        style={{ background: "var(--cb-raise)" }}
      />

      {/* Chrome over the map. pointer-events-none on the layer so panning
          still works everywhere the buttons aren't. */}
      <div className="pointer-events-none absolute inset-0 z-[500]">
        {showSearchArea && moved ? (
          <button
            type="button"
            onClick={() => {
              const bounds = engineRef.current?.getBounds();
              if (bounds) onSearchArea(bounds);
            }}
            className="pointer-events-auto absolute left-4 top-4 cursor-pointer rounded-full bg-surface px-5 py-2.5 text-[14px] text-ink shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-90"
          >
            Search area
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            // Falls back silently: a denied or unavailable position just
            // leaves the map where it is, which is better than an error
            // dialog over a map that still works.
            navigator.geolocation?.getCurrentPosition(
              (position) => {
                engineRef.current?.panTo(
                  [position.coords.latitude, position.coords.longitude],
                  13,
                );
              },
              () => {},
              { enableHighAccuracy: false, timeout: 8000 },
            );
          }}
          aria-label="Use my location"
          className="pointer-events-auto absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-90"
        >
          <LocateIcon />
        </button>

        {/* Zoom pair, stacked and sharing one rounded shell with a divider
            between: they read as one control. */}
        <div className="pointer-events-auto absolute right-4 top-[68px] flex w-11 flex-col overflow-hidden rounded-xl bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={() => {
              const engine = engineRef.current;
              engine?.setZoom(engine.getZoom() + 1);
            }}
            aria-label="Zoom in"
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-ink transition-colors hover:bg-black/5"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const engine = engineRef.current;
              engine?.setZoom(engine.getZoom() - 1);
            }}
            aria-label="Zoom out"
            className="flex h-11 cursor-pointer items-center justify-center border-t border-line-soft text-[22px] leading-none text-ink transition-colors hover:bg-black/5"
          >
            −
          </button>
        </div>

        {/* The store cards, as a rail you swipe rather than one card with a
            button to advance it. Five shops in a ZIP is five swipes, which is
            how every map app behaves and what the thumb expects.

            Native scroll with snap points, not a JS carousel: it inherits
            momentum, rubber-banding, trackpads, keyboard arrows and
            screen-reader focus scrolling for free, and none of those are
            worth reimplementing. */}
        {cards.length > 0 ? (
          <div
            ref={railRef}
            onScroll={onRailScroll}
            // bottom-8, not bottom-3. Both maps draw their attribution along
            // the base of the canvas, and Google's terms are explicit that a
            // customer "will not modify, obscure, or delete" theirs. At 12px
            // the card sat across the logo, which is obscuring it. 32px clears
            // the strip with room to spare. It reads better too, so there is
            // nothing being traded off here.
            className="pointer-events-auto absolute inset-x-0 bottom-8 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cards.map((location) => (
              <div key={location.id} className="w-full shrink-0 snap-center">
                {/* Capped and centred. The slide stays full-width so the
                    snap points still land one card at a time, but the card
                    itself stops at 2xl: across a 1440px desktop it was a shop
                    name at the far left and an Order button at the far right
                    with a metre of nothing between them. */}
                <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl bg-surface p-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
                  <button
                    type="button"
                    onClick={() => order(location)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span
                      className="block truncate text-[17px] font-medium leading-tight"
                      style={{ color: ink }}
                    >
                      {location.name}
                    </span>
                    <span className="mt-1 block truncate text-[14px]" style={{ color: muted }}>
                      {location.address}
                    </span>
                    <span className="block truncate text-[14px]" style={{ color: muted }}>
                      {location.city}
                    </span>
                  </button>
                  {/* White until it's the one chosen, then it fills ink.
                      Flat ink from the start gave no way to tell a press
                      had registered. */}
                  <button
                    type="button"
                    onClick={() => order(location)}
                    aria-label={`Order from ${location.name}`}
                    style={{
                      backgroundColor: chosenId === location.id ? ink : "var(--cb-surface)",
                      color: chosenId === location.id ? onInk : ink,
                      borderColor: ink,
                    }}
                    className="cb-press shrink-0 cursor-pointer rounded-full border px-4 py-2.5 text-[13px] font-medium hover:bg-raise"
                  >
                    Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Which of them you're on. Only earns its place once there's more
            than one: a single dot says nothing. */}
        {cards.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[138px] flex justify-center gap-1.5">
            {cards.map((location, index) => (
              <span
                key={location.id}
                className="block h-1.5 w-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: index === cardIndex ? ink : "rgba(62,74,48,0.28)",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
