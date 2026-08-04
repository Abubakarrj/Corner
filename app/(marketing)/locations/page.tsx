import LocationFinder from "./LocationFinder";

export const metadata = {
  title: "Locations — Corner Bagel",
  description:
    "Find a Corner Bagel shop, an outpost carrying our sandwiches, or set a delivery address.",
};

export default function LocationsPage() {
  return <LocationFinder />;
}
