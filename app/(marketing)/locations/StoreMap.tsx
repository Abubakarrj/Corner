"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { PALETTE } from "../../shop/shopControls";
import { INITIAL_BOUNDS, type StoreLocation } from "./locations";

const { olive, onOlive, muted } = PALETTE;

// A real slippy map rather than a picture of one — it pans, it zooms, and
// "Search area" means something because there are real bounds to read.
//
// Tiles come straight from OpenStreetMap. That's free and keyless, which is
// what makes this work today, but OSM's tile policy is for light use, not a
// production storefront. The reference is Radar (which is OSM data on
// Radar's own tiles), so the production move is a Radar or Mapbox key and a
// one-line change to the TileLayer url below — the rest of this file doesn't
// care where tiles come from.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = "© OpenStreetMap";

// Leaflet's default marker is a PNG it resolves by relative URL, which
// bundlers break. A divIcon sidesteps that entirely and lets the pin carry
// the brand colour: an inline SVG teardrop, anchored at its point.
function pinIcon(kind: StoreLocation["kind"]) {
  // Olive for our own shops and sage for outposts — the same two greens the
  // pantry uses for primary and secondary, and both dark enough to read
  // against the map's pale land.
  const fill = kind === "shop" ? olive : "#7E9160";
  return L.divIcon({
    className: "",
    html: `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13C1 20.5 13 33 13 33Z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.4" fill="white"/>
    </svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 33],
    popupAnchor: [0, -30],
  });
}

// Recentres when a searched place resolves. Keyed off the coordinates rather
// than a callback so repeating the same search doesn't re-fly the map.
function FlyTo({ focus }: { focus: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo(focus, 12, { duration: 0.8 });
  }, [map, focus]);
  return null;
}

// Bridges the map instance out to the chrome around it, so the zoom buttons,
// the locate button, and "Search area" can drive a map they don't own.
function MapBridge({
  onReady,
  onMove,
}: {
  onReady: (map: L.Map) => void;
  onMove: () => void;
}) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    map.on("moveend", onMove);
    return () => {
      map.off("moveend", onMove);
    };
  }, [map, onReady, onMove]);
  return null;
}

function LocateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill={olive} />
      <circle cx="12" cy="12" r="7" stroke={olive} strokeWidth="1.8" />
      <path
        d="M12 1.5v3.2M12 19.3v3.2M22.5 12h-3.2M4.7 12H1.5"
        stroke={olive}
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
  onSearchArea: (bounds: L.LatLngBounds) => void;
  // Committing to a location is the whole point of this screen: the menu
  // can't price or route an order without knowing where it's going.
  onChoose: (location: StoreLocation) => void;
  // Where a searched city, state, or ZIP landed.
  focus: [number, number] | null;
}) {
  const mapRef = useRef<L.Map | null>(null);
  // Shown only once the visitor has actually moved the map, the way the
  // reference's does — offering to re-search an area nobody has changed is
  // noise.
  const [moved, setMoved] = useState(false);
  // Which card the rail is centred on, for the dots and for panning the map
  // to match. Derived from scroll position rather than driving it, so the
  // finger stays in charge.
  const [cardIndex, setCardIndex] = useState(0);
  // Which card's Order button has been pressed. The button is white at rest
  // and fills olive when it's chosen, and this holds that state long enough
  // to be seen: the tap navigates away, so without the beat the confirmation
  // would be a frame of colour nobody registers.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);

  function order(location: StoreLocation) {
    if (chosenId) return;
    setChosenId(location.id);
    window.setTimeout(() => onChoose(location), 220);
  }

  function onRailScroll() {
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
      // panTo, not flyTo: the card and the map should move together, and a
      // long animated flight on every swipe is seasick.
      mapRef.current?.panTo(location.position, { animate: true, duration: 0.35 });
    }, 120);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <MapContainer
        bounds={INITIAL_BOUNDS}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        style={{ background: "#E7EBD8" }}
      >
        <TileLayer url={TILE_URL} />
        <FlyTo focus={focus} />
        <MapBridge
          onReady={(map) => {
            mapRef.current = map;
          }}
          onMove={() => setMoved(true)}
        />
        {locations.map((location) => (
          <Marker
            key={location.id}
            position={location.position}
            icon={pinIcon(location.kind)}
          >
            <Popup>
              <span className="block text-[13px] font-medium text-[#3E4A30]">
                {location.name}
              </span>
              <span className="mt-0.5 block text-[12px] text-[#6F6A5C]">
                {location.address}
                <br />
                {location.city}
                <br />
                {location.hours}
              </span>
              {/* The commitment point. Everything else on this screen is
                  browsing; this is where the order gets a destination. */}
              <button
                type="button"
                onClick={() => onChoose(location)}
                style={{ backgroundColor: olive }}
                className="mt-2.5 w-full cursor-pointer rounded-full px-4 py-2 text-[12px] font-medium text-[#F3F1E5] transition-opacity hover:opacity-90"
              >
                Order from here
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Chrome over the map. pointer-events-none on the layer so panning
          still works everywhere the buttons aren't. */}
      <div className="pointer-events-none absolute inset-0 z-[500]">
        {showSearchArea && moved ? (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) onSearchArea(map.getBounds());
            }}
            className="pointer-events-auto absolute left-4 top-4 cursor-pointer rounded-full bg-[#FDFCF7] px-5 py-2.5 text-[14px] text-[#3E4A30] shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-90"
          >
            Search area
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            // Falls back silently: a denied or unavailable position just
            // leaves the map where it is, which is better than an error
            // dialog over a map that still works.
            map.locate({ setView: true, maxZoom: 13 });
          }}
          aria-label="Use my location"
          className="pointer-events-auto absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#FDFCF7] shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-90"
        >
          <LocateIcon />
        </button>

        {/* Zoom pair, stacked and sharing one rounded shell with a divider
            between — as in the reference, where they read as one control. */}
        <div className="pointer-events-auto absolute right-4 top-[68px] flex w-11 flex-col overflow-hidden rounded-xl bg-[#FDFCF7] shadow-[0_2px_8px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-[#3E4A30] transition-colors hover:bg-black/5"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="flex h-11 cursor-pointer items-center justify-center border-t border-[#DDD6C2] text-[22px] leading-none text-[#3E4A30] transition-colors hover:bg-black/5"
          >
            −
          </button>
        </div>

        <span
          className="pointer-events-none absolute left-3 rounded-full bg-[#FDFCF7]/90 px-3 py-1 text-[11px] text-[#6F6A5C]"
          style={{ bottom: locations.length > 0 ? 136 : 12 }}
        >
          {TILE_ATTRIBUTION}
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
              <div
                key={location.id}
                className="w-full shrink-0 snap-center"
              >
                <div className="flex items-center gap-3 rounded-2xl bg-[#FDFCF7] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
                  <button
                    type="button"
                    onClick={() => order(location)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <span
                      className="block truncate text-[17px] font-medium leading-tight"
                      style={{ color: olive }}
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
                  {/* White until it's the one chosen, then it fills olive.
                      Flat olive from the start gave no way to tell a press
                      had registered. */}
                  <button
                    type="button"
                    onClick={() => order(location)}
                    aria-label={`Order from ${location.name}`}
                    style={{
                      backgroundColor: chosenId === location.id ? olive : "#FFFFFF",
                      color: chosenId === location.id ? onOlive : olive,
                      borderColor: olive,
                    }}
                    className="shrink-0 cursor-pointer rounded-full border px-4 py-2.5 text-[13px] font-medium transition-colors duration-200 ease-out hover:bg-[#EFEBDD] motion-reduce:transition-none"
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
                  backgroundColor: index === cardIndex ? olive : "rgba(62,74,48,0.28)",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
