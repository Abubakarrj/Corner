import { Suspense } from "react";
import LocationFinder from "./LocationFinder";

export const metadata = {
  title: "Locations — Corner Bagel",
  description:
    "Find a Corner Bagel shop, an outpost carrying our sandwiches, or set a delivery address.",
};

export default function LocationsPage() {
  // The finder reads ?for= to know whether Home or Menu sent it here, and
  // useSearchParams without a boundary would opt this whole route out of
  // prerendering. The fallback is the page's own cream, so the swap isn't
  // visible — the map is a client-only chunk that arrives a beat later
  // regardless.
  return (
    <Suspense fallback={<div className="h-dvh w-full" style={{ backgroundColor: "#F7F4EB" }} />}>
      <LocationFinder />
    </Suspense>
  );
}
