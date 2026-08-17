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

// Everything taken off the map, regardless of theme.
//
// Google's default styling is a general-purpose map: it labels every state,
// every bay and sea, every business, and badges every interstate, because it
// doesn't know what you're looking for. We do. This map answers one question,
// "where is the counter", and anything that isn't part of that answer is in
// the way of it.
//
// At the opening zoom the difference is most of the screen: forty grey state
// and province initials scattered across North America, plus Hudson Bay, the
// Caribbean Sea and the Northwestern Passages, all gone. What's left is
// country names, the coastline, and our pin.
const QUIET: google.maps.MapTypeStyle[] = [
  // ——— The icons go; the names stay ———
  //
  // Google's coloured POI icons — the orange fork, the pink bed — are the
  // loudest thing on the stock basemap and the reason this map used to look
  // like somebody else's product. The *names* beside them are what tells
  // somebody which street they are looking at, and they are wanted.
  //
  // Said as one narrow rule rather than as a blanket `poi: off` with the names
  // turned back on afterwards. Both should express the same thing, because a
  // style array is applied in order and the last rule for a feature/element
  // pair wins. The difference is what happens if that is not quite true of
  // re-enabling a child of a feature that was switched off wholesale: the
  // blanket version silently renders nothing, on a map, in a browser, which is
  // the one place none of this can be tested. This version has nothing to
  // override and so has nothing to be wrong about.
  //
  // POI geometry needs no rule of its own: the palette below paints all
  // geometry the ground colour, so a park or a building footprint is already
  // the same shade as the block it sits on. The pin picker overrides that
  // deliberately — see doorwayDetail.
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },

  // Transit lines and their labels, by the same reasoning: the coloured rail
  // ribbons are somebody else's map. Station *names* are re-enabled by the pin
  // picker alone, where a Metro entrance is the best landmark on a block.
  { featureType: "transit.line", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", elementType: "labels", stylers: [{ visibility: "off" }] },

  // State and province initials, their borders, and county lines. Country
  // names stay: they orient you at the opening zoom without crowding it, and
  // they are all the reference map showed.
  { featureType: "administrative.province", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },

  // Water gets a colour, not a name. Nobody finds a bagel by way of the
  // Caribbean Sea.
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "labels", stylers: [{ visibility: "off" }] },

  // Road shields, the little numbered badges. The street name is worth having
  // at the zoom the shop's card opens at, so labels.text stays; the badge for
  // Interstate 10 is not, so labels.icon goes.
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

// The base every map in the app draws with: the quiet rules, then the palette.
// Kept separate from MAP_STYLE below only so the names can be appended after
// it — Google applies a style array in order and the last rule for a given
// feature/element pair wins, so QUIET's blanket `poi: off` has to come first
// or the names never appear.
const PALETTE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
  light: [
    ...QUIET,
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
    ...QUIET,
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
// ——— The names of places, on every map ———
//
// This used to be the pin picker's alone, on the reasoning that a hundred
// competing restaurant markers are not help on a map with one pin that
// matters. Half of that held up and half of it did not.
//
// The half that held: coloured icons really are clutter, and they are still
// off everywhere.
//
// The half that did not: a city block with no names on it is not calm, it is
// blank. Google draws POI labels from about zoom 13 up, so this changes
// nothing at the country view the finder opens on and everything at the zoom
// somebody actually reads — where the shops either side of ours are how a
// person recognises the street they are looking at.
//
// Costs no request. The names are already on the tile Google is drawing; the
// quiet style was hiding them. A Nearby Search would be a billed call on every
// pan to re-fetch labels that were there all along.
function businessNames(theme: MapTheme): google.maps.MapTypeStyle[] {
  // Quieter than the street names deliberately, on both maps. Streets place a
  // door and landmarks only confirm it, so they must not compete.
  //
  // Only a colour. Visibility is Google's default and QUIET no longer switches
  // it off, so there is nothing here to turn back on.
  return [
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: theme === "light" ? "#938c7b" : "#7e786e" }],
    },
  ];
}

/** The extra detail for placing a pin on a doorway, which the finder does not
 *  need: it is choosing between shops, not between sides of one building. */
function doorwayDetail(theme: MapTheme): google.maps.MapTypeStyle[] {
  const label = theme === "light" ? "#938c7b" : "#7e786e";
  const footprint = theme === "light" ? "#e9e4d3" : "#2b2a27";
  return [
    // Building footprints, which are how somebody says "mine is the one set
    // back from the road". Tinted a half-step off the ground rather than
    // outlined — at zoom 18 an outline per building is a screen of boxes.
    { featureType: "poi", elementType: "geometry", stylers: [{ color: footprint }, { visibility: "on" }] },
    {
      featureType: "landscape.man_made",
      elementType: "geometry",
      stylers: [{ color: footprint }, { visibility: "on" }],
    },

    // A Metro entrance is the best landmark on a city block: it is large,
    // signposted in the street, and everybody local knows it. Same treatment —
    // the name without the icon. This one does override QUIET, because station
    // labels are off by default there; it is a labels → labels.text step
    // rather than a whole-feature resurrection.
    { featureType: "transit.station", elementType: "labels.text", stylers: [{ visibility: "on" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: label }] },
    { featureType: "transit.station", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  ];
}

/** Every map in the app: the palette, and the names of the places on it.
 *
 *  One export rather than a per-screen choice, so a shop card, a coverage
 *  contour and a pin cannot end up looking like three products. */
export const MAP_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
  light: [...PALETTE.light, ...businessNames("light")],
  dark: [...PALETTE.dark, ...businessNames("dark")],
};

/** The basemap for placing a delivery pin: MAP_STYLE, plus the building
 *  footprints and station names that answer "which side of the block". */
export const PIN_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
  light: [...MAP_STYLE.light, ...doorwayDetail("light")],
  dark: [...MAP_STYLE.dark, ...doorwayDetail("dark")],
};
