"use client";

import { useEffect, useRef, useState } from "react";
import { loadMaps } from "../../googleMapsPublic";
import { locateMe, searchBias, type Fix } from "../../geolocate";
import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { Button } from "../../ui/Button";
import { pinDataUri } from "./mapEngine";
import { PIN_STYLE } from "./mapStyle";
import { useResolvedTheme } from "../../theme";
import { suggestAddresses, type Suggestion } from "../../googleMapsPublic";
import { DELIVERY_ORIGIN, DELIVERY_RADIUS_MILES } from "./locations";

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

// The look of anything floating on the map. The same string the finder uses,
// and the reason it is a constant there applies twice as hard now that two
// screens draw controls over a basemap: three controls describing the same
// object separately are three controls that drift apart.
const CHROME =
  "border border-map-chrome-edge bg-map-chrome shadow-[var(--cb-map-chrome-shadow)]";

/** Metres. Below this a settle is treated as the same spot and no lookup
 *  fires — a map settling twice after one flick is not two questions. */
const SAME_SPOT_METRES = 12;

/** How long the map has to sit still before its centre counts as a choice. */
const SETTLE_MS = 350;

export type PinResult = {
  point: [number, number];
  /** What Google calls this spot. May be empty — the pin still stands. */
  address: string;
  placeId?: string;
  /** Apartment, suite, floor. The part of an address no geocoder can know. */
  unit: string;
  /** "Entrance on Ardmore", "gate code 4432". For the courier, not the kitchen. */
  instructions: string;
  inRange: boolean;
  miles: number | null;
};

/** One of the places Google recognises around the pin. */
export type NearbyPlace = { address: string; placeId?: string };

type Lookup =
  | { at: "idle" }
  | { at: "asking" }
  | { at: "known"; inRange: boolean; miles: number | null }
  | { at: "nowhere" };

function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}


/** The zoom a fix of this quality has earned.
 *
 *  18 is door level. A coarse fix — iOS with Precise Location off, or a
 *  tower fallback — gets a wider frame rather than a false close-up: zooming
 *  to 18 on a kilometre-wide answer shows one roof with great confidence and
 *  no reason for it. Between the two, the radius decides, because a 90m fix
 *  is neither a doorway nor a district. */
function zoomFor(fix: Fix): number {
  if (fix.coarse) return 15;
  return fix.accuracyMeters <= 30 ? 18 : 17;
}

