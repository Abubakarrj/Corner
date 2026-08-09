"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PALETTE } from "../../shop/shopControls";
import { mapsConfig } from "../../googleMapsPublic";
import { useResolvedTheme } from "../../theme";
import { INITIAL_BOUNDS, type MapBounds, type StoreLocation } from "./locations";
import LocationSheet from "./LocationSheet";
import { Button } from "../../ui/Button";
import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import type { EngineFactory, MapEngine } from "./mapEngine";

const { ink, muted, controlBorder } = PALETTE;

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

// Scrolls the card rail to one slide, in either reading direction.
//
// scrollLeft is not symmetric: left-to-right counts up from 0 at the left
// edge, right-to-left counts down from 0 at the right edge. Getting this wrong
// under Urdu doesn't throw, it just scrolls the rail hard against its start
// and leaves the wrong card under your thumb, which is the kind of bug that
// only shows up in the one language nobody tests in.
function scrollRailTo(rail: HTMLDivElement | null, index: number) {
  if (!rail) return;
  const rtl = getComputedStyle(rail).direction === "rtl";
  rail.scrollTo({ left: (rtl ? -1 : 1) * index * rail.clientWidth, behavior: "smooth" });
}

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

// Where the map should be looking, and which shop the answer is about.
//
// One object rather than three props because they are one intention: a search
// resolved, so point the camera there, get that close, and put that shop's
// card under the thumb. Sending them separately meant three effects racing to
// describe a single answer.
export type MapFocus = {
  at: [number, number];
  zoom?: number;
  // The shop the search found. Its card is scrolled to and its pin grows.
  openId?: string;
};

// The look of anything floating on the map: a fill, a 1px edge and a shadow,
// all per theme. The edge is the part that matters — see the note in
// globals.css. Written once because three controls that describe the same
// object separately are three controls that end up describing it differently.
const CHROME =
  "border border-map-chrome-edge bg-map-chrome shadow-[var(--cb-map-chrome-shadow)]";

