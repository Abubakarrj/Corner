"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const BRAND_RED = "#BE1923";
const TEAM_EMAIL = "cornerbagel@publicentity.co";

type PanelId = "locations" | "about";

// Pointer devices reveal a panel on hover; touch devices have no hover, so
// there it's a tap on the panel's label. Which applies is decided by the
// device's own capability rather than by screen width — a small laptop
// window has a mouse, and a large tablet doesn't.
//
// The subscribe/snapshot pair is useSyncExternalStore's shape: matchMedia is
// an external store, and reading it this way keeps the server render and the
// first client paint in agreement instead of setting state inside an effect.
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeHover(callback: () => void) {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function getHoverSnapshot() {
  return window.matchMedia(HOVER_QUERY).matches;
}
// Assume hover on the server: it's the desktop default, and the value is
// re-read the moment the client hydrates.
function getHoverServerSnapshot() {
  return true;
}

// The two-box panel from the sketch: brand red, split across the viewport,
// "Locations" over "About". Revealing one grows it and shrinks the other
// rather than overlaying anything, so the two boxes always account for the
// whole screen between them.
//
// They expand to different sizes on purpose — About holds four paragraphs
// and Locations holds two buttons, so one ratio for both would either crush
// the copy or leave the buttons swimming.
//
// Each panel is a <div> with a <button> for its label, not a button
// wrapping everything. Hover is on the div — so moving the cursor down from
// the label onto the buttons it revealed keeps the panel open — while the
// label carries the click target, the focus target, and aria-expanded.
// Wrapping the whole panel in a button instead would make the revealed
// buttons and the mailto link illegal nested interactive content, which
// browsers reparent, and would have meant the reveal could never contain
// anything you can actually press.
export default function SplitPanels() {
  const canHover = useSyncExternalStore(
    subscribeHover,
    getHoverSnapshot,
    getHoverServerSnapshot,
  );
  const [active, setActive] = useState<PanelId | null>(null);

  const hoverHandlers = useCallback(
    (id: PanelId) =>
      canHover
        ? {
            onMouseEnter: () => setActive(id),
            onMouseLeave: () => setActive(null),
          }
        : {},
    [canHover],
  );

  return (
    <div
      className="flex min-h-dvh w-full flex-col overflow-hidden"
      style={{ backgroundColor: BRAND_RED }}
    >
      {(["locations", "about"] as const).map((id) => {
        const open = active === id;
        return (
          <div
            key={id}
            {...hoverHandlers(id)}
            // flexGrow rather than a height, so the two panels always fill
            // the viewport exactly and the closed one gives up precisely
            // what the open one takes.
            style={{
              flexGrow: open ? (id === "about" ? 3.4 : 2.2) : 1,
              flexBasis: 0,
            }}
            className={`group relative flex w-full min-h-0 flex-col items-center justify-center px-6 text-center text-white transition-[flex-grow] duration-500 ease-out motion-reduce:transition-none ${
              // The rule between the boxes, as in the sketch. On the second
              // panel only, so it reads as a divider rather than an outline.
              id === "about" ? "border-t border-white/35" : ""
            }`}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setActive((prior) => (prior === id ? null : id))}
              // Focus opens it too, so the reveal is reachable by keyboard on
              // a device where hover never fires.
              onFocus={() => setActive(id)}
              className={`block cursor-pointer font-bold uppercase leading-none transition-all duration-500 ease-out motion-reduce:transition-none ${
                // The label shrinks out of the way as its panel opens rather
                // than disappearing — it's the heading for what's revealed.
                open
                  ? "text-[13px] tracking-[0.22em] opacity-80 sm:text-[15px]"
                  : "text-[34px] tracking-[0.06em] sm:text-[46px] md:text-[56px]"
              }`}
            >
              {id}
            </button>

            {/* The reveal. Always mounted so it can fade rather than pop, and
                hidden from the tab order and the accessibility tree while
                closed. Its height comes from the flex-grow above; the delay
                lets the panel finish growing before the content arrives. */}
            <div
              inert={!open}
              className={`w-full max-w-md overflow-y-auto transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                open
                  ? "mt-5 opacity-100 delay-200"
                  : "pointer-events-none mt-0 max-h-0 opacity-0"
              }`}
            >
              {id === "locations" ? <LocationsContent /> : <AboutContent />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The two buttons don't go anywhere yet: there is no preorder or catering
// destination in the app. They're real buttons so the layout and hover states
// are the finished thing, but pressing one does nothing — wire an onClick or
// swap them for links once those destinations exist.
function LocationsContent() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {["Preorder", "Catering"].map((label) => (
        <button
          key={label}
          type="button"
          className="cursor-pointer rounded-full border border-white/70 px-7 py-2.5 text-[13px] font-bold uppercase tracking-[0.1em] transition-colors duration-200 hover:bg-white hover:text-[#BE1923] sm:text-[14px]"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AboutContent() {
  return (
    <div className="text-[13px] leading-[1.65] sm:text-[14px]">
      <p className="m-0">
        Every bagel is naturally fermented, kettle-boiled, and baked to achieve
        a crisp crust with a perfectly chewy interior.
      </p>
      <p className="m-0 mt-3">
        We source produce from local farmers markets and pair it with
        thoughtfully selected ingredients, house-made spreads, and seasonal
        flavors. Everything we serve is intentional, simple, and crafted with
        care.
      </p>
      <p className="m-0 mt-3 font-semibold">Right Around The Corner.</p>
      <p className="m-0 mt-4">To speak with a member of our team:</p>
      <a
        href={`mailto:${TEAM_EMAIL}`}
        className="inline-block cursor-pointer underline underline-offset-2 transition-opacity hover:opacity-70"
      >
        {TEAM_EMAIL}
      </a>
    </div>
  );
}
