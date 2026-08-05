"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { PALETTE } from "../../shop/shopControls";
import { RADAR_PUBLISHABLE_KEY, radarStyleUrl } from "../../radarPublic";
import { useResolvedTheme } from "../../theme";
import { INITIAL_BOUNDS, type MapBounds, type StoreLocation } from "./locations";

const { ink, onInk, olive, muted } = PALETTE;

// A real slippy map — it pans, it zooms, and "Search area" means something
// because there are real bounds to read.
//
// Tiles are Radar's, drawn by MapLibre. They used to come straight from
// tile.openstreetmap.org, which is free and keyless and explicitly not for
// production traffic: OSM's tile policy is for development and light use, and
// a storefront pulling tiles from it is using a volunteer-funded service as a
// CDN. Radar serves the same OpenStreetMap data from its own infrastructure,
// as a vector style, which is also why the renderer changed — Leaflet draws
// raster tiles, MapLibre draws vector ones, and vector is what makes the
// labels stay sharp on a phone and lets the basemap follow the app's
// light/dark switch instead of being a bright rectangle in a dark UI.
//
// Attribution is rendered below rather than left to MapLibre's own control,
// which would land under the card rail.
//
// Both names are links, because attribution that can't be followed isn't
// really attribution — OSM's licence asks for a credit that leads somewhere,
// and Radar's "powered by" asks the same. They're the only tappable thing on
// the map chrome that isn't a control, so they open in a new tab: somebody
// halfway through choosing a shop shouldn't lose the screen to a licence page.
const ATTRIBUTION = [
  { label: "Radar", href: "https://radar.com/?ref=powered_by_radar" },
  { label: "OpenStreetMap", href: "https://www.openstreetmap.org/copyright" },
];

// Leaflet took [lat, lng]; MapLibre takes [lng, lat]. Every crossing goes
// through here, because getting it wrong puts Los Angeles in the South
// Atlantic and the mistake looks like a data problem rather than an axis one.
function lngLat([lat, lng]: [number, number]): [number, number] {
  return [lng, lat];
}

const INITIAL: maplibregl.LngLatBoundsLike = [
  lngLat(INITIAL_BOUNDS[0]),
  lngLat(INITIAL_BOUNDS[1]),
];

// A blank style, for a deployment that hasn't set the publishable key yet.
// The pins, the rail, the zoom and "Search area" all still work over it —
// what's missing is the picture of the streets. Better than a broken tile
// grid, and much better than quietly falling back to hammering OSM.
function blankStyle(background: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "bg", type: "background", paint: { "background-color": background } }],
  };
}

