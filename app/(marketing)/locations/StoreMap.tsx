"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { INITIAL_BOUNDS, type StoreLocation } from "./locations";

const BRAND_RED = "#BE1923";

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
  const fill = kind === "shop" ? BRAND_RED : "#2D2D2D";
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
      <circle cx="12" cy="12" r="3.2" fill="#1B1D16" />
      <circle cx="12" cy="12" r="7" stroke="#1B1D16" strokeWidth="1.8" />
      <path
        d="M12 1.5v3.2M12 19.3v3.2M22.5 12h-3.2M4.7 12H1.5"
        stroke="#1B1D16"
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
}: {
  locations: StoreLocation[];
  // Delivery has no "search this area" — there is nothing to search until an
  // address is entered — so the button is the caller's decision, not ours.
  showSearchArea: boolean;
  onSearchArea: (bounds: L.LatLngBounds) => void;
}) {
  const mapRef = useRef<L.Map | null>(null);
  // Shown only once the visitor has actually moved the map, the way the
  // reference's does — offering to re-search an area nobody has changed is
  // noise.
  const [moved, setMoved] = useState(false);

  return (
    <div className="relative min-h-0 flex-1">
      <MapContainer
        bounds={INITIAL_BOUNDS}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        style={{ background: "#EAF0DC" }}
      >
        <TileLayer url={TILE_URL} />
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
              <span className="block text-[13px] font-bold text-[#1B1D16]">
                {location.name}
              </span>
              <span className="mt-0.5 block text-[12px] text-[#5A5C50]">
                {location.address}
                <br />
                {location.city}
              </span>
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
            className="pointer-events-auto absolute left-4 top-4 cursor-pointer rounded-full bg-[#FCFCF8] px-5 py-2.5 text-[14px] text-[#1B1D16] shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-90"
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
          className="pointer-events-auto absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#FCFCF8] shadow-[0_2px_8px_rgba(0,0,0,0.16)] transition-opacity hover:opacity-90"
        >
          <LocateIcon />
        </button>

        {/* Zoom pair, stacked and sharing one rounded shell with a divider
            between — as in the reference, where they read as one control. */}
        <div className="pointer-events-auto absolute right-4 top-[68px] flex w-11 flex-col overflow-hidden rounded-xl bg-[#FCFCF8] shadow-[0_2px_8px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-[#1B1D16] transition-colors hover:bg-black/5"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            className="flex h-11 cursor-pointer items-center justify-center border-t border-[#E2E2D8] text-[22px] leading-none text-[#1B1D16] transition-colors hover:bg-black/5"
          >
            −
          </button>
        </div>

        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-[#FCFCF8]/90 px-3 py-1 text-[11px] text-[#5A5C50]">
          {TILE_ATTRIBUTION}
        </span>
      </div>
    </div>
  );
}
