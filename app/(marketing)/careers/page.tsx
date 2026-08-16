import CareersLanding from "./CareersLanding";
import { OPENINGS, isNew } from "./openings";
import { POSTS_PAY_SCALE, resolvePay } from "./pay";

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
    //
    // Gated here rather than in the card, so a wage the page is not showing is
    // not serialised into the HTML either. See POSTS_PAY_SCALE: the shop is
    // under the headcount that makes a posted scale mandatory, and a rate on
    // the card reads as the offer when it is the floor. The page offers the
    // scale on request instead, which is what an applicant is entitled to at
    // any size.
    pay: POSTS_PAY_SCALE ? resolvePay(opening.role, now) : null,
  }));
  return <CareersLanding openings={openings} />;
}
