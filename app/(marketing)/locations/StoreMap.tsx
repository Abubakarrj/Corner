"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PALETTE } from "../../shop/shopControls";
import { loadMaps } from "../../googleMapsPublic";
import { useResolvedTheme } from "../../theme";
import { INITIAL_BOUNDS, type MapBounds, type StoreLocation } from "./locations";

const { ink, onInk, olive, muted } = PALETTE;

// A real slippy map: it pans, it zooms, and "Search area" means something
// because there are real bounds to read.
//
// Google Maps, on the one key that also does the geocoding, the routing and
// the address search. That single key is the whole reason this replaced Radar
// and MapLibre, and it is why there is no attribution pill any more: the Maps
// JavaScript API draws its own logo and terms link into the canvas, which is
// both required and already handled.
//
// Styling is the JS `styles` array rather than a cloud-hosted Map ID, so the
// only setup is enabling the APIs. That is a deliberate trade. Cloud styling
// and AdvancedMarkerElement both need a Map ID created in the console, and the
// point of this rewrite was one variable and no dashboard work. If you ever
// want the newer marker element, create a Map ID, pass it here, and move the
// palettes below into the console.
const MAP_STYLE: Record<"light" | "dark", google.maps.MapTypeStyle[]> = {
  // Warm and quiet. Points of interest are off on both: this map has one pin
  // that matters and a hundred restaurant markers competing with it is not
  // help, it is noise.
  light: [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { elementType: "geometry", stylers: [{ color: "#f2eee1" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#6b6553" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f7f4eb" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#faf8f1" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe0e8" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e7e6d4" }] },
  ],
  dark: [
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { elementType: "geometry", stylers: [{ color: "#232220" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8f8a80" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#171614" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#33312e" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3b3935" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#1e2a30" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#282725" }] },
  ],
};

// The pin: an inline SVG teardrop anchored at its point. Olive for the shops
// and sage for catering kitchens. One of the few places the brand green still
// does the work, because a pin is a mark on somebody else's map and it should
// read as ours, where a black pin would read as the map's own.
function pinIcon(kind: StoreLocation["kind"]): google.maps.Icon {
  // Custom properties don't resolve inside a data URI, so these are the
  // literal token values rather than var() references.
  const fill = kind === "shop" ? "#3e4a30" : "#b7c9a2";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
      <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13C1 20.5 13 33 13 33Z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.4" fill="white"/>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(26, 34),
    anchor: new google.maps.Point(13, 33),
  };
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
  // Delivery has no "search this area", there is nothing to search until an
  // address is entered, so the button is the caller's decision, not ours.
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
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
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
      const maps = await loadMaps();
      const holder = holderRef.current;
      if (cancelled || !maps || !holder || mapRef.current) return;

      const { Map } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;
      if (cancelled) return;

      const map = new Map(holder, {
        // The whole-country view the finder opens on: nothing preselected,
        // the lower 48 until the visitor searches or shares their position.
        center: { lat: 39, lng: -96 },
        zoom: 4,
        // Google's own chrome, all off. The finder draws its own zoom pair and
        // locate button so they match the app rather than the platform, and a
        // second set underneath them is clutter over a small screen.
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: "greedy",
        styles: MAP_STYLE[theme],
      });

      map.fitBounds({
        south: INITIAL_BOUNDS[0][0],
        west: INITIAL_BOUNDS[0][1],
        north: INITIAL_BOUNDS[1][0],
        east: INITIAL_BOUNDS[1][1],
      });

      map.addListener("dragend", () => setMoved(true));
      map.addListener("zoom_changed", () => setMoved(true));

      infoRef.current = new maps.InfoWindow({ disableAutoPan: false });
      mapRef.current = map;
      setReady(true);
    })().catch((error: unknown) => {
      console.error("[map] could not build the map", error);
    });

    return () => {
      cancelled = true;
    };
    // theme is applied by the effect below rather than by rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the app's light/dark switch. setOptions swaps the palette and
  // leaves the markers, which are overlays rather than part of the style.
  useEffect(() => {
    mapRef.current?.setOptions({ styles: MAP_STYLE[theme] });
  }, [theme]);

  // Markers, redrawn whenever the visible set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = locations.map((location) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: location.position[0], lng: location.position[1] },
        icon: pinIcon(location.kind),
        title: location.name,
      });
      marker.addListener("click", () => {
        const info = infoRef.current;
        if (!info) return;
        info.setContent(popupContent(location, () => chooseRef.current(location)));
        info.open({ map, anchor: marker });
      });
      return marker;
    });

    return () => {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [locations, ready]);

  // Recentres when a searched place resolves.
  useEffect(() => {
    if (!focus) return;
    const map = mapRef.current;
    if (!map) return;
    map.panTo({ lat: focus[0], lng: focus[1] });
    map.setZoom(12);
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
      mapRef.current?.panTo({ lat: location.position[0], lng: location.position[1] });
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
          if no key is configured. A white gap where a map should be reads as
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
              const bounds = mapRef.current?.getBounds();
              if (!bounds) return;
              const sw = bounds.getSouthWest();
              const ne = bounds.getNorthEast();
              onSearchArea({
                south: sw.lat(),
                west: sw.lng(),
                north: ne.lat(),
                east: ne.lng(),
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
                const map = mapRef.current;
                if (!map) return;
                map.panTo({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                });
                map.setZoom(13);
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
              const map = mapRef.current;
              map?.setZoom((map.getZoom() ?? 4) + 1);
            }}
            aria-label="Zoom in"
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-ink transition-colors hover:bg-black/5"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              map?.setZoom((map.getZoom() ?? 4) - 1);
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
        {locations.length > 0 ? (
          <div
            ref={railRef}
            onScroll={onRailScroll}
            className="pointer-events-auto absolute inset-x-0 bottom-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {locations.map((location) => (
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

// The pin's popup, as real DOM rather than an HTML string: the Order button
// inside it needs a listener, and a string would give us markup with no way to
// attach one short of querying the document for it after the fact.
function popupContent(location: StoreLocation, onOrder: () => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "cb-map-popup";

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
  button.style.backgroundColor = olive;
  button.textContent = "Order from here";
  button.addEventListener("click", onOrder);

  root.append(name, detail, button);
  return root;
}
