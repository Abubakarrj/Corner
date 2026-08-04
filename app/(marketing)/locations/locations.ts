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
  address: string;
  city: string;
  hours: string;
  // [latitude, longitude]
  position: [number, number];
};

// The shop, and the kitchen every delivery leaves from.
//
// The city is inferred, not given: the address was supplied as "3064 W 8th
// Street" with no city, and W 8th Street runs through Los Angeles's
// Koreatown — which matches both the location's name and the +1 213 number
// the drop-list welcome email links to. An earlier pass had this pin in
// Manhattan on the same reasoning about "Korean Town", which was wrong.
// Worth confirming.
//
// The coordinates are approximate — the block, not the doorway. They are
// only used to frame the map and to measure the delivery radius, and both
// tolerate a hundred metres; resolving the address through Places once and
// pasting the exact pair back here would settle it.
export const KOREATOWN: StoreLocation = {
  id: "koreatown",
  name: "Koreatown",
  kind: "shop",
  address: "3064 W 8th St",
  city: "Los Angeles, CA 90005",
  hours: "Hours to come",
  position: [34.0578, -118.296],
};

export const LOCATIONS: StoreLocation[] = [KOREATOWN];

// Deliveries leave from the shop, so the radius is measured from its door.
// If a second kitchen ever delivers, this becomes a per-location decision
// rather than one origin.
export const DELIVERY_ORIGIN = KOREATOWN;

// How far we'll deliver, in miles. A guess — nobody has said — so it's named
// here rather than buried in the check, and it's the one number to change
// when the real answer arrives.
export const DELIVERY_RADIUS_MILES = 5;

// Great-circle distance in miles. Deliberately not a road-network distance:
// that needs a routing API, costs a call per address, and for a radius check
// this size the difference rarely changes the answer. If it starts to,
// swap this for Distance Matrix.
export function milesBetween(
  [lat1, lon1]: [number, number],
  [lat2, lon2]: [number, number],
): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// The whole-country view the finder opens on, matching the reference: no
// location assumed, nothing preselected, the map showing the lower 48 until
// the visitor searches or shares their position.
//
// Expressed as bounds rather than a centre and zoom so the framing survives
// a change of map height. A fixed zoom fits the country at one viewport and
// crops it at the next.
export const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [24.5, -124.8],
  [49.4, -66.9],
];
