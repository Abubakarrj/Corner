import AboutCardBody, { aboutTextStyle } from "../../AboutCardBody";
import ThemeToggle from "../../ui/ThemeToggle";

export default function AboutPage() {
  return (
    // min-h-dvh, not h-screen: dvh follows a mobile browser's toolbars as
    // they come and go, and min- lets the card scroll rather than be
    // clipped when it cannot fit — this holds paragraph copy, not the
    // handful of short lines it used to, so it needs the room to do that.
    <div className="flex min-h-dvh w-full items-center justify-center bg-page px-6 py-12 sm:py-16">
      <div className="max-w-md w-full relative text-center flex flex-col" style={aboutTextStyle}>
        <AboutCardBody />

        {/* Appearance lives here because this is the one screen anybody can
            reach — it's a tab, and it needs no account. The shop's account
            page carries the same control for people already in there; both
            drive the same stored preference. */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-line pt-8">
          <p className="m-0 text-[13px] text-muted">Appearance</p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
