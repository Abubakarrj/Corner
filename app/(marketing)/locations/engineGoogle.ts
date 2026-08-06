"use client";

import { loadMaps } from "../../googleMapsPublic";
import type { StoreLocation } from "./locations";
import {
  pinDataUri,
  popupContent,
  type EngineFactory,
  type MapEngine,
  type MapTheme,
} from "./mapEngine";

// The Google half of the basemap.
//
// Styled with the JS `styles` array rather than a cloud-hosted Map ID, so the
// only setup is enabling the APIs. That is a deliberate trade: cloud styling
// and AdvancedMarkerElement both need a Map ID created in the console, and the
// point of this path is one variable and no dashboard work.
//
// What cannot be changed here is the strip along the base of the canvas:
// Google's logo on the left, "Map data ©" and Terms on the right. The Maps
// Platform terms say a customer "will display all attribution that Google
// provides through the Services (including branding, logos, and copyright and
// trademark notices)" and "will not modify, obscure, or delete" it. So there
// is no swapping it for a smaller pill, and nothing may be drawn over it. The
// card rail in StoreMap.tsx sits clear of it for that reason.
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
const MAP_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
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

export const createGoogleEngine: EngineFactory = async (holder, options) => {
  const maps = await loadMaps();
  if (!maps) return null;

  const { Map } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;

  const map = new Map(holder, {
    // The whole-country view the finder opens on: nothing preselected, the
    // lower 48 until the visitor searches or shares their position.
    center: { lat: 39, lng: -96 },
    zoom: 4,
    // Google's own chrome, all off. The finder draws its own zoom pair and
    // locate button so they match the app rather than the platform, and a
    // second set underneath them is clutter over a small screen.
    disableDefaultUI: true,
    // Separate from disableDefaultUI, which explicitly does not cover it. This
    // is what takes the "Keyboard shortcuts" button off the bottom bar, and it
    // is a supported option rather than something hidden with CSS. Nothing
    // here is reachable by keyboard anyway: the zoom pair and the locate
    // button are real buttons.
    keyboardShortcuts: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    styles: MAP_STYLE[options.theme],
  });

  map.fitBounds({
    south: options.initialBounds.south,
    west: options.initialBounds.west,
    north: options.initialBounds.north,
    east: options.initialBounds.east,
  });

  map.addListener("dragend", options.onMoved);
  map.addListener("zoom_changed", options.onMoved);

  const info = new maps.InfoWindow({ disableAutoPan: false });
  let markers = new global.Map<string, google.maps.Marker>();
  const opens = new global.Map<string, () => void>();

  const engine: MapEngine = {
    setTheme(theme) {
      // setOptions swaps the palette and leaves the markers, which are
      // overlays rather than part of the style.
      map.setOptions({ styles: MAP_STYLE[theme] });
    },

    setMarkers(locations: StoreLocation[], onOrder) {
      markers.forEach((marker) => marker.setMap(null));
      markers = new global.Map();
      opens.clear();

      for (const location of locations) {
        const marker = new google.maps.Marker({
          map,
          position: { lat: location.position[0], lng: location.position[1] },
          icon: {
            url: pinDataUri(location.kind),
            scaledSize: new google.maps.Size(26, 34),
            anchor: new google.maps.Point(13, 33),
          },
          title: location.name,
        });
        const open = () => {
          info.setContent(popupContent(location, () => onOrder(location)));
          info.open({ map, anchor: marker });
        };
        marker.addListener("click", open);
        markers.set(location.id, marker);
        opens.set(location.id, open);
      }
    },

    openPopup(id) {
      opens.get(id)?.();
    },

    panTo(point, zoom) {
      map.panTo({ lat: point[0], lng: point[1] });
      if (typeof zoom === "number") map.setZoom(zoom);
    },

    getZoom() {
      return map.getZoom() ?? 4;
    },

    setZoom(zoom) {
      map.setZoom(zoom);
    },

    getBounds() {
      const bounds = map.getBounds();
      if (!bounds) return null;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      return { south: sw.lat(), west: sw.lng(), north: ne.lat(), east: ne.lng() };
    },

    destroy() {
      markers.forEach((marker) => marker.setMap(null));
      markers = new global.Map();
      info.close();
    },
  };

  return engine;
};
