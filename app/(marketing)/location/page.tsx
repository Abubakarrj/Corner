import LogoLockup from "../../LogoLockup";
import LocationModal from "./LocationModal";

// /location is the location picker as a pop-up over the site, not a page of
// its own — so the landing mark renders behind it, the same one the homepage
// shows, and the modal sits on top. Closing the modal navigates to /.
//
// Keeping it on a route rather than making it transient state on the
// homepage means the picker has a shareable URL and a working back button,
// which is what you want for "where are you?" — it's the kind of thing
// people send to each other.
export const metadata = {
  title: "Location — Corner Bagel",
  description: "Where to find Corner Bagel.",
};

export default function LocationPage() {
  return (
    <>
      <div className="flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-white p-6">
        {/* Backdrop only — the modal over it has its own focus trap, so the
            mark's link must not be a focusable target underneath. */}
        <LogoLockup interactive={false} />
      </div>
      <LocationModal />
    </>
  );
}
