// The two kinds of place a Corner Bagel bagel can be picked up from, which is
// what the Pickup / Outpost split in the finder is: a shop is ours, an
// outpost is somebody else's counter carrying our sandwiches. Delivery isn't
// a kind of place — it's a mode that asks for the visitor's address instead —
// so it has no entries here.
export type LocationKind = "shop" | "outpost";

export type StoreLocation = {
  id: string;
  name: string;
  kind: LocationKind;
  // Street address, as it should be read out on the card.
  address: string;
  city: string;
  hours: string;
  // [latitude, longitude]
  position: [number, number];
};

// PLACEHOLDER DATA. The one shop is real, but its street address, hours, and
// exact pin are stand-ins — the coordinates are the middle of Koreatown,
// Manhattan, not a surveyed doorway. Nothing here should go live before the
// real addresses land, and no outposts are listed because none have been
// given yet. Everything the finder does — pins, bounds filtering, the empty
// state, the counts — reads from this array, so replacing it is the whole
// job of making the page real.
export const LOCATIONS: StoreLocation[] = [
  {
    id: "korean-town",
    name: "Korean Town",
    kind: "shop",
    address: "Address to come",
    city: "New York, NY",
    hours: "Hours to come",
    position: [40.7476, -73.986],
  },
];

// The whole-country view the finder opens on, matching the reference: no
// location assumed, nothing preselected, the map showing the lower 48 until
// the visitor searches or shares their position.
//
// Expressed as bounds rather than a centre and zoom so the framing survives
// a change of map height. A fixed zoom fits the country at one viewport and
// crops it at the next — at zoom 4 on a 440px-wide map the east coast falls
// off the right edge, which put the one real pin outside the opening view.
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [24.5, -124.8],
  [49.4, -66.9],
];
