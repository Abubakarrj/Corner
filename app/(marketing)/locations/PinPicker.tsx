"use client";

import { useEffect, useRef, useState } from "react";
import { loadMaps } from "../../googleMapsPublic";
import { locateMe } from "../../geolocate";
import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { Button } from "../../ui/Button";
import { pinDataUri } from "./mapEngine";

// Where the courier actually goes, placed by the person who lives there.
//
// ——— The problem this exists to end ———
//
// A delivery was an address string. Every stage that needed a position
// geocoded those words again — the range check, the courier quote, and Uber
// once more at its end — so one doorway was guessed at three times by three
// systems, and none of the guesses belonged to the customer.
//
// Geocoding is very good at blocks and only fair at doors. "3545 Wilshire
// Blvd" in Koreatown sits on a building whose registered entrance is round the
// corner on Ardmore: right block, wrong street, and a courier walking a
// perimeter with a bag going cold. No amount of sorting candidates fixes that,
// because the information needed — which door is yours — is not in the data.
// It is in the customer's head.
//
// So this asks them. The map opens on the best guess available and they nudge
// it; the point they leave it on is the destination from then on, and nothing
// downstream re-derives it from words.
//
// ——— Why the pin does not move ———
//
// The pin is fixed at the centre of the frame and the map slides underneath
// it. That is the pattern every delivery app converged on, and the reason is
// physical: a pin you drag is a pin your thumb is covering at the exact moment
// you need to see where it landed. A fixed pin keeps the target visible and
// turns placing it into panning, which is the gesture the map already teaches.
//
// It also means there is no "did I grab it?" state to design, no drag handle
// to hit, and one obvious way to be precise — zoom in.
//
// ——— What it costs, and what it does not ———
//
// One reverse geocode per settle, debounced, and skipped entirely when the
// centre has barely moved. Panning across a city is a handful of calls, not
// one per frame.
//
// It never *blocks* on that lookup. The address underneath is a label being
// filled in; the pin is already the answer, so Confirm stays live while the
// words are still arriving. A screen that greys out its own button while it
// asks Google what a street is called is a screen that has forgotten which of
// the two things it is holding is the real one.

/** Metres. Below this a settle is treated as the same spot and no lookup
 *  fires — a map settling twice after one flick is not two questions. */
const SAME_SPOT_METRES = 12;

/** How long the map has to sit still before its centre counts as a choice. */
const SETTLE_MS = 350;

export type PinResult = {
  point: [number, number];
  /** What Google calls this spot. May be empty — the pin still stands. */
  address: string;
  inRange: boolean;
  miles: number | null;
};

type Lookup =
  | { at: "idle" }
  | { at: "asking" }
  | { at: "known"; address: string; inRange: boolean; miles: number | null }
  | { at: "nowhere" };

function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

