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
const MAP_STYLE: Record<MapTheme, google.maps.MapTypeStyle[]> = {
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