export default function PinPicker({
  start,
  startAddress,
  startFix,
  onConfirm,
  onCancel,
}: {
  /** Where to open the map. A typed address, a GPS fix, or the shop. */
  start: [number, number];
  /** What that starting point was called, so the label is not blank on open. */
  startAddress?: string;
  /** ——— The platform's own answer about where the phone is ———
   *
   *  Present when this screen was opened by pressing "Use my location" rather
   *  than by resolving a typed address. It carries the accuracy radius, which
   *  is the one thing iOS will tell us about its own working: Core Location
   *  fuses GPS, wifi, cell and the motion coprocessor into a single number, and
   *  that number is a far better guide to how much to trust the starting point
   *  than the coordinates are on their own.
   *
   *  Two things read it. The opening zoom, so a fix good to eight metres opens
   *  on the doorway and a fix good to a kilometre opens on the neighbourhood
   *  rather than showing one roof with unearned confidence. And the circle,
   *  which draws the radius the phone claimed so the size of the question is
   *  visible rather than described.
   *
   *  It was being collected and thrown away: the finder measured all of this,
   *  handed over the coordinates, and this screen opened at a fixed zoom 18
   *  with nothing on it. */
  startFix?: Fix;
  onConfirm: (result: PinResult) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const theme = useResolvedTheme();
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const youRef = useRef<google.maps.Marker | null>(null);
  const haloRef = useRef<google.maps.Circle | null>(null);
  const centreRef = useRef<[number, number]>(start);
  const askedAtRef = useRef<[number, number] | null>(null);
  // The theme at the moment the map is built. A ref because the mount effect
  // reads it once and must not re-run when it changes.
  const themeRef = useRef(theme);
  // Always "idle", even when a starting address was handed in. That address
  // came from somewhere else and its range has not been checked against this
  // point, so it is a label to show and not a verdict to trust; the first
  // settle replaces it with one that has been.
  const [lookup, setLookup] = useState<Lookup>({ at: "idle" });
  // The places around the pin, and which of them is being used as its name.
  //
  // ——— This list is not the old one ———
  //
  // The finder used to show exactly this after a locate, and it was removed
  // for a good reason: there, the list *was* the answer, so picking the wrong
  // row sent a courier to the wrong door and there was nothing else to correct
  // it with.
  //
  // Here the pin has already answered. These are names for a point that is
  // fixed, which is a question somebody can answer from a list because getting
  // it wrong costs a label rather than a destination. It is also the fastest
  // way to say "the building, not the shop on its ground floor" — one tap,
  // where nudging a pin cannot express it at all.
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [chosen, setChosen] = useState<NearbyPlace | null>(
    startAddress ? { address: startAddress } : null,
  );
  const [unit, setUnit] = useState("");
  const [instructions, setInstructions] = useState("");
  const label = chosen?.address ?? "";
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
      .then(
        (
          body: {
            places?: NearbyPlace[];
            address?: string;
            inRange?: boolean;
            miles?: number | null;
          } | null,
        ) => {
          // Only if the map has not moved on since. A slow lookup landing
          // after a later pan would put the wrong street under the pin.
          if (askedAtRef.current !== point) return;
          const places = (body?.places ?? []).filter((place) => place?.address);
          setNearby(places);

          if (places.length === 0) {
            setLookup({ at: "nowhere" });
            // The name is only cleared once the pin has left where it started.
            //
            // At the starting point the caller's address is the best name this
            // spot has — it framed the screen, and it is what the fallback
            // uses when the map could not load at all. Blanking it because the
            // geocoder had nothing to add would throw away a good typed
            // address on a lookup that found nothing.
            //
            // Once the pin has moved, that name is about somewhere else, and
            // keeping it would be labelling one point with another's address.
            if (metresBetween(start, point) >= SAME_SPOT_METRES) setChosen(null);
            return;
          }

          // The nearest is selected, and the rest are one tap away. Selecting
          // for somebody is only safe because the selection names a point they
          // already fixed — it cannot move the destination, only mislabel it,
          // and the list is right there.
          setChosen(places[0]);
          setLookup({
            at: "known",
            inRange: body?.inRange !== false,
            miles: typeof body?.miles === "number" ? body.miles : null,
          });
        },
      )
      .catch(() => {
        if (askedAtRef.current === point) setLookup({ at: "nowhere" });
      });
  }

  /** Where the phone thinks it is, and how sure it is about that.
   *
   *  A dot for the position and a circle for the radius, so the fix and the
   *  pin are visibly two different things and the size of the doubt is on
   *  screen rather than in a sentence. The circle is in metres, so it grows
   *  and shrinks with the map exactly as the uncertainty it stands for does.
   *
   *  Skipped under 40m, where the circle would be smaller than the dot and
   *  draw as a smudge around it — a fix that good does not need its
   *  uncertainty illustrated. Same threshold the finder's map uses. */
  function showMe(fix: Fix) {
    const map = mapRef.current;
    const maps = window.google?.maps;
    if (!map || !maps) return;
    const position = { lat: fix.point[0], lng: fix.point[1] };

    youRef.current?.setMap(null);
    haloRef.current?.setMap(null);
    haloRef.current = null;

    if (fix.accuracyMeters > 40) {
      haloRef.current = new maps.Circle({
        map,
        center: position,
        radius: fix.accuracyMeters,
        strokeColor: "#1a73e8",
        strokeOpacity: 0.35,
        strokeWeight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.12,
        clickable: false,
        zIndex: 0,
      });
    }

    youRef.current = new maps.Marker({
      map,
      position,
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
        //
        // Unless the phone has said how sure it is, in which case it decides:
        // see zoomFor. A typed address has no fix and keeps the 18, which is
        // right — a geocoded address is a building, and the question is which
        // door of it.
        zoom: startFix ? zoomFor(startFix) : 18,
        disableDefaultUI: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        keyboardShortcuts: false,
        // The app's palette, with the landmarks the finder hides. See
        // PIN_STYLE in mapStyle.ts.
        //
        // Two passes to get here. It shipped with no styles at all — Google's
        // stock blue-and-grey with hotel ratings and restaurant pins, inside a
        // cream-and-olive app. Adopting the finder's style fixed that and cost
        // the landmarks, which on this screen are not clutter: the street name
        // places the block and the tofu house on the corner is how somebody
        // knows which side of it they live on. A tower has one address on the
        // map and four sides in real life.
        //
        // So the picker gets the palette and the names, without the coloured
        // icons that made it look like somebody else's product.
        styles: PIN_STYLE[themeRef.current],
      });
      mapRef.current = map;
      setMapState("ready");

      // The dot goes down with the map when this screen was opened from a
      // fix. Without it the pin sits over the visitor's roof with nothing
      // saying so, and pressing the locate button — which does exactly what
      // has already been done — is the only way to find out the phone was ever
      // asked.
      if (startFix) showMe(startFix);

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
    // Deliberately empty. `start`, `locale`, `ask` and the theme are all read
    // once, for the first paint: the theme is applied by the effect below
    // rather than by rebuilding, and re-running this on any of them would
    // throw away a map somebody is aiming and snap their pin back to the
    // starting frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light and dark, without rebuilding. setOptions swaps the style array on a
  // live map, which is what lets the picker follow the app the way the finder
  // does.
  useEffect(() => {
    themeRef.current = theme;
    mapRef.current?.setOptions({ styles: PIN_STYLE[theme] });
  }, [theme]);

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
      map.setZoom(zoomFor(result.fix));
      showMe(result.fix);
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

  /** Moves the map — and so the pin — to a place picked from the search.
   *
   *  panTo rather than a re-centre without animation: the pin does not move
   *  on screen, so a jump gives no sense of having travelled, and somebody who
   *  mis-taps a suggestion has nothing to undo by eye. */
  function goTo(point: [number, number]) {
    const map = mapRef.current;
    if (!map) {
      // No map to move. The point still becomes the destination, which is the
      // same fallback the rest of this screen takes.
      centreRef.current = point;
      ask(point);
      return;
    }
    map.panTo({ lat: point[0], lng: point[1] });
    map.setZoom(18);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search, above the map rather than on a screen before it.
          They were two steps: find the address, then confirm the pin. One
          screen is better because the two are one act — you type a street, you
          see the pin land, you nudge it. Splitting them means backing out of
          the map to fix a typo. */}
      <div className="relative z-30 mb-3 shrink-0">
        <PinSearch onPick={goTo} />
      </div>

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

        {/* The same controls as the store finder, in the same place and the
            same shell — see CHROME. Two maps in one app whose buttons sit at
            different corners in different colours are two maps somebody has to
            learn separately. */}
        <button
          type="button"
          onClick={goToMe}
          disabled={mapState !== "ready" || locating}
          aria-label={t("finder.useMyLocation")}
          aria-busy={locating}
          className={`cb-press absolute end-4 top-4 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60 ${CHROME}`}
        >
          <CrosshairIcon spinning={locating} />
        </button>

        {/* Zoom, stacked under the locate button exactly as on the finder.
            It was missing here, and it is the one control this screen needs
            most: "zoom in to be exact" is the instruction printed under the
            map, and on a desktop there was no way to follow it. */}
        <div
          className={`absolute end-4 top-[68px] z-20 flex w-11 flex-col overflow-hidden rounded-xl ${CHROME}`}
        >
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) map.setZoom((map.getZoom() ?? 18) + 1);
            }}
            disabled={mapState !== "ready"}
            aria-label={t("finder.zoomIn")}
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-ink transition-colors hover:bg-raise disabled:cursor-default disabled:opacity-60"
          >
            +
          </button>
          <span aria-hidden className="h-px w-full bg-map-chrome-edge" />
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) map.setZoom((map.getZoom() ?? 18) - 1);
            }}
            disabled={mapState !== "ready"}
            aria-label={t("finder.zoomOut")}
            className="flex h-11 cursor-pointer items-center justify-center text-[22px] leading-none text-ink transition-colors hover:bg-raise disabled:cursor-default disabled:opacity-60"
          >
            &minus;
          </button>
        </div>
      </div>

      {/* Under the map: what is there, and the two ways out. */}
      <div className="shrink-0 pt-4">
        <p className="m-0 text-[12px] uppercase tracking-[0.08em] text-faint">
          {t("pin.deliverTo")}
        </p>
        {/* The places around the pin, nearest first, with the nearest picked.

            One row when Google only knows one thing here, which is the common
            case on a residential street and reads as a plain label rather than
            a choice. Several when the pin is on a block with a tower on it,
            which is where the old flow went wrong: 3545 Wilshire and 637 S
            Ardmore are the same building from two streets, and only the person
            who lives there knows which one their post comes to.

            Radios, not a dropdown. Two or three addresses are worth seeing at
            once — the whole point is comparing them — and a closed control
            would hide the alternative behind a tap on the one screen where
            noticing it matters.

            Never the em dash and the list together: when there is nothing
            here, the red line below is the message. */}
        {nearby.length > 0 ? (
          <ul
            className="m-0 mt-1 list-none p-0"
            role="radiogroup"
            aria-label={t("pin.nearbyPlaces")}
          >
            {nearby.map((place) => {
              const active = place.address === label;
              return (
                <li key={place.address}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setChosen(place)}
                    className="cb-press flex w-full cursor-pointer items-start gap-2.5 py-2 text-start"
                  >
                    <span
                      aria-hidden
                      className={`mt-[3px] h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                        active ? "border-ink bg-ink" : "border-line-mute"
                      }`}
                      style={
                        active
                          ? { boxShadow: "inset 0 0 0 2.5px var(--cb-surface)" }
                          : undefined
                      }
                    />
                    <span
                      className={`min-w-0 text-[15px] leading-[1.35] ${
                        active ? "text-ink" : "text-muted"
                      }`}
                    >
                      {place.address}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 mt-1 min-h-[42px] text-[15px] leading-[1.4] text-ink">
            {lookup.at === "asking" ? (
              <span className="text-muted">{t("pin.checking")}</span>
            ) : label ? (
              label
            ) : (
              <span className="text-quiet">&mdash;</span>
            )}
          </p>
        )}

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
              ? t("pin.outOfRangeMiles", {
                  miles: lookup.miles.toFixed(1),
                  // The rule, not the number ten. This sentence had "10"
                  // written into it in all ten languages, so changing the
                  // radius would have left every locale quoting the old one
                  // at the exact moment somebody was being refused by the new.
                  radius: DELIVERY_RADIUS_MILES,
                })
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

        {/* The two things no map and no geocoder can know.
            Asked here rather than at checkout because this is the moment
            somebody is looking at a picture of their own building, which is
            when "the entrance is on Ardmore" is actually in mind. Checkout
            prefills from these and can still change them — a one-off "leave it
            with the neighbour" is about an order, not about an address. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">{t("delivery.unit")}</span>
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              maxLength={60}
              autoComplete="address-line2"
              placeholder={t("delivery.unitPlaceholder")}
              className="w-full rounded-xl border border-line-soft bg-surface px-4 py-2.5 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">
              {t("pin.instructions")}
            </span>
            <input
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={140}
              placeholder={t("pin.instructionsPlaceholder")}
              className="w-full rounded-xl border border-line-soft bg-surface px-4 py-2.5 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
            />
          </label>
        </div>

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
                placeId: chosen?.placeId,
                unit: unit.trim(),
                instructions: instructions.trim(),
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

// The address field above the map.
//
// Google Places autocomplete straight out of the browser through the library
// the map already loaded — no hop through our own server on a keystroke. See
// suggestAddresses in googleMapsPublic.ts, which falls back to /api/geo when
// the library did not load.
//
// ——— What picking a suggestion does, and does not, do ———
//
// It moves the camera. That is all. The suggestion's coordinates are Google's
// idea of where those words are, which is the guess this whole screen exists
// to stop trusting — so they frame the map and the pin still decides. Somebody
// who types their own street and taps Confirm without moving anything has
// accepted that guess deliberately, which is a different thing from never
// having been shown it.
function PinSearch({ onPick }: { onPick: (point: [number, number]) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // The suggestions, and the query they belong to, in one piece of state.
  //
  // Two, and the pairing is only true between renders — which is the bug this
  // shape prevents: a slow answer for "3545 W" arriving after the field reads
  // "3545 Wilshire" would render one list under the other's text. Keeping them
  // together means the render can ask "are these for what is typed now?" and
  // that question is answerable, rather than having to be cleared by an effect
  // racing the same response.
  const [found, setFound] = useState<{ forQuery: string; items: Suggestion[] }>({
    forQuery: "",
    items: [],
  });

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 3) return;
    const controller = new AbortController();
    // A pause, not a request per character. Places bills per session and per
    // keystroke is a lot of both.
    const timer = window.setTimeout(() => {
      void suggestAddresses(typed, "address", searchBias(DELIVERY_ORIGIN.position), controller.signal)
        .then((items) => {
          setFound({ forQuery: typed, items });
          setOpen(true);
        })
        .catch(() => {
          // Aborted, or Places refused. An empty list is the honest render
          // and the field still works — the map is the way to be precise.
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function pick(suggestion: Suggestion) {
    setQuery(suggestion.primary);
    setOpen(false);
    // Resolved on the server, like every other address in this app: a
    // coordinate that came through the browser is a coordinate the browser
    // can change, and this one frames a delivery.
    const response = await fetch("/api/geo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", placeId: suggestion.id, kind: "address" }),
    }).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) : null;
    if (typeof body?.lat === "number" && typeof body?.lng === "number") {
      onPick([body.lat, body.lng]);
    }
  }

  const typed = query.trim();
  // Only ever the list that belongs to what is on screen. Nothing has to be
  // cleared, so nothing can be cleared late.
  const suggestions = found.forQuery === typed && typed.length >= 3 ? found.items : [];
  const showing = open && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        aria-label={t("pin.searchLabel")}
        placeholder={t("pin.searchPlaceholder")}
        className="w-full rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-quieter focus:border-ink"
      />
      {showing ? (
        <ul
          role="listbox"
          aria-label={t("pin.searchLabel")}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-40 m-0 max-h-[240px] list-none overflow-y-auto rounded-xl border border-line-faint bg-panel p-1 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => void pick(suggestion)}
                className="cb-press block w-full cursor-pointer rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-raise"
              >
                <span className="block text-[14px] text-ink">{suggestion.primary}</span>
                <span className="block text-[12px] text-muted">{suggestion.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
