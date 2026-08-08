import CareersLanding from "./CareersLanding";
import { OPENINGS, isNew } from "./openings";

export const metadata = {
  title: "Work at Corner Bagel",
  description:
    "The jobs at Corner Bagel — counter, kitchen, shift lead and manager — and how to apply.",
};

// Hourly, because one thing on this page is time-dependent: the "New" badge
// stops after thirty days. Without this the page is prerendered once and the
// badge is frozen at whatever it was when the build ran, so a job stays New
// until somebody happens to deploy. An hour is far finer than a day-scale
// badge needs and costs a render an hour.
export const revalidate = 3600;

export default function CareersPage() {
  // Decided here, on the server, and handed down as a plain boolean. See the
  // note on isNew: a client component reading its own clock renders one answer
  // into the HTML and a different one on hydration.
  const now = new Date();
  const openings = OPENINGS.map((opening) => ({ ...opening, isNew: isNew(opening, now) }));
  return <CareersLanding openings={openings} />;
}