export default function PinPicker({
  start,
  startAddress,
  onConfirm,
  onCancel,
}: {
  /** Where to open the map. A typed address, a GPS fix, or the shop. */
  start: [number, number];
  /** What that starting point was called, so the label is not blank on open. */
  startAddress?: string;
  onConfirm: (result: PinResult) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const youRef = useRef<google.maps.Marker | null>(null);
  const centreRef = useRef<[number, number]>(start);
  const askedAtRef = useRef<[number, number] | null>(null);
  // Always "idle", even when a starting address was handed in. That address
  // came from somewhere else and its range has not been checked against this
  // point, so it is a label to show and not a verdict to trust; the first
  // settle replaces it with one that has been.
  const [lookup, setLookup] = useState<Lookup>({ at: "idle" });
  const [label, setLabel] = useState(startAddress ?? "");
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  // ——— Three states, and the third one matters ———
  //
  // "unavailable" is the map failing to load: no browser key on the
  // deployment, a blocked script, a network that dropped the bootstrap.
  //
  // The first cut had two states and treated anything that was not ready as
  // not ready, which meant Confirm was disabled forever on a page where
  // nothing would ever change that. A customer with a perfectly good address
  // could not order a delivery, and the screen did not say why — the worst
  // shape a failure can take, because it looks like the button is broken
  // rather than like the map is.
  //
  // So a map that cannot load is not a wall. It falls back to the point that
  // framed this screen — the address they typed, or their GPS fix — which is
  // exactly what the destination would have been before the picker existed.
  // Less precise, and precise was never the promise when there is no map to
  // be precise on.
  const [mapState, setMapState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );

  // ——— Asking what is under the pin ———
  //
  // One round trip that both names the spot and says whether we deliver to it,
  // because they are the same question asked of the same point and two calls
  // would let them disagree.
  function ask(point: [number, number]) {
    const previous = askedAtRef.current;
    if (previous && metresBetween(previous, point) < SAME_SPOT_METRES) return;
    askedAtRef.current = point;
    setLookup({ at: "asking" });
    void fetch("/api/geo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pin", point }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { address?: string; inRange?: boolean; miles?: number | null } | null) => {
        // Only if the map has not moved on since. A slow lookup landing after
        // a later pan would put the wrong street under the pin.
        if (askedAtRef.current !== point) return;
        if (!body?.address) {
          setLookup({ at: "nowhere" });
          // The label is only cleared once the pin has left where it started.
          //
          // At the starting point the caller's address is the best name this
          // spot has — it is what framed the screen, and it is what the
          // fallback uses when the map could not load at all. Blanking it
          // because the geocoder had nothing to add would throw away a good
          // typed address on a lookup that found nothing.
          //
          // Once the pin has moved, that name is about somewhere else, and
          // keeping it would be labelling one point with another's address.
          if (metresBetween(start, point) >= SAME_SPOT_METRES) setLabel("");
          return;
        }
        setLabel(body.address);
        setLookup({
          at: "known",
          address: body.address,
          inRange: body.inRange !== false,
          miles: typeof body.miles === "number" ? body.miles : null,
        });
      })
      .catch(() => {
        if (askedAtRef.current === point) setLookup({ at: "nowhere" });
      });
  }

  // ——— The map ———
  //
  // Mounted once. The language is a bootstrap parameter for the whole library
  // (see googleMapsPublic.ts), so it is read at mount and not tracked: a
  // language switch while the picker is open would mean throwing the library
  // away underneath a map somebody is aiming.
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    let live = true;
    let listeners: google.maps.MapsEventListener[] = [];
    let settle: number | undefined;

    void loadMaps(localeById(locale).tag).then((maps) => {
      if (!live) return;
      if (!maps || !holderRef.current) {
        setMapState("unavailable");
        // The lookup still runs. Without a map the starting point is the
        // answer, and knowing whether we deliver there is the one thing this
        // screen can still find out.
        ask(centreRef.current);
        return;
      }
      const map = new maps.Map(holderRef.current, {
        center: { lat: start[0], lng: start[1] },
        // 18 is door-level: individual buildings, driveways, which side of the
        // street. Opening lower would be asking somebody to be precise about
        // something they cannot see yet.
        zoom: 18,
        disableDefaultUI: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        // Google's own POI labels stay on here, unlike the store finder's
        // quiet basemap. This map is for recognising your own building, and
        // the pharmacy on the corner is exactly how somebody does that.
        keyboardShortcuts: false,
      });
      mapRef.current = map;
      setMapState("ready");

      listeners = [
        // Two events, two jobs. `bounds_changed` fires continuously while the
        // map moves and only lifts the pin; the lookup waits for `idle`, which
        // is Google's own "the camera has stopped".
        maps.event.addListener(map, "bounds_changed", () => {
          setMoving(true);
          window.clearTimeout(settle);
        }),
        maps.event.addListener(map, "idle", () => {
          setMoving(false);
          const centre = map.getCenter();
          if (!centre) return;
          const point: [number, number] = [centre.lat(), centre.lng()];
          centreRef.current = point;
          window.clearTimeout(settle);
          settle = window.setTimeout(() => ask(point), SETTLE_MS);
        }),
      ];
    });

    return () => {
      live = false;
      window.clearTimeout(settle);
      listeners.forEach((listener) => listener.remove());
      mapRef.current = null;
    };
    // start and locale are read once, on purpose — see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ——— "Use my location" ———
  //
  // Here it only moves the camera, which is the honest use for a GPS fix on
  // this screen. It is not asked to name a building or fill a field; it puts
  // the map over the right roof and the person on it does the last ten metres.
  // That is the difference between the fix being a hint and the fix being an
  // answer, and it is why the earlier version of this could be wrong.
  function goToMe() {
    setLocating(true);
    void locateMe().then((result) => {
      setLocating(false);
      if (!result.ok) return;
      const map = mapRef.current;
      if (!map) return;
      map.panTo({ lat: result.fix.point[0], lng: result.fix.point[1] });
      // A coarse fix — iOS with Precise Location off, or a tower fallback —
      // gets a wider frame rather than a false close-up. Zooming to 18 on a
      // kilometre-wide answer would show one roof with great confidence and no
      // reason for it.
      map.setZoom(result.fix.coarse ? 15 : 18);

      const maps = window.google?.maps;
      if (!maps) return;
      // The blue dot, so the fix and the pin are visibly two different things.
      youRef.current?.setMap(null);
      youRef.current = new maps.Marker({
        map,
        position: { lat: result.fix.point[0], lng: result.fix.point[1] },
        clickable: false,
        zIndex: 1,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#1a73e8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    });
  }

  const outOfRange = lookup.at === "known" && !lookup.inRange;
  // ⚠️ A destination with no words in it cannot be confirmed.
  //
  // The pin is the position and the address is only its label — right up until
  // the label is empty, at which point the order ticket has a blank line where
  // the delivery address goes and the kitchen has nothing to read out to a
  // courier on the phone. Coordinates are not a substitute: "34.0614,
  // -118.3079" printed under "Deliver to" is a number, not an address.
  //
  // Rare in practice. A pin in a courtyard or on a campus still reverse-
  // geocodes to the street it sits on; this is the middle of a park, a lake,
  // or a lookup that failed outright. Moving the pin a few metres fixes all
  // three, which is what the line under the field asks for.
  const noLabel = label.trim().length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line">
        <div ref={holderRef} className="absolute inset-0" />

        {/* The pin, dead centre and untouchable. pointer-events-none is what
            makes the whole frame draggable — a pin that swallows the gesture
            at the one place people put their thumb is a map that fights back.

            The offset is the pin's own anchor: the art is 34 tall and points
            at its bottom edge, so it is lifted a full height to put the tip on
            the centre rather than the middle of the head. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10"
          style={{ transform: "translate(-50%, -100%)" }}
        >
          {/* A background rather than an <img>: the art is a 34x44 inline
              data URI built in mapEngine.ts, so there is nothing for an image
              optimiser to fetch, resize or cache. */}
          <div
            className="h-[44px] w-[34px] bg-contain bg-bottom bg-no-repeat"
            style={{
              backgroundImage: `url("${pinDataUri("shop")}")`,
              // Rises while the map is moving and settles when it stops, which
              // is the one bit of motion this screen needs: it says the pin is
              // hovering over somewhere rather than resting on it.
              transform: moving ? "translateY(-6px)" : "none",
              transition:
                "transform var(--duration-fast) var(--ease-smooth-out)",
            }}
          />
        </div>
        {/* The shadow under the pin, which is what actually reads as height.
            Shrinks as the pin rises. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-[9] h-1.5 rounded-full bg-black/25"
          style={{
            width: moving ? 10 : 14,
            transform: "translate(-50%, -50%)",
            transition: "width var(--duration-fast) var(--ease-smooth-out)",
          }}
        />

        <button
          type="button"
          onClick={goToMe}
          disabled={mapState !== "ready" || locating}
          aria-label={t("finder.useMyLocation")}
          aria-busy={locating}
          className="cb-press absolute end-3 top-3 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[0_6px_20px_rgba(0,0,0,0.12)] disabled:cursor-default disabled:opacity-60"
        >
          <CrosshairIcon spinning={locating} />
        </button>
      </div>

      {/* Under the map: what is there, and the two ways out. */}
      <div className="shrink-0 pt-4">
        <p className="m-0 text-[12px] uppercase tracking-[0.08em] text-faint">
          {t("pin.deliverTo")}
        </p>
        {/* The address, or an em dash. Never the nearest suburb dressed up as
            a doorway — that substitution is the whole class of mistake this
            screen exists to stop, and making it here would be making it in the
            one place the customer is looking straight at it.

            When it is blank the red line below explains what to do, so this
            slot stays a placeholder rather than repeating the sentence. */}
        <p className="m-0 mt-1 min-h-[42px] text-[15px] leading-[1.4] text-ink">
          {lookup.at === "asking" && !label ? (
            <span className="text-muted">{t("pin.checking")}</span>
          ) : label ? (
            label
          ) : (
            <span className="text-quiet">&mdash;</span>
          )}
        </p>

        {/* One line, and the order is the order of consequence.
            Whatever is stopping Confirm goes first, because a disabled button
            with no reason next to it is the thing this screen must never be —
            then the map's own trouble, then the ordinary hint. The map failing
            to load is worth saying and it is never the reason somebody cannot
            continue, so it never outranks one that is. */}
        {noLabel && lookup.at !== "asking" ? (
          <p role="alert" className="m-0 mt-2 text-[13px] leading-[1.5] text-brand-red">
            {t("pin.needsAnAddress")}
          </p>
        ) : outOfRange ? (
          <p role="alert" className="m-0 mt-2 text-[13px] leading-[1.5] text-brand-red">
            {lookup.miles !== null
              ? t("pin.outOfRangeMiles", { miles: lookup.miles.toFixed(1) })
              : t("pin.outOfRange")}
          </p>
        ) : mapState === "unavailable" ? (
          <p className="m-0 mt-2 text-[13px] leading-[1.5] text-muted">
            {t("pin.mapUnavailable")}
          </p>
        ) : (
          <p className="m-0 mt-2 text-[12px] leading-[1.5] text-quiet">
            {t("pin.nudgeHint")}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            {t("common.back")}
          </Button>
          <Button
            // Live while the lookup is still running. The pin is the answer
            // and it already exists; waiting on a label would be making
            // somebody wait for the less important half.
            // Not gated on the map. It is gated on the destination being one
            // we deliver to, which is a fact about the point and not about
            // whether a basemap rendered.
            disabled={mapState === "loading" || outOfRange || noLabel}
            onClick={() =>
              onConfirm({
                point: centreRef.current,
                address: label,
                inRange: !outOfRange,
                miles: lookup.at === "known" ? lookup.miles : null,
              })
            }
            className="flex-[2]"
          >
            {t("pin.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CrosshairIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={spinning ? "animate-spin" : ""}
    >
      <circle cx="10" cy="10" r="4.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 1.4v3.1M10 15.5v3.1M1.4 10h3.1M15.5 10h3.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
