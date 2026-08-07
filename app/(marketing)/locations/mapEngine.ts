"use client";

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
  // Replaces every marker. The callback fires when one is tapped, and carries
  // the id rather than opening anything: a pin *selects*, and the card along
  // the bottom is what shows the detail.
  //
  // There used to be a popup here, and it said the shop's name, address and
  // hours, three inches above a card saying the shop's name, address and
  // hours. Two boxes with the same words in them is not two pieces of
  // information, so the popup is gone and the card is the one place a shop is
  // described.
  setMarkers(locations: StoreLocation[], onSelect: (id: string) => void): void;
  // Marks one pin as the selected one, so the map shows which card you are on.
  setSelected(id: string | null): void;
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
  // BCP 47 tag for the basemap's own labels — street and city names, country
  // names. An engine that has no way to set it ignores this rather than
  // pretending: Protomaps ships one name field per feature and it is whatever
  // OpenStreetMap holds, which is usually the local one.
  language: string;
};

export type EngineFactory = (
  holder: HTMLElement,
  options: EngineOptions,
) => Promise<MapEngine | null>;

// ——— The pin ———

// An inline SVG teardrop anchored at its point. Olive for the shops and sage
// for catering kitchens, and a size that grows when it's the selected one, so
// which pin the card belongs to is visible on the map. One of the few places the brand green still does the
// work, because a pin is a mark on somebody else's map and it should read as
// ours, where a black pin would read as the map's own.
export const PIN_SIZE = { width: 26, height: 34 };
export const PIN_SIZE_SELECTED = { width: 34, height: 44 };

export function pinSvg(kind: StoreLocation["kind"], selected = false): string {
  // Custom properties don't resolve inside a data URI or a detached element,
  // so these are the literal token values rather than var() references.
  const fill = kind === "shop" ? "#3e4a30" : "#b7c9a2";
  const { width, height } = selected ? PIN_SIZE_SELECTED : PIN_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 26 34">
      <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13C1 20.5 13 33 13 33Z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.4" fill="white"/>
    </svg>`;
}

export function pinDataUri(kind: StoreLocation["kind"], selected = false): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg(kind, selected))}`;
}