export default function StoreMap({
  locations,
  showSearchArea,
  onSearchArea,
  onChoose,
  focus,
}: {
  // What the search turned up. The pin and its card are one thing and appear
  // together, so this is one list: empty until something has been asked, and
  // the finder opens on a map with nothing on it.
  locations: StoreLocation[];
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
  const t = useT();
  // The basemap's labels can't be changed on a live map, so a language switch
  // means loading the library again — see loadMaps() and unloadMaps().
  //
  // Read live rather than captured in a ref, which is what it used to be. The
  // ref was correct about the map instance and wrong about the component: this
  // is remounted on a language change (LocationFinder keys it on the locale),
  // so "captured at mount" and "current" are the same value on every render
  // that matters, and a ref only hid the fact that the fresh mount is what
  // makes the new language reach the library.
  const language = localeById(useLocale()).tag;
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
  // Which card's Order has been pressed, which is now only a re-entrancy
  // guard: the tap starts a 220ms beat before navigating, so the press is felt
  // rather than swallowed by the transition, and a second tap inside that beat
  // would choose twice.
  const [chosenId, setChosenId] = useState<string | null>(null);
  // The shop whose details sheet is up, or null.
  const [detailsFor, setDetailsFor] = useState<StoreLocation | null>(null);
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
        language,
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

  // Markers, redrawn whenever the visible set changes. Tapping one scrolls the
  // rail to its card rather than opening anything on the map: the card is
  // where a shop is described, and it is already on screen.
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setMarkers(locations, (id) => {
      const index = locations.findIndex((location) => location.id === id);
      if (index >= 0) {
        scrollRailTo(railRef.current, index);
        setCardIndex(index);
      }
    });
  }, [locations, ready]);

  // Which pin is the one the card belongs to. Runs after the markers effect
  // above, so the id it names belongs to a marker that exists.
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setSelected(locations[cardIndex]?.id ?? null);
  }, [cardIndex, locations, ready]);

  // Where to look.
  //
  // The rail is scrolled rather than the index set directly: its own scroll
  // handler is what owns cardIndex, so telling it where to go and letting it
  // report back keeps one thing in charge of which card is current. Setting
  // both would race, and the finger would lose.
  useEffect(() => {
    if (!ready || !focus) return;
    engineRef.current?.panTo(focus.at, focus.zoom ?? 12);
    if (!focus.openId) return;
    const index = locations.findIndex((location) => location.id === focus.openId);
    if (index >= 0) scrollRailTo(railRef.current, index);
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
      // abs, because under Urdu the document is right-to-left and a
      // right-to-left scroller starts at 0 on its right edge and counts
      // *down* into negatives going left. The index is the same either way;
      // only the sign of the offset differs.
      const index = Math.round(Math.abs(rail.scrollLeft) / width);
      const location = locations[index];
      if (!location) return;
      setCardIndex(index);
      engineRef.current?.panTo(location.position);
    }, 120);
  }, [locations]);

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
            className={`pointer-events-auto absolute start-4 top-4 cursor-pointer rounded-full px-5 py-2.5 text-[14px] text-ink transition-opacity hover:opacity-90 ${CHROME}`}
          >
            {t("finder.searchArea")}
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
          aria-label={t("finder.useMyLocation")}
          className={`pointer-events-auto absolute end-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-90 ${CHROME}`}
        >
          <LocateIcon />
        </button>

        {/* Zoom pair, stacked and sharing one rounded shell with a divider
            between: they read as one control. */}
        <div className={`pointer-events-auto absolute end-4 top-[68px] flex w-11 flex-col overflow-hidden rounded-xl ${CHROME}`}>
          <button
            type="button"
            onClick={() => {
              const engine = engineRef.current;
              engine?.setZoom(engine.getZoom() + 1);
            }}
            aria-label={t("finder.zoomIn")}
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-ink transition-colors hover:bg-raise"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const engine = engineRef.current;
              engine?.setZoom(engine.getZoom() - 1);
            }}
            aria-label={t("finder.zoomOut")}
            className="flex h-11 cursor-pointer items-center justify-center border-t border-map-chrome-edge text-[22px] leading-none text-ink transition-colors hover:bg-raise"
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
        {locations.length > 0 ? (
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
            {locations.map((location) => (
              <div key={location.id} className="w-full shrink-0 snap-center">
                {/* Capped and centred. The slide stays full-width so the
                    snap points still land one card at a time, but the card
                    itself stops at 2xl: across a 1440px desktop it was a shop
                    name at the far left and an Order button at the far right
                    with a metre of nothing between them. */}
                {/* One row, and it stays one row. The card is a label on a
                    map, not a page about a shop: it says which place this is
                    and offers the two things to do with it. Everything that
                    wanted more room than that is on the sheet behind the info
                    button, which is what stopped it growing. */}
                <div className="mx-auto flex max-w-2xl items-center gap-2.5 rounded-2xl bg-surface p-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
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
                  {/* Hours, directions, the phone. Everything that used to be
                      crammed onto the pin's popup, which said all of this a
                      second time three inches higher up the screen. */}
                  <button
                    type="button"
                    onClick={() => setDetailsFor(location)}
                    aria-label={t("finder.about", { name: location.name })}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:bg-raise"
                    style={{ borderColor: controlBorder }}
                  >
                    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
                      <circle cx="9" cy="9" r="7.4" stroke={muted} strokeWidth="1.4" />
                      <path d="M9 8.1v4.1" stroke={muted} strokeWidth="1.6" strokeLinecap="round" />
                      <circle cx="9" cy="5.6" r="0.95" fill={muted} />
                    </svg>
                  </button>
                  {/* The shared Button at `sm`, which is the outlined pill this
                      card always had: 36px, fills on press. Bespoke markup here
                      is how the app ended up with a dozen different buttons
                      once before. */}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => order(location)}
                    aria-label={t("finder.orderFrom", { name: location.name })}
                  >
                    {t("finder.order")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Which of them you're on. Only earns its place once there's more
            than one: a single dot says nothing. */}
        {locations.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[138px] flex justify-center gap-1.5">
            {locations.map((location, index) => (
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

      <LocationSheet
        location={detailsFor}
        onClose={() => setDetailsFor(null)}
        onOrder={(location) => {
          setDetailsFor(null);
          onChoose(location);
        }}
      />
    </div>
  );
}
