"use client";

// Named imports: maplibre-gl dropped its default export in v6.
import { addProtocol, Map as MapLibreMap, Marker } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapsConfig } from "../../googleMapsPublic";
import type { StoreLocation } from "./locations";
import {
  pinSvg,
  type EngineFactory,
  type MapEngine,
  type MapTheme,
} from "./mapEngine";

// The Protomaps half of the basemap: OpenStreetMap data, drawn by MapLibre.
//
// Nothing here authenticates. The whole basemap is one .pmtiles file sitting
// on your own storage, and MapLibre reads the few kilobytes it needs out of it
// with HTTP range requests rather than downloading the thing. No key to leak,
// no per-load bill, and no provider deciding what has to appear on the canvas.
//
// What that buys, and the reason this exists alongside the Google one: the
// entire attribution obligation is a small pill reading "Protomaps ©
// OpenStreetMap", which is the look the Google map cannot be made to have.
//
// What it costs is hosting. The archive has to answer HTTP range requests with
// CORS open, which object storage does and some static hosts do not, and it
// carries the map data as of the day you built it until you build another.

// MapLibre throws on a second registration of the same scheme, and this module
// can be imported by more than one mount over a session.
let registered = false;

// ——— Attribution ———
//
// Both credits are links, because attribution that can't be followed isn't
// really attribution: OSM's licence asks for a credit that leads somewhere.
// MapLibre renders this into its own compact control, which is the pill.
const ATTRIBUTION =
  '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noreferrer">Protomaps</a> ' +
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

// The app's palette, laid over Protomaps' own.
//
// namedFlavor gives a complete, coherent basemap; these override the handful
// of surfaces big enough to set the mood, so the map reads as part of the shop
// rather than as a map with the shop's pins on it. Everything not named here
// keeps the flavor's value, which is why this is a dozen lines rather than the
// seventy-odd keys a flavor actually has.
function flavorFor(theme: MapTheme) {
  const base = namedFlavor(theme === "dark" ? "dark" : "light");
  const tint =
    theme === "dark"
      ? {
          background: "#232220",
          earth: "#232220",
          water: "#1e2a30",
          buildings: "#2c2b28",
          minor_a: "#33312e",
          minor_b: "#33312e",
          major: "#3b3935",
          highway: "#44413c",
        }
      : {
          background: "#f2eee1",
          earth: "#f2eee1",
          water: "#cfe0e8",
          buildings: "#e7e3d6",
          minor_a: "#ffffff",
          minor_b: "#ffffff",
          major: "#faf8f1",
          highway: "#f5f1e4",
        };
  return { ...base, ...tint };
}

