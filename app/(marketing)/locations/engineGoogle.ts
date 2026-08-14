"use client";

import { loadMaps } from "../../googleMapsPublic";
import { MAP_STYLE } from "./mapStyle";
import type { StoreLocation } from "./locations";
import {
  PIN_SIZE,
  PIN_SIZE_SELECTED,
  pinDataUri,
  type EngineFactory,
  type MapEngine,
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

// The "you are here" dot: a white ring around a blue disc, with a soft outer
// glow so it survives both a pale road and a dark basemap. Blue rather than
// anything in the produce palette on purpose — this is the one mark on the
// map that is not us, and every map anybody has ever used draws the reader
// in blue.
const YOU_BLUE = "#1a73e8";
const YOU_DOT =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">' +
      '<circle cx="9" cy="9" r="8" fill="#1a73e8" fill-opacity="0.18"/>' +
      '<circle cx="9" cy="9" r="6" fill="#ffffff"/>' +
      '<circle cx="9" cy="9" r="4.4" fill="#1a73e8"/>' +
      "</svg>",
  );

export const createGoogleEngine: EngineFactory = async (holder, options) => {
  const maps = await loadMaps(options.language);
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

  let entries: { id: string; kind: StoreLocation["kind"]; marker: google.maps.Marker }[] = [];
  let you: google.maps.Marker | null = null;
  let halo: google.maps.Circle | null = null;
  let selected: string | null = null;

  const icon = (kind: StoreLocation["kind"], isSelected: boolean): google.maps.Icon => {
    const size = isSelected ? PIN_SIZE_SELECTED : PIN_SIZE;
    return {
      url: pinDataUri(kind, isSelected),
      scaledSize: new google.maps.Size(size.width, size.height),
      // Anchored at the point of the teardrop, so growing it lifts the pin off
      // its own coordinate rather than sliding it sideways.
      anchor: new google.maps.Point(size.width / 2, size.height),
    };
  };

  const engine: MapEngine = {
    setTheme(theme) {
      // setOptions swaps the palette and leaves the markers, which are
      // overlays rather than part of the style.
      map.setOptions({ styles: MAP_STYLE[theme] });
    },

    setMarkers(locations, onSelect) {
      entries.forEach((entry) => entry.marker.setMap(null));
      entries = locations.map((location) => {
        const marker = new google.maps.Marker({
          map,
          position: { lat: location.position[0], lng: location.position[1] },
          icon: icon(location.kind, location.id === selected),
          title: location.name,
        });
        marker.addListener("click", () => onSelect(location.id));
        return { id: location.id, kind: location.kind, marker };
      });
    },

    setSelected(id) {
      selected = id;
      entries.forEach((entry) => {
        entry.marker.setIcon(icon(entry.kind, entry.id === id));
        // The selected pin draws over its neighbours. Two shops a block apart
        // otherwise overlap in whatever order they were added.
        entry.marker.setZIndex(entry.id === id ? 2 : 1);
      });
    },

    // ——— You are here ———
    //
    // A Google Marker rather than the library's own accuracy widget, because
    // there is no such widget: the blue dot on maps.google.com is Google's
    // app, not the JavaScript API, and every embedder draws its own.
    //
    // Two objects. The dot is fixed-size chrome — it is a cursor, and a cursor
    // that grows when you zoom out stops being one. The circle is in metres,
    // so it grows and shrinks with the map exactly as the uncertainty it
    // stands for does, which is the point of drawing it.
    setYou(point, accuracyMeters) {
      you?.setMap(null);
      halo?.setMap(null);
      you = null;
      halo = null;
      if (!point) return;

      const position = { lat: point[0], lng: point[1] };
      // Below this the circle is smaller than the dot and draws as a smudge
      // around it. A fix that good does not need its uncertainty illustrated.
      if (typeof accuracyMeters === "number" && accuracyMeters > 40) {
        halo = new google.maps.Circle({
          center: position,
          radius: accuracyMeters,
          strokeColor: YOU_BLUE,
          strokeOpacity: 0.35,
          strokeWeight: 1,
          fillColor: YOU_BLUE,
          fillOpacity: 0.12,
          clickable: false,
          map,
        });
      }
      you = new google.maps.Marker({
        position,
        map,
        clickable: false,
        // Above the shop pins: it is where the reader is, and a shop sitting
        // on top of it hides the one thing that answers "where am I".
        zIndex: 1000,
        icon: {
          url: YOU_DOT,
          scaledSize: new google.maps.Size(18, 18),
          anchor: new google.maps.Point(9, 9),
        },
      });
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
      you?.setMap(null);
      halo?.setMap(null);
      entries.forEach((entry) => entry.marker.setMap(null));
      entries = [];
    },
  };

  return engine;
};