// The pin: an inline SVG teardrop anchored at its point. Olive for the shops
// and sage for catering kitchens — one of the few places the brand green
// still does the work, because a pin is a mark on somebody else's map and it
// should read as ours, where a black pin would read as the map's own.
function pinElement(kind: StoreLocation["kind"]): HTMLElement {
  const fill = kind === "shop" ? olive : "var(--cb-sage)";
  const element = document.createElement("div");
  element.style.cursor = "pointer";
  element.innerHTML = `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13C1 20.5 13 33 13 33Z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.4" fill="white"/>
    </svg>`;
  return element;
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

export default function StoreMap({
  locations,
  showSearchArea,
  onSearchArea,
  onChoose,
  focus,
}: {
  locations: StoreLocation[];
  // Delivery has no "search this area" — there is nothing to search until an
  // address is entered — so the button is the caller's decision, not ours.
  showSearchArea: boolean;
  onSearchArea: (bounds: MapBounds) => void;
  // Committing to a location is the whole point of this screen: the menu
  // can't price or route an order without knowing where it's going.
  onChoose: (location: StoreLocation) => void;
  // Where a searched city, state, or ZIP landed.
  focus: [number, number] | null;
}) {
  const theme = useResolvedTheme();
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  // Shown only once the visitor has actually moved the map — offering to
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
  // Marker click handlers are attached to DOM nodes once; re-creating the map
  // because a parent re-rendered would tear down the basemap mid-pan.
  const chooseRef = useRef(onChoose);
  useEffect(() => {
    chooseRef.current = onChoose;
  }, [onChoose]);

  const style = RADAR_PUBLISHABLE_KEY
    ? radarStyleUrl(theme)
    : blankStyle(theme === "dark" ? "#232220" : "#efeadc");

  // Create once.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || mapRef.current) return;

    const map = new maplibregl.Map({
      container: holder,
      style,
      bounds: INITIAL,
      attributionControl: false,
      // The rail and the chrome sit over the map; a compass and a scale bar
      // on top of them is clutter. Rotation off for the same reason — this is
      // a "which shop is near me" map, and a tilted one is a map somebody has
      // to fix before they can read it.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
    });
    map.touchZoomRotate.disableRotation();
    map.on("moveend", () => setMoved(true));
    map.on("load", () => setReady(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Deliberately empty: `style` is applied on change by the effect below,
    // not by rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the theme. setStyle swaps the basemap and leaves the markers,
  // which are DOM overlays rather than layers, exactly where they are.
  useEffect(() => {
    mapRef.current?.setStyle(style as maplibregl.StyleSpecification | string);
    // `style` is a fresh object each render when there's no key; compare by
    // theme instead so this fires once per switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Markers, redrawn whenever the visible set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = locations.map((location) => {
      const element = pinElement(location.kind);
      const popup = new maplibregl.Popup({
        offset: 30,
        closeButton: false,
        className: "cb-map-popup",
      }).setDOMContent(popupContent(location, () => chooseRef.current(location)));

      return new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat(lngLat(location.position))
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [locations, ready]);

  // Recentres when a searched place resolves.
  useEffect(() => {
    if (focus) mapRef.current?.flyTo({ center: lngLat(focus), zoom: 12, duration: 800 });
  }, [focus]);

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
      const location = locations[index];
      if (!location) return;
      setCardIndex(index);
      // easeTo, not flyTo: the card and the map should move together, and a
      // long animated flight on every swipe is seasick.
      mapRef.current?.easeTo({ center: lngLat(location.position), duration: 350 });
    }, 120);
  }, [locations]);

  function order(location: StoreLocation) {
    if (chosenId) return;
    setChosenId(location.id);
    window.setTimeout(() => {
      onChoose(location);
      // Under Pickup this tap navigates away and the reset never runs. Under
      // Catering it doesn't — the sheet opens over the map — so the button
      // has to come back to rest, or closing the sheet leaves a filled Order
      // that the guard above refuses to press a second time.
      window.setTimeout(() => setChosenId(null), 500);
    }, 220);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={holderRef} className="h-full w-full" />

      {/* Chrome over the map. pointer-events-none on the layer so panning
          still works everywhere the buttons aren't. */}
      <div className="pointer-events-none absolute inset-0 z-[500]">
        {showSearchArea && moved ? (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              const bounds = map.getBounds();
              onSearchArea({
                south: bounds.getSouth(),
                west: bounds.getWest(),
                north: bounds.getNorth(),
                east: bounds.getEast(),
              });
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
                mapRef.current?.flyTo({
                  center: [position.coords.longitude, position.coords.latitude],
                  zoom: 13,
                  duration: 900,
                });
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
            between — they read as one control. */}
        <div className="pointer-events-auto absolute right-4 top-[68px] flex w-11 flex-col overflow-hidden rounded-xl bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-ink transition-colors hover:bg-black/5"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="flex h-11 cursor-pointer items-center justify-center border-t border-line-soft text-[22px] leading-none text-ink transition-colors hover:bg-black/5"
          >
            −
          </button>
        </div>

        {/* pointer-events-auto on the pill, since the layer above it turns
            them off so the map can be panned everywhere the chrome isn't.
            The links need to be pressable; the gap between them doesn't. */}
        <span
          className="pointer-events-auto absolute left-3 flex items-center gap-1 rounded-full bg-surface/90 px-3 py-1 text-[11px] text-muted"
          style={{ bottom: locations.length > 0 ? 136 : 12 }}
        >
          {ATTRIBUTION.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              © {label}
            </a>
          ))}
        </span>

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
            className="pointer-events-auto absolute inset-x-0 bottom-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {locations.map((location) => (
              <div key={location.id} className="w-full shrink-0 snap-center">
                <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
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
            than one — a single dot says nothing. */}
        {locations.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[118px] flex justify-center gap-1.5">
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
    </div>
  );
}

// The pin's popup, as real DOM rather than an HTML string — the Order button
// inside it needs a listener, and setHTML would give us markup with no way to
// attach one short of querying the document for it after the fact.
function popupContent(location: StoreLocation, onOrder: () => void): HTMLElement {
  const root = document.createElement("div");

  const name = document.createElement("span");
  name.className = "block text-[13px] font-medium text-ink";
  name.textContent = location.name;

  const detail = document.createElement("span");
  detail.className = "mt-0.5 block text-[12px] text-muted";
  detail.append(location.address, document.createElement("br"));
  detail.append(location.city, document.createElement("br"));
  detail.append(location.hours);

  // The commitment point. Everything else on this screen is browsing; this is
  // where the order gets a destination.
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "cb-press mt-2.5 w-full cursor-pointer rounded-full px-4 py-2 text-[12px] font-medium text-on-ink hover:opacity-90";
  button.style.backgroundColor = ink;
  button.textContent = "Order from here";
  button.addEventListener("click", onOrder);

  root.append(name, detail, button);
  return root;
}
