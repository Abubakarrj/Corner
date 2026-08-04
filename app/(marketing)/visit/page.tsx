import SplitPanels from "./SplitPanels";

// A page of its own, so / and /order are untouched. Nothing links here yet —
// the entry point is still to be decided.
export const metadata = {
  title: "Corner Bagel",
  description: "Locations and about — Corner Bagel.",
};

export default function VisitPage() {
  return <SplitPanels />;
}
