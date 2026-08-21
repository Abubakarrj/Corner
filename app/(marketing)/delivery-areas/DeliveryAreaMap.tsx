"use client";

import { useEffect, useRef, useState } from "react";
import { loadMaps, suggestAddresses, type Suggestion } from "../../googleMapsPublic";
import { MAP_STYLE } from "../locations/mapStyle";
import { PIN_SIZE, pinDataUri } from "../locations/mapEngine";
import { SHOPS_CENTRE } from "../locations/locations";
import { searchBias } from "../../geolocate";
import { useResolvedTheme } from "../../theme";
import { useT } from "../../i18n";

// The shaded map of where we deliver.
//
// ——— The shape is measured, not drawn ———
//
// Everything here renders what /api/delivery-area hands over, and that is a
// road-distance contour rather than a circle. See app/deliveryArea.ts for why
// a circle would be a lie in this city. Nothing in this file invents a
// boundary: no shape, no map.
//
// ——— And the check below it is the real answer ———
//
// A shaded polygon is a picture of a rule with a hundred-metre tolerance and
// no knowledge of a specific address. The field underneath asks the server,
// which geocodes and measures. Somebody at the edge should use that, and the
// copy says so rather than letting the shading imply a precision it does not
// have.

type Area = {
  known: true;
  /** The boundary of the union: one closed loop per connected piece of the
   *  area, with the seams between overlapping counters already gone. This is
   *  the shape to draw. See app/polygonUnion.ts for why it is computed on the
   *  server rather than handed to Google as several overlapping paths. */
  outline?: [number, number][][];
  /** ⚠️ What `outline` was called before the rings were unioned, kept readable
   *  for as long as a cached response can outlive a deploy. Drawing these
   *  works — the fill unions correctly — it just shows every counter's whole
   *  circle, seams and all, which is what the union exists to stop. */
  rings?: [number, number][][];
  /** ⚠️ What this field was called until the shape became several. Kept
   *  readable for as long as a cached response can outlive a deploy, which is
   *  now minutes rather than a day, so a visitor mid-refresh gets the old
   *  single ring drawn correctly instead of an empty map. */
  ring?: [number, number][];
  /** Every counter a delivery can leave from. Plural: the area is a reach
   *  around each of them, not one shop with a long arm. */
  origins: [number, number][];
  centre: [number, number];
  radiusMiles: number;
};

type Check =
  | { state: "idle" }
  | { state: "asking" }
  // Just the answer. It used to carry the distance and the canonical address
  // as well, and the copy that read them back is gone: see the note below.
  | { state: "answered"; inRange: boolean }
  | { state: "unsure" }
  | { state: "failed" };

