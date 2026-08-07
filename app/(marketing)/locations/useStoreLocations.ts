"use client";

import { useEffect, useState } from "react";
import { LOCATIONS, type StoreLocation } from "./locations";

// The shops, with their coordinates resolved from their addresses.
//
// Every location in locations.ts carries a hand-written position, and that
// file says plainly what it is: "approximate — the block, not the doorway".
// It was written to frame a map and it does that fine. It is still wrong by
// the width of a building, and a pin wrong by a building is wrong in the one
// place it is being read — on a phone, on the street, looking for a door.
//
// /api/locations answers with the geocoded pair. This asks once and merges the
// answer over what's already here.
//
// ——— Why it starts with the typed pair rather than nothing ———
//
// Because the map has to draw either way. Waiting for a network round trip
// before placing a pin means a fetch failure or an unset key is a map with no
// shop on it, which is a worse map than one with a shop on the right block. So
// the typed coordinates render immediately and the resolved ones replace them
// when they land — a pin that shifts by a few metres a moment after the tiles
// arrive, or doesn't, and nothing else changes.
//
// The two are close enough that the correction isn't visible as movement at
// the zoom the finder opens on; it becomes visible where it matters, zoomed in
// on the shop's own card.
export default function useStoreLocations(): StoreLocation[] {
  const [locations, setLocations] = useState<StoreLocation[]>(LOCATIONS);

  useEffect(() => {
    let live = true;

    fetch("/api/locations")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { places?: Record<string, { position?: [number, number] }> } | null) => {
        const places = body?.places;
        if (!live || !places) return;

        // Only positions are taken. The name, the address and the aliases are
        // ours and are what the shop calls itself; Google's formatting of the
        // same address is a different string for the same place, and swapping
        // it in would change what the cards read for no gain.
        const merged = LOCATIONS.map((location) => {
          const position = places[location.id]?.position;
          if (!Array.isArray(position) || position.length !== 2) return location;
          if (position[0] === location.position[0] && position[1] === location.position[1]) {
            return location;
          }
          return { ...location, position };
        });

        // Same objects back if nothing moved, so this doesn't re-render every
        // consumer of the finder for a fetch that changed nothing.
        if (merged.every((location, index) => location === LOCATIONS[index])) return;
        setLocations(merged);
      })
      .catch(() => {
        // A map with the typed pins is the fallback, and it is already on
        // screen. Nothing to do and nothing worth saying.
      });

    return () => {
      live = false;
    };
  }, []);

  return locations;
}
