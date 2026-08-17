"use client";

import type { MapTheme } from "./mapEngine";

// How every Google basemap in this app looks.
//
// Its own module because two screens draw one: the store finder and the
// delivery pin picker. They were built weeks apart and the second one shipped
// with no styles at all, so it came out as Google's stock blue-and-grey with
// hotel ratings and restaurant pins on it, next to a cream-and-olive app. Two
// maps in one product that do not look like the same product is the kind of
// difference nobody can name and everybody notices.
//
// So the style lives here and both import it. A screen that wants a map does
// not get to have an opinion about what a map looks like.

// ——— Nothing is taken off the map ———
//
// This file used to hold a list of everything hidden: POI icons, transit lines
// and station names, state and county lines, neighbourhood labels, the names
// of every bay and sea, and the numbered badge on an interstate. The reasoning
// was that the map answers one question, "where is the counter", and anything
// else is in the way of it.
//
// That was wrong about how people read a map. A person does not locate a shop
// by looking only at the shop — they locate it against the neighbourhood they
// know, the station they get off at, the restaurant on the corner they have
// walked past. Stripping those left a map that was calm and hard to place, and
// the symptom was somebody looking at their own block and not recognising it.
//
// So a roadmap is a roadmap: roads, neighbourhood labels, businesses, transit,
// water names, everything Google draws on the map anyone already knows how to
// read. What stays ours is the palette below — the colour of it, not the
// content of it.
//
// If a particular feature ever earns hiding again, this is the place, and the
// bar is a specific thing somebody could not do because of it.

// The app's colours over Google's own map.
const PALETTE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
  light: [
    { elementType: "geometry", stylers: [{ color: "#f2eee1" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#6b6553" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f7f4eb" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#faf8f1" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe0e8" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e7e6d4" }] },
    // The country outline, kept faint. Off entirely and the coast is the only
    // edge on the map; at Google's default weight it reads as a road.
    {
      featureType: "administrative.country",
      elementType: "geometry.stroke",
      stylers: [{ color: "#d8d2be" }],
    },
  ],
  dark: [
    { elementType: "geometry", stylers: [{ color: "#232220" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8f8a80" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#171614" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#33312e" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3b3935" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#1e2a30" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#282725" }] },
    {
      featureType: "administrative.country",
      elementType: "geometry.stroke",
      stylers: [{ color: "#3a3833" }],
    },
  ],
};

// ——— The pin picker's variant: the same map, with the landmarks back ———
//
// The finder answers "where is the counter", and a hundred competing
// restaurant names are in the way of that. The picker answers a different
// question — "which of these buildings is yours" — and for that the tofu house
// on the corner and the Metro stop across the road are not clutter, they are
// the answer. Adopting the finder's style wholesale took them away, and the
// street names it keeps are not enough on their own: a tower block has one
// address on the map and four sides in real life.
//
// ——— No Places call ———
//
// Worth saying because it looks like a job for it: this needs nothing from the
// Places API. The names are already on the tile Google is drawing — the quiet
// style was hiding them — so switching them back on costs one array entry and
// no request, where a Nearby Search would be a billed call on every settle to
// re-fetch labels that were there all along.
//
// Google applies a style array in order and the last rule for a given
// feature/element pair wins, so appending is what overrides QUIET's blanket
// `poi: off` above. The base has to come first.
/** The one thing the pin picker wants that the finder does not: a building you
 *  can see the shape of.
 *
 *  The palette paints all geometry the ground colour, which is what stops a
 *  Google map looking like Google's. At the zoom somebody places a pin at,
 *  that flattening costs them the thing they are actually using — "mine is the
 *  one set back from the road" — so the picker paints buildings back in, a
 *  half-step off the ground rather than outlined. At zoom 18 an outline per
 *  building is a screen of boxes. */
function doorwayDetail(theme: MapTheme): google.maps.MapTypeStyle[] {
  const footprint = theme === "light" ? "#e9e4d3" : "#2b2a27";
  return [
    { featureType: "poi", elementType: "geometry", stylers: [{ color: footprint }] },
    { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: footprint }] },
  ];
}

/** Every map in the app: Google's roadmap, in the app's colours.
 *
 *  One export rather than a per-screen choice, so a shop card, a coverage
 *  contour and a pin cannot end up looking like three products. */
export const MAP_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = PALETTE;

/** The basemap for placing a delivery pin: MAP_STYLE, plus the building
 *  footprints and station names that answer "which side of the block". */
export const PIN_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
  light: [...MAP_STYLE.light, ...doorwayDetail("light")],
  dark: [...MAP_STYLE.dark, ...doorwayDetail("dark")],
};
