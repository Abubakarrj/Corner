"use client";

import { useEffect, useRef, useState } from "react";
import { loadMaps, suggestAddresses, type Suggestion } from "../../googleMapsPublic";
import { DELIVERY_ORIGIN } from "../locations/locations";
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
  ring: [number, number][];
  origin: [number, number];
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
      void suggestAddresses(input, "address", DELIVERY_ORIGIN.position, controller.signal)
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
  useEffect(() => {
    if (!area || !holder.current) return;
    let live = true;
    let cleanup = () => {};

    void (async () => {
      const maps = await loadMaps();
      if (!maps || !live || !holder.current) return;
      const { Map } = (await maps.importLibrary("maps")) as google.maps.MapsLibrary;
      if (!live || !holder.current) return;

      const path = area.ring.map(([lat, lng]) => ({ lat, lng }));
      const instance = new Map(holder.current, {
        disableDefaultUI: true,
        keyboardShortcuts: false,
        clickableIcons: false,
        gestureHandling: "greedy",
        center: { lat: area.origin[0], lng: area.origin[1] },
        zoom: 10,
      });
      map.current = instance;

      const shape = new maps.Polygon({
        paths: path,
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

      const pin = new maps.Marker({
        position: { lat: area.origin[0], lng: area.origin[1] },
        map: instance,
        title: "Corner Bagel",
      });

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
      path.forEach((point) => bounds.extend(point));
      const fit = () => instance.fitBounds(bounds, 24);
      fit();

      const watcher = new ResizeObserver(fit);
      watcher.observe(holder.current);

      cleanup = () => {
        watcher.disconnect();
        shape.setMap(null);
        pin.setMap(null);
        map.current = null;
      };
    })();

    return () => {
      live = false;
      cleanup();
    };
  }, [area]);

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
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t("deliveryArea.placeholder")}
            aria-label={t("deliveryArea.placeholder")}
            autoComplete="street-address"
            className="w-full rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
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
                      setAddress(picked);
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
      {check.state === "answered" ? (
        <p className="m-0 text-[14px] leading-[1.5] text-ink">
          {check.inRange ? t("deliveryArea.yes") : t("deliveryArea.no")}
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