export const createProtomapsEngine: EngineFactory = async (holder, options) => {
  const config = await mapsConfig();
  if (!config.pmtiles) {
    console.error(
      "[map] PMTILES_URL is not set, so there is no basemap to draw. Build an " +
        "extract at build.protomaps.com and put it on storage that answers " +
        "HTTP range requests with CORS open.",
    );
    return null;
  }

  // Teaches MapLibre the pmtiles:// scheme.
  if (!registered) {
    addProtocol("pmtiles", new Protocol().tile);
    registered = true;
  }

  // `as const` on the two literals: the style spec types them as the exact
  // values 8 and "vector", and a plain object literal widens them to number
  // and string.
  const style = (theme: MapTheme) => ({
    version: 8 as const,
    // Vector tiles carry the text of a label, not the glyphs to draw it with,
    // so the style needs somewhere to fetch those from.
    glyphs: config.glyphs,
    sprite: config.sprite,
    sources: {
      protomaps: {
        type: "vector" as const,
        url: `pmtiles://${config.pmtiles}`,
      },
    },
    // Points of interest dropped for the same reason they're off on the Google
    // map: this map has one pin that matters.
    layers: layers("protomaps", flavorFor(theme), { lang: "en" }).filter(
      (layer) => layer.id !== "pois",
    ),
  });

  const map = new MapLibreMap({
    container: holder,
    style: style(options.theme),
    bounds: [
      [options.initialBounds.west, options.initialBounds.south],
      [options.initialBounds.east, options.initialBounds.north],
    ],
    // The finder draws its own zoom pair and locate button, so MapLibre's are
    // off. The attribution control stays, compact, and is the point.
    //
    // customAttribution rather than an `attribution` on the source, which is
    // the more usual place for it. A source only contributes its attribution
    // once it has loaded, so a slow archive or a bad URL took the credit off
    // the map along with the tiles. Declaring it on the control means the pill
    // is there from the first frame and stays there, which is what an
    // attribution requirement actually asks for.
    attributionControl: { compact: true, customAttribution: ATTRIBUTION },
    dragRotate: false,
    pitchWithRotate: false,
    touchZoomRotate: true,
  });
  map.touchZoomRotate.disableRotation();
  map.on("dragend", options.onMoved);
  map.on("zoomend", options.onMoved);

  let markers: {
    id: string;
    kind: StoreLocation["kind"];
    marker: Marker;
    element: HTMLElement;
  }[] = [];
  let selected: string | null = null;
  let youMarker: Marker | null = null;
  let youSizer: (() => void) | null = null;

  const engine: MapEngine = {
    setTheme(theme) {
      // setStyle replaces the basemap and leaves the markers, which are DOM
      // elements MapLibre positions rather than part of the style.
      map.setStyle(style(theme));
    },

    setMarkers(locations, onSelect) {
      markers.forEach((entry) => entry.marker.remove());
      markers = locations.map((location) => {
        const element = document.createElement("div");
        element.innerHTML = pinSvg(location.kind, location.id === selected);
        element.style.cursor = "pointer";
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", location.name);
        element.addEventListener("click", () => onSelect(location.id));

        const marker = new Marker({ element, anchor: "bottom" })
          .setLngLat([location.position[1], location.position[0]])
          .addTo(map);

        return { id: location.id, kind: location.kind, marker, element };
      });
    },

    setSelected(id) {
      selected = id;
      markers.forEach((entry) => {
        entry.element.innerHTML = pinSvg(entry.kind, entry.id === id);
        // The selected pin draws over its neighbours. Two shops a block apart
        // otherwise overlap in whatever order they were added.
        entry.element.parentElement?.style.setProperty(
          "z-index",
          entry.id === id ? "2" : "1",
        );
      });
    },

    // The reader's own position. A DOM marker, like the shop pins above, so
    // the two stack in one coordinate system and nothing needs a GeoJSON
    // source.
    //
    // The accuracy circle is drawn in CSS pixels from the metres at the
    // current zoom, and recomputed on every move — MapLibre has no
    // metre-radius primitive short of a circle layer with a pixel-per-metre
    // expression, and a listener is less machinery than the expression.
    setYou(point, accuracyMeters) {
      youMarker?.remove();
      youMarker = null;
      if (youSizer) {
        map.off("zoom", youSizer);
        map.off("move", youSizer);
        youSizer = null;
      }
      if (!point) return;

      const element = document.createElement("div");
      element.style.pointerEvents = "none";
      element.style.position = "relative";
      element.innerHTML =
        '<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
        'width:18px;height:18px;border-radius:9999px;background:#1a73e8;' +
        'box-shadow:0 0 0 3px #fff,0 0 0 5px rgba(26,115,232,0.25)"></span>' +
        '<span data-halo style="position:absolute;left:50%;top:50%;' +
        "transform:translate(-50%,-50%);border-radius:9999px;" +
        'background:rgba(26,115,232,0.12);border:1px solid rgba(26,115,232,0.35);' +
        'width:0;height:0"></span>';

      youMarker = new Marker({ element, anchor: "center" })
        .setLngLat([point[1], point[0]])
        .addTo(map);

      const halo = element.querySelector<HTMLElement>("[data-halo]");
      if (!halo || typeof accuracyMeters !== "number" || accuracyMeters <= 40) return;

      const size = () => {
        // Web-Mercator ground resolution at this latitude and zoom.
        const metresPerPixel =
          (156543.03392 * Math.cos((point[0] * Math.PI) / 180)) / 2 ** map.getZoom();
        const diameter = (accuracyMeters / metresPerPixel) * 2;
        halo.style.width = `${diameter}px`;
        halo.style.height = `${diameter}px`;
      };
      size();
      youSizer = size;
      map.on("zoom", size);
      map.on("move", size);
    },

    panTo(point, zoom) {
      map.easeTo({
        center: [point[1], point[0]],
        ...(typeof zoom === "number" ? { zoom } : {}),
      });
    },

    home() {
      // The same rectangle the map was constructed with, refitted rather than
      // flown to a remembered centre: the framing depends on the holder's
      // shape, and the holder is a flex child that changes height.
      map.fitBounds(
        [
          [options.initialBounds.west, options.initialBounds.south],
          [options.initialBounds.east, options.initialBounds.north],
        ],
        { animate: false },
      );
    },

    getZoom() {
      return map.getZoom();
    },

    setZoom(zoom) {
      map.easeTo({ zoom });
    },

    getBounds() {
      const bounds = map.getBounds();
      return {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      };
    },

    destroy() {
      markers.forEach((entry) => entry.marker.remove());
      markers = [];
      map.remove();
    },
  };

  return engine;
};
