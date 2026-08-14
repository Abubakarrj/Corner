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
  // Nothing you can't order from. A hundred competing restaurant markers is
  // not help on a map with one pin that matters.
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },

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

// And the palette, which is the only thing that differs between the two.
export const MAP_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
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
