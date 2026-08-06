"use client";

import { PALETTE } from "../../shop/shopControls";
import type { MapBounds, StoreLocation } from "./locations";

// The seam between the finder's chrome and whatever draws the basemap.
//
// There are two implementations, Google and Protomaps, and everything the
// visitor actually touches sits above this line: the search field, the zoom
// pair, the locate button, the card rail, the dots. That chrome is identical
// either way, so it lives once in StoreMap.tsx and talks to the map through
// these eight methods.
//
// The interface is imperative rather than a set of props because both
// libraries are imperative underneath. Wrapping a map in declarative
// re-renders means diffing camera positions against a thing that is mid-
// animation, and the honest shape of "pan there" is a method call.
//
// It is also what makes the two comparable. Swapping the basemap is one import
// and no change to anything on screen, so a difference you can see is a
// difference in the map and not in what got rebuilt around it.

export type MapTheme = "light" | "dark";

export type MapEngine = {
  setTheme(theme: MapTheme): void;
  // Replaces every marker. The callback is the popup's Order button.
  setMarkers(locations: StoreLocation[], onOrder: (location: StoreLocation) => void): void;
  // Opens the popup for one marker, as if it had been tapped. This is how a
  // search ends up showing the shop's own card over the shop.
  openPopup(id: string): void;
  panTo(point: [number, number], zoom?: number): void;
  getZoom(): number;
  setZoom(zoom: number): void;
  getBounds(): MapBounds | null;
  destroy(): void;
};

export type EngineOptions = {
  theme: MapTheme;
  // The framing the finder opens on, as plain numbers.
  initialBounds: MapBounds;
  // Fired when the visitor drags or zooms, which is what earns "Search area"
  // its place on screen.
  onMoved: () => void;
};

export type EngineFactory = (
  holder: HTMLElement,
  options: EngineOptions,
) => Promise<MapEngine | null>;

// ——— The pin, and the card it opens ———

const { ink, muted, olive } = PALETTE;

// An inline SVG teardrop anchored at its point. Olive for the shops and sage
// for catering kitchens. One of the few places the brand green still does the
// work, because a pin is a mark on somebody else's map and it should read as
// ours, where a black pin would read as the map's own.
export function pinSvg(kind: StoreLocation["kind"]): string {
  // Custom properties don't resolve inside a data URI or a detached element,
  // so these are the literal token values rather than var() references.
  const fill = kind === "shop" ? "#3e4a30" : "#b7c9a2";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
      <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13C1 20.5 13 33 13 33Z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.4" fill="white"/>
    </svg>`;
}

export function pinDataUri(kind: StoreLocation["kind"]): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg(kind))}`;
}

// The pin's popup, as real DOM rather than an HTML string: the Order button
// inside it needs a listener, and a string would give us markup with no way to
// attach one short of querying the document for it after the fact.
//
// Shared by both engines so the card reads identically whichever library is
// drawing the map underneath it.
export function popupContent(
  location: StoreLocation,
  onOrder: () => void,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "cb-map-popup";

  const name = document.createElement("span");
  name.className = "block text-[13px] font-medium";
  name.style.color = ink;
  name.textContent = location.name;

  const detail = document.createElement("span");
  detail.className = "mt-0.5 block text-[12px]";
  detail.style.color = muted;
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
