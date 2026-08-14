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
  // Where the visitor is, as a dot, with the platform's own accuracy radius
  // drawn around it. Null clears it.
  //
  // ——— Why the radius is drawn and not just the dot ———
  //
  // "Use my location" panned the camera and searched, and put nothing on the
  // map where the visitor was standing. That is why granting the permission
  // felt like nothing had happened: the map moved, some shops appeared, and
  // the one thing the button is named after was invisible.
  //
  // The circle is the second half of it, and it is the honest half. A phone
  // reporting eight metres and a phone reporting two kilometres are both
  // "your location", and the difference between them is the whole of what
  // Precise Location does. A dot alone claims a doorstep either way; a dot
  // inside a circle the size of the neighbourhood says exactly what the OS
  // told us, without anybody having to read a sentence about a settings
  // toggle.
  setYou(point: [number, number] | null, accuracyMeters?: number): void;
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

// An inline SVG teardrop anchored at its point, in the brand red, with the
// bagel in the head of it.
//
// Red rather than the olive it was. A pin is a mark on somebody else's map and
// its whole job is to be found on one — the olive sat a shade off the darker
// greens of Google's own parks and terrain, which is a bad place for the one
// thing on screen that has to be spotted. Red is unused anywhere in Google's
// basemap and it is the shop's own colour, so the pin reads as ours twice
// over: once by colour and once by shape.
//
// The mark itself is public/icon.svg, path for path, rather than a redrawn
// circle. The hole is a subpath of the same path, so the pin's red shows
// through it and the glyph reads as a bagel at 26px instead of a blob. Its
// natural box is 3652x3123, scaled here to 12.6 wide and centred in the head.
// 14 was the first try and crowded the white ring; the ring is what keeps the
// pin legible against a dark basemap, so it gets to stay a ring.
//
// The wheat is the mark's own colour, not white. It clears 3:1 against the red
// (about 4.2:1), which is the bar for a graphical object, and a white bagel
// would be a generic white glyph rather than this shop's.
export const PIN_SIZE = { width: 26, height: 34 };
export const PIN_SIZE_SELECTED = { width: 34, height: 44 };

const PIN_RED = "#be1923";
// A catering kitchen, when there is one. Every location is kind "shop" today
// (see the note at the top of locations.ts), so this is reserved rather than
// live — but it stays a red, because the point of the change was that nothing
// on this map is green any more.
const PIN_RED_DEEP = "#8e1219";
const BAGEL_WHEAT = "#efd6a6";

// One path, lifted verbatim from public/icon.svg. Copied rather than fetched:
// a data URI can't reference another file, and an <img> inside the pin would
// be a second network request per marker.
const BAGEL_PATH =
  "M3416.84 467.112C2922.84 -147.665 1809.85 -156.838 930.967 446.928C52.0818 " +
  "1050.69 -259.393 2038.01 234.608 2654.62C728.609 3271.23 1841.6 3278.57 " +
  "2720.49 2674.81C3599.37 2071.04 3910.85 1083.72 3416.84 467.112ZM1998.33 " +
  "1078.22C1817.79 1316.79 1486.47 1410.39 1486.47 1410.39C1486.47 1410.39 " +
  "990.487 1551.69 1286.09 1162.64C1286.09 1162.64 1532.1 815.791 1790.02 " +
  "815.791C1790.02 815.791 2178.86 839.652 1996.34 1078.22H1998.33Z";

export function pinSvg(kind: StoreLocation["kind"], selected = false): string {
  // Custom properties don't resolve inside a data URI or a detached element,
  // so these are the literal token values rather than var() references.
  const fill = kind === "shop" ? PIN_RED : PIN_RED_DEEP;
  const { width, height } = selected ? PIN_SIZE_SELECTED : PIN_SIZE;
  // 12.6/3652 to get the mark to 12.6 wide; the translate centres what that
  // leaves (12.6 x 10.77) on the head, whose arc is centred at 13,13 with a
  // radius of 12.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 26 34">
      <path d="M13 33C13 33 25 20.5 25 13A12 12 0 1 0 1 13C1 20.5 13 33 13 33Z"
            fill="${fill}" stroke="white" stroke-width="2"/>
      <g transform="translate(6.7 7.614) scale(0.00345)">
        <path d="${BAGEL_PATH}" fill="${BAGEL_WHEAT}"/>
      </g>
    </svg>`;
}

export function pinDataUri(kind: StoreLocation["kind"], selected = false): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg(kind, selected))}`;
}
