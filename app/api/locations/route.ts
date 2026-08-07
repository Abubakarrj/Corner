import { storePlaces } from "../../storePlaces";

// Where the pins go.
//
// The finder ships with a coordinate typed next to every address, and that
// pair is deliberately approximate — locations.ts calls it "the block, not the
// doorway". It draws a perfectly reasonable map and it is wrong by the width
// of a building, which is exactly the error somebody notices when they are
// standing on the street looking for a door.
//
// So the map asks. This resolves each address through Geocoding on the server
// and hands back the answer; the client merges it over what it already has and
// draws whatever it ended up with, so a missing key or an unreachable Google
// is a map with slightly-off pins rather than no map. See storePlaces.ts for
// the guard that stops a surprising lookup relocating the shop.
//
// Nothing secret goes out of here. A shop's address is on its own front page
// and its coordinates are the same fact in another notation.
export const revalidate = 86400;

export async function GET() {
  return Response.json({ places: await storePlaces() });
}