export default function DeliveryAreaMap() {
  const t = useT();
  const theme = useResolvedTheme();
  const holder = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area | null>(null);
  // Empty until somebody types something.
  //
  // It used to arrive prefilled with the address the basket was already going
  // to, on the reasoning that somebody opening this from the (i) beside the
  // delivery fee had typed that address once already and should not be asked
  // twice. The reasoning had the question backwards. Nobody opens "Where we
  // deliver" to be told about the address they have already set and already
  // ordered to. They open it to ask about a *different* one: the office, a
  // friend's place, somewhere they are thinking of having lunch.
  //
  // So the prefill answered the question nobody was asking, and charged for
  // it: the field had to be cleared before it could be used, and a field you
  // clear before using is worse than an empty one.
  const [address, setAddress] = useState("");
  const [check, setCheck] = useState<Check>({ state: "idle" });

  /** Typing is a new question, so the old answer goes.
   *
   *  This did not matter while the answer was a sentence underneath — a stale
   *  line of text next to a half-typed address reads as stale. It matters now
   *  that the answer is the colour of the field itself: editing under a green
   *  border would leave the new address wearing the old address's verdict,
   *  which is the one thing a colour must never do. */
  function retype(next: string) {
    setAddress(next);
    if (check.state !== "idle") setCheck({ state: "idle" });
  }
  const [hints, setHints] = useState<Suggestion[]>([]);
  // Set the moment a suggestion is taken, so choosing one does not
  // immediately ask Google what it thinks of the text it just wrote.
  const settled = useRef("");

  // ——— Address suggestions ———
  //
  // The field used to be a bare input, which asked somebody to type an
  // address exactly enough for a geocoder to find it, on a phone, to answer
  // a yes/no question. Same source as the finder's search: Google Places,
  // out of the browser, biased to the shop.
  //
  // Debounced, and the in-flight request is aborted as the next letter
  // lands — a slow answer to "3545 W" arriving after the answer to
  // "3545 Wilshire" would overwrite good suggestions with stale ones.
  useEffect(() => {
    const input = address.trim();
    if (input.length < 3 || input === settled.current) {
      setHints([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void suggestAddresses(input, "address", searchBias(SHOPS_CENTRE), controller.signal)
        .then((items) => setHints(items))
        // A failed lookup leaves the field working as a plain input. The
        // Check button geocodes server-side either way, so losing
        // suggestions costs convenience and not the answer.
        .catch(() => setHints([]));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address]);

  useEffect(() => {
    let live = true;
    void fetch("/api/delivery-area")
      .then((response) => (response.ok ? response.json() : { known: false }))
      .then((body: Area | { known: false }) => {
        if (live && body.known) setArea(body);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // The map is built once the shape arrives and torn down with the component.
  // It is deliberately not rebuilt when the theme changes — setOptions swaps
  // the palette in place, the same way the store finder does it, so the
  // polygon and the marker survive a sunset.
  const map = useRef<google.maps.Map | null>(null);
  // The theme at the moment the map is built, then kept current for the
  // effect below. The map is created once; the render value would be stale
  // inside that effect and a dependency on it would rebuild the map.
  const themeRef = useRef(theme);
  useEffect(() => {
    if (!area || !holder.current) return;
    let live = true;
    let cleanup = () => {};

    void (async () => {
      const maps = await loadMaps();
      if (!maps || !live || !holder.current) return;
      const { Map } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;
      if (!live || !holder.current) return;

      // Every patch, as Google wants them: one Polygon with several paths
      // rather than several Polygons, so the overlap between two patches that
      // do touch is painted once instead of twice.
      const loops = area.outline ?? area.rings ?? (area.ring ? [area.ring] : []);
      const paths = loops.map((loop) => loop.map(([lat, lng]) => ({ lat, lng })));
      const instance = new Map(holder.current, {
        disableDefaultUI: true,
        keyboardShortcuts: false,
        clickableIcons: false,
        gestureHandling: "greedy",
        center: { lat: area.centre[0], lng: area.centre[1] },
        zoom: 10,
        // The app's own map, like the other two. This one shipped with no
        // styles at all — Google's stock blue-and-grey, hotel ratings and
        // restaurant pins, inside a cream-and-olive app — which is the same
        // thing the pin picker was fixed for and this page was missed on.
        //
        // Read from a ref rather than the render value for the same reason
        // PinPicker does: the map is built once and the theme is applied again
        // by the effect below when it changes.
        styles: MAP_STYLE[themeRef.current],
      });
      map.current = instance;

      const shape = new maps.Polygon({
        paths,
        // Brand red at a tenth, with a readable edge. The fill has to sit
        // under street names without erasing them — a coverage map somebody
        // cannot read the streets of does not tell them whether they are in
        // it — so the boundary does the work and the fill only tints.
        strokeColor: "#be1923",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#be1923",
        fillOpacity: 0.1,
        clickable: false,
      });
      shape.setMap(instance);

      // A pin per counter, because the shape is a reach around each of them.
      // One pin on a map this wide invites the wrong reading — that a single
      // shop drives to the far edge — when the truth is the opposite and is
      // the good news: wherever somebody is inside this, a counter is nearer
      // than the outline suggests.
      const pins = area.origins.map(
        (point) =>
          new maps.Marker({
            position: { lat: point[0], lng: point[1] },
            map: instance,
            title: "Corner Bagel",
            // The shop's own pin, the same one /locations draws — red with the
            // bagel mark in wheat, from mapEngine.ts. It was Google's default
            // teardrop here, which on a map of where *this shop* delivers reads
            // as a dropped search result rather than as a counter.
            //
            // Anchored at the point of the teardrop so the pin sits on its
            // coordinate rather than hovering above it.
            icon: {
              url: pinDataUri("shop"),
              scaledSize: new maps.Size(PIN_SIZE.width, PIN_SIZE.height),
              anchor: new maps.Point(PIN_SIZE.width / 2, PIN_SIZE.height),
            },
          }),
      );

      // Fit the shape rather than trusting the zoom guess above: the contour
      // is wider east-west than north-south and a fixed zoom crops it on a
      // phone held upright.
      //
      // Re-fit whenever the box changes size, which on a phone it does after
      // the first fit. Two loads of this page were framing the same polygon
      // differently — one cropped tight, one small in a sea of map — because
      // fitBounds ran against whatever height the container had at that
      // instant, and then iOS collapsed its URL bar and the container grew
      // under a zoom computed for the old one. The container has a fixed
      // aspect ratio now, which removes most of that, and this catches the
      // rest: rotation, a split view, a keyboard opening.
      const bounds = new maps.LatLngBounds();
      // Every patch, so two lobes both fit rather than the map framing one.
      paths.forEach((loop) => loop.forEach((point) => bounds.extend(point)));
      const fit = () => instance.fitBounds(bounds, 24);
      fit();

      const watcher = new ResizeObserver(fit);
      watcher.observe(holder.current);

      cleanup = () => {
        watcher.disconnect();
        shape.setMap(null);
        pins.forEach((marker) => marker.setMap(null));
        map.current = null;
      };
    })();

    return () => {
      live = false;
      cleanup();
    };
  }, [area]);

  // Follow the theme without rebuilding the map. setOptions swaps the basemap
  // and leaves the polygon and the pins, which are separate objects on it.
  useEffect(() => {
    themeRef.current = theme;
    map.current?.setOptions({ styles: MAP_STYLE[theme] });
  }, [theme]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const query = address.trim();
    if (!query) return;
    setHints([]);
    setCheck({ state: "asking" });
    try {
      const response = await fetch("/api/delivery-area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query }),
      });
      const body = await response.json();
      if (!response.ok) setCheck({ state: "failed" });
      else if (!body.known) setCheck({ state: "unsure" });
      else
        setCheck({ state: "answered", inRange: Boolean(body.inRange) });
    } catch {
      setCheck({ state: "failed" });
    }
  }

  // True in range, false out of it, null while there is nothing to say. The
  // field and the sentence both read this, so they cannot disagree.
  const answer = check.state === "answered" ? check.inRange : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* The map, or nothing. A grey box captioned "map unavailable" is worse
          than the address check standing on its own — the check is the part
          that answers the question. */}
      {area ? (
        <div
          ref={holder}
          data-theme={theme}
          // Fills what the column has left rather than claiming a fixed
          // ratio. The ResizeObserver below re-fits the polygon whenever that
          // changes, so the shape is framed correctly at any height.
          className="min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-line"
          role="img"
          aria-label={t("deliveryArea.mapLabel", { miles: String(area.radiusMiles) })}
        />
      ) : null}

      <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            value={address}
            onChange={(event) => retype(event.target.value)}
            placeholder={t("deliveryArea.placeholder")}
            aria-label={t("deliveryArea.placeholder")}
            autoComplete="street-address"
            // ——— The field is the answer ———
            //
            // Green inside the zone, red outside it, and the resting colours
            // the rest of the time. The sentence underneath says the same
            // thing in words and is what a screen reader gets — colour is the
            // fast read, not the only one, because a red field and a green
            // field are the same field to somebody who cannot tell them apart.
            //
            // focus:border-ink is dropped on an answered field on purpose. Ink
            // on focus would repaint the verdict away the moment somebody
            // tapped back into the box to read what they had typed.
            className={`w-full rounded-xl border px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter ${
              answer === null
                ? "border-line-soft bg-surface focus:border-ink"
                : answer
                  ? "border-good-ink bg-good"
                  : "border-brand-red bg-bad"
            }`}
          />
          {/* Suggestions, over the Check button rather than pushing it down
              the page — a list that moves the control you are aiming at is a
              list that makes you miss. */}
          {hints.length > 0 ? (
            <ul className="absolute inset-x-0 top-full z-10 m-0 mt-1 list-none overflow-hidden rounded-xl border border-line bg-surface p-0 shadow-lg">
              {hints.map((hint) => (
                <li key={hint.id} className="border-b border-line-faint last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      const picked = [hint.primary, hint.secondary].filter(Boolean).join(", ");
                      settled.current = picked;
                      retype(picked);
                      setHints([]);
                    }}
                    className="cb-press block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-raise"
                  >
                    <span className="block truncate text-[14px] text-ink">{hint.primary}</span>
                    {hint.secondary ? (
                      <span className="block truncate text-[12px] text-muted">
                        {hint.secondary}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={check.state === "asking" || !address.trim()}
          className="cb-press shrink-0 cursor-pointer rounded-xl bg-primary px-5 py-3 text-[15px] font-medium text-on-primary transition-opacity disabled:cursor-default disabled:opacity-[var(--cb-disabled)]"
        >
          {check.state === "asking" ? t("deliveryArea.checking") : t("deliveryArea.check")}
        </button>
      </form>

      {/* The answer, and only the answer.
          It used to read "Yes, 4101 5th St, Los Angeles, CA 90020, USA is 1.4
          miles out." — which reads the address back off the field directly
          above it, and gives a distance nobody asked for to answer a yes or no
          question. Both were there because they were available, not because
          anybody needed them. */}
      {/* role="status", so the answer to something that took a round trip is
          announced rather than only appearing. */}
      {answer !== null ? (
        <p
          role="status"
          className={`m-0 text-[14px] font-medium leading-[1.5] ${
            answer ? "text-good-ink" : "text-brand-red"
          }`}
        >
          {answer ? t("deliveryArea.yes") : t("deliveryArea.no")}
        </p>
      ) : null}
      {check.state === "unsure" ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted">{t("deliveryArea.unsure")}</p>
      ) : null}
      {check.state === "failed" ? (
        <p className="m-0 text-[14px] leading-[1.5] text-muted">{t("deliveryArea.failed")}</p>
      ) : null}
    </div>
  );
}
