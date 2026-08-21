import AboutCardBody, { aboutTextStyle } from "../../AboutCardBody";
import PageTitle from "../../ui/PageTitle";

export default function AboutPage() {
  return (
    // min-h-dvh, not h-screen: dvh follows a mobile browser's toolbars as
    // they come and go, and min- lets the card scroll rather than be
    // clipped when it cannot fit — this holds paragraph copy, not the
    // handful of short lines it used to, so it needs the room to do that.
    // <main> and a name: this page had neither, so there was no landmark to
    // skip to and no heading to jump by — just a column of prose starting
    // mid-sentence for anybody arriving with a screen reader.
    <main className="flex min-h-dvh w-full items-center justify-center bg-page px-6 py-12 sm:py-16">
      <PageTitle k="nav.about" />
      <div className="max-w-md w-full relative text-center flex flex-col" style={aboutTextStyle}>
        <AboutCardBody />
      </div>
    </main>
  );
}
