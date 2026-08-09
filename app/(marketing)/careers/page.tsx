import CareersLanding from "./CareersLanding";
import { OPENINGS, isNew } from "./openings";
import { resolvePay } from "./pay";

export const metadata = {
  title: "Work at Corner Bagel",
  description:
    "The jobs at Corner Bagel — counter, kitchen, shift lead and manager — and how to apply.",
};

// Hourly, because two things on this page are time-dependent: the "New" badge
// stops after thirty days, and a posted wage stops being printed once it is
// too old to stand behind. Without this the page is prerendered once and both
// are frozen at whatever they were when the build ran — a job stays New until
// somebody happens to deploy, and worse, a stale wage keeps being shown. An
// hour is far finer than either needs and costs a render an hour.
export const revalidate = 3600;

export default function CareersPage() {
  // Decided here, on the server, and handed down as a plain boolean. See the
  // note on isNew: a client component reading its own clock renders one answer
  // into the HTML and a different one on hydration.
  const now = new Date();
  const openings = OPENINGS.map((opening) => ({
    ...opening,
    isNew: isNew(opening, now),
    // Numbers only. The card turns them into money in whatever language is
    // on, which is the half that needs the browser.
    pay: resolvePay(opening.role, now),
  }));
  return <CareersLanding openings={openings} />;
}
