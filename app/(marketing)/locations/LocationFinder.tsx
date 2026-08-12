"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { setFulfillment } from "../../fulfillment";
import { useCapabilities } from "../../capabilities";
import {
  BackIcon,
  CloseIcon,
  IconButtonLink,
} from "../../ui/IconButton";
import CateringModal from "./CateringModal";
import SearchResults, { type ResolvedPlace } from "./SearchResults";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";
import { useLocale, useT, type StringKey } from "../../i18n";
import {
  nearestLocations,
  searchLocations,
  SEARCH_RADIUS_MILES,
  withinBounds,
  type MapBounds,
  type NearbyLocation,
  type StoreLocation,
} from "./locations";
import useStoreLocations from "./useStoreLocations";

// "Pasadena, CA, USA" is how Google names a place and not how anybody says it.
// The first two parts are the town and the state, which is what a sentence
// wants; the country is noise in a banner about a bagel shop.
function shortPlace(address: string): string {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return address;
  return parts.slice(0, 2).join(", ").replace(/\s+\d{5}(-\d{4})?$/, "");
}

// Dressed in the shop's produce palette rather than the reference's own
// greys: deep ink carries the active state, cream is the ground, and the
// rules are the same two border weights the catalog uses. The reference's
// geometry is untouched — only its colours and typeface change, so the
// finder and the pantry read as one product.
const { cream, ink, onInk, border, controlBorder, muted } = PALETTE;

// The Maps library only exists in a browser, and the map component loads its
// script into the document head, so this can only ever be a client-side
// chunk: ssr:false is load-bearing, not a preference. It's also
// the biggest thing on this page by some way, and keeping it out of the
// initial bundle is why the header and the search field are usable before the
// basemap has arrived. The placeholder holds the map's space so nothing
// jumps when it does.
import type { MapFocus } from "./StoreMap";

const StoreMap = dynamic(() => import("./StoreMap"), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1" style={{ background: "var(--cb-raise)" }} />,
});

type Mode = "pickup" | "delivery" | "catering";

const MODES: { id: Mode; label: StringKey }[] = [
  { id: "pickup", label: "finder.pickup" },
  { id: "delivery", label: "finder.delivery" },
  { id: "catering", label: "finder.catering" },
];

// Delivery asks for the visitor's address; the other two search ours. That
// one difference drives the placeholder, the "Search area" button, and the
// empty-state toast.
const PLACEHOLDER: Record<Mode, StringKey> = {
  pickup: "finder.searchPlaceholder",
  delivery: "finder.addressPlaceholder",
  catering: "finder.searchPlaceholder",
};

export default function LocationFinder() {
  const router = useRouter();
  // Home and Menu both open this screen; ?for=menu is how it knows which of
  // them to light in the tab bar. Anything else — a direct visit, the Home
  // tab — reads as Home.
  const activeTab = useSearchParams().get("for") === "menu" ? "menu" : "home";
  const t = useT();
  // Only used as the map's key — see the note where StoreMap is rendered.
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>("pickup");
  // ——— Delivery says what it is doing, rather than disappearing ———
  //
  // Three attempts at this and the middle one was the worst.
  //
  // First the tab was always live, so the failure came at the end: choose
  // Delivery, type your address, wait for a quote, and only then be told it
  // is down. A dead end is least costly at the top of the corridor.
  //
  // Then the tab was hidden when no courier could be booked, which fixed the
  // dead end by removing the door. That reads as a shop that has stopped
  // delivering — and this one hasn't; it is a deployment that is missing
  // three variables. A missing tab cannot say that. A shopkeeper looking at
  // their own app sees a feature they built and paid for simply gone.
  //
  // So the tab stays and answers for itself. Tap it and the strip says
  // delivery is unavailable and pickup is open, which is the whole truth in
  // one line, said before anybody types an address.
  const { delivery: deliveryOn, ready: capabilitiesReady } = useCapabilities();
  // Only once the answer is in. Saying "delivery is unavailable right now"
  // while still asking is telling somebody something about the shop that we do
  // not yet know — and it is the first thing they saw every time.
  const deliveryOff = mode === "delivery" && capabilitiesReady && !deliveryOn;
  const [query, setQuery] = useState("");
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  // Where a searched city, state, or ZIP landed, for the map to fly to.
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // The place that was searched for, once it has coordinates. This is what
  // turns "Beverly Hills" from a word we can't match into a point we can
  // measure from, so the shops shown are the shops actually near it.
  const [searched, setSearched] = useState<{ point: [number, number]; label: string } | null>(
    null,
  );
  const [toastDismissed, setToastDismissed] = useState(false);
  // Set when the browser refuses or fails to give us a position. The locate
  // button used to swallow both cases, on the reasoning that a dialog over a
  // working map is worse than silence. That reasoning holds for the dialog and
  // fails for the silence: pressing a button and having the screen do nothing
  // at all is the single clearest way to make a working feature feel broken.
  // It goes in the bar along the bottom, where every other answer this screen
  // gives already goes.
  const [locateFailed, setLocateFailed] = useState(false);
  // The shop whose catering sheet is up, or null. Catering doesn't open the
  // menu — see CateringModal.
  const [cateringFor, setCateringFor] = useState<StoreLocation | null>(null);

  // Ranked against the searched place when there is one, so the card under
  // your thumb is the nearest shop to what you asked for rather than whichever
  // one happens to be first in the file.
  // The shops, with their pins resolved from their addresses rather than the
  // approximate pair typed beside them. Everything below ranks, filters and
  // frames against this rather than the constant, so a corrected coordinate
  // corrects the distance and the framing too and not just the dot.
  const locations = useStoreLocations();

  const nearby: NearbyLocation[] = useMemo(() => {
    if (mode === "delivery" || !searched) return [];
    return nearestLocations(
      searched.point,
      mode === "catering" ? "catering" : "shop",
      locations,
    );
  }, [mode, searched, locations]);

  // What the search turned up: the pin on the map and the card under it, which
  // are one thing and appear together.
  //
  // Empty until something is asked. The finder opens on a map with nothing on
  // it, and typing is what puts our shop there. Presenting a card offering to
  // take an order, next to a pin, before anybody has searched puts the last
  // step of the flow on top of the first. Delivery always behaved this way;
  // pickup and catering now match it.
  const results: StoreLocation[] = useMemo(() => {
    if (mode === "delivery") return [];

    // "Search area" is a search: an explicit gesture at the map meaning this
    // rectangle, whatever was typed before it.
    if (bounds) {
      return locations.filter(
        (location) =>
          (mode === "catering" ? location.catering === true : location.kind === "shop") &&
          withinBounds(bounds, location.position),
      );
    }

    if (!searched) return [];

    const near = nearby.filter((hit) => hit.miles <= SEARCH_RADIUS_MILES);
    // Nothing in range still shows the closest one rather than an empty map.
    // The banner is what says it isn't nearby; taking the shop away as well
    // would leave somebody who searched a town we don't serve with no way to
    // reach the counter that could still make their order.
    return (near.length > 0 ? near : nearby.slice(0, 1)).map((hit) => hit.location);
  }, [mode, bounds, searched, nearby, locations]);

  // `matching` is the Shops tab in the results: our own locations whose name
  // or address contains what's typed. That is a text search, and it's the
  // only place one belongs.
  const matching: StoreLocation[] = useMemo(() => {
    if (mode === "delivery") return [];
    return searchLocations(query, mode === "pickup" ? "shop" : "catering", locations);
  }, [mode, query, locations]);

  // Choosing a shop: record where the order is going, then open the menu.
  // The shop is inert until this has happened — see the gate in
  // app/shop/layout.tsx — because a bagel picked up in Koreatown and one
  // delivered to an apartment are different orders.
  //
  // This is the Order press — on the card or in the pin's popup. Naming a
  // shop in the search results is a lighter act; see pickFromSearch. Home and
  // Menu behave identically here; the only thing that differs between them is
  // which tab is lit, since they're the same screen reached two ways.
  function chooseLocation(location: StoreLocation) {
    // Catering is a conversation, not a basket. Ordering from a shop under
    // that mode opens the request sheet instead of committing a destination.
    if (mode === "catering") {
      setCateringFor(location);
      return;
    }
    setFulfillment({
      mode: "pickup",
      locationId: location.id,
      label: location.name,
      detail: `${location.address}, ${location.city}`,
    });
    router.push("/shop");
  }

  // Picking a shop out of the search results is not the same act as pressing
  // Order on its card. Under Pickup the two coincide — naming a shop is
  // choosing it — but catering has a step in between: you say which counter
  // you're asking, look at it, then decide. So a catering search result flies
  // the map to that shop and leaves its card under your thumb, and the sheet
  // waits for the Order press.
  function pickFromSearch(location: StoreLocation) {
    if (mode === "catering") {
      // Named a kitchen by name, so land on it with its card open, same as a
      // place search that resolves to it.
      setFocus({ at: location.position, zoom: 16, openId: location.id });
      // The results panel is keyed off the query; emptying it puts the map
      // and the shop's card back in view, which is the thing being pointed at.
      setQuery("");
      return;
    }
    chooseLocation(location);
  }

  // The delivery equivalent: a resolved, in-range address is a destination,
  // so it opens the menu the same way choosing a shop does.
  function chooseAddress(resolved: ResolvedPlace) {
    setFulfillment({ mode: "delivery", address: resolved.address });
    router.push("/shop");
  }

  function changeMode(next: Mode) {
    setMode(next);
    setCateringFor(null);
    setBounds(null);
    setFocus(null);
    setSearched(null);
    setQuery("");
    setToastDismissed(false);
  }

  // A place picked out of the results, for pickup and catering.
  //
  // The map goes to the *shop*, not to the place that was typed. Somebody
  // searching "Beverly Hills" under Pickup is asking where they can collect,
  // and the answer to that is a counter with an address on it. Flying to
  // Beverly Hills and leaving them to find the pin is showing them their own
  // question back.
  //
  // So: measure our shops against what was searched, then land on the nearest
  // one close enough to read the street, with its card open. That card carries
  // the address, the hours and the Order button, which is everything the
  // search was for. When there is nothing of ours at all, the searched place
  // is still better than the country view we were on.
  function lookAt(place: ResolvedPlace) {
    const point: [number, number] = [place.lat, place.lng];
    setSearched({ point, label: place.address });
    setBounds(null);
    setToastDismissed(false);

    const closest = nearestLocations(
      point,
      mode === "catering" ? "catering" : "shop",
      locations,
    )[0];
    setFocus(
      closest
        ? { at: closest.location.position, zoom: 16, openId: closest.location.id }
        : { at: point, zoom: 12 },
    );
  }

  /** "Use my location", which is a search — the same one lookAt() runs for a
   *  typed place, from a point the browser supplies rather than one Google
   *  geocoded.
   *
   *  It used to only pan the map, and that is why it read as broken: the rail
   *  and the pin are keyed off `searched`, so panning left the map over your
   *  street with nothing on it and the bar still asking you to search. Moving
   *  the camera is not answering the question. */
  function locateHere(point: [number, number]) {
    setLocateFailed(false);
    setSearched({ point, label: "" });
    setBounds(null);
    setQuery("");
    setToastDismissed(false);

    const closest = nearestLocations(
      point,
      mode === "catering" ? "catering" : "shop",
      locations,
    )[0];
    setFocus(
      closest
        ? { at: closest.location.position, zoom: 16, openId: closest.location.id }
        : { at: point, zoom: 12 },
    );
  }

  // What the bar along the bottom says, and whether it says anything.
  //
  // Four situations, and they are worth telling apart.
  //
  // Before anything is asked, every mode prompts. Delivery always did; pickup
  // and catering used to skip it because a card was already sitting on the map,
  // and now that the rail waits for a result they need the same nudge.
  //
  // A searched place with nothing of ours near it is an answer, not a prompt,
  // so it names the place asked about and how far the nearest counter is:
  // "no shops here yet" next to a map of Pasadena leaves somebody guessing
  // whether we mean Pasadena or the whole company. An empty map after "Search
  // area" is the fourth, and the old wording is right for it.
  const noun = t(mode === "catering" ? "finder.nounCatering" : "finder.nounShops");
  const missed =
    searched && nearby.length > 0 && nearby[0].miles > SEARCH_RADIUS_MILES ? nearby[0] : null;
  // Whether the visitor has actually asked this screen anything yet.
  const asked =
    mode === "delivery" ? query.trim().length > 0 : searched !== null || bounds !== null;

  const showToast =
    !toastDismissed &&
    (locateFailed ||
      deliveryOff ||
      !asked ||
      missed !== null ||
      (mode !== "delivery" && results.length === 0));

  const toastText = locateFailed
    ? t("finder.locateFailed")
    : deliveryOff
    ? // The endpoint's own words, so the page and the API cannot drift into
      // telling somebody two different things about the same outage.
      t("api.deliveryDownPickupOpen")
    : !asked
    ? mode === "delivery"
      ? t("finder.startAddress")
      : t("finder.startSearch")
    : missed
      ? t("finder.noneHere", {
          noun,
          // Empty when the point came from the browser rather than from a
          // typed place, which has no name to quote back.
          place: shortPlace(searched!.label) || t("finder.aroundYou"),
          name: missed.location.name,
          miles: missed.miles.toFixed(missed.miles < 10 ? 1 : 0),
        })
      : mode === "catering"
        ? t("finder.noCateringYet")
        : t("finder.noShopsYet");

  return (
    // dvh, and the map takes the leftover height — so the header stays put,
    // the nav stays put, and the map absorbs a mobile browser's toolbars
    // coming and going rather than the page growing a scrollbar.
    // cb-app-shell rather than h-dvh — see globals.css. It's the viewport
    // minus the cookie banner, so the shop card and its Order button stay
    // above it. They were underneath it in an in-app browser, on a screen
    // that can't be scrolled to get out of the way.
    <div
      className="cb-app-shell flex w-full flex-col overflow-hidden"
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
    >
      {/* Spacings measured off the reference frame rather than eyeballed: at
          its 440px width the pill row is 34px tall sitting 21px down, the
          rule under the search field lands 116px into the header, and the
          header is 133px overall. */}
      {/* mx-auto max-w-2xl — the shell is an app column, and on a desktop
          the mode pills were floating in the middle of a 1440px band with
          the back and close buttons pinned to opposite edges of the screen,
          and the search rule ran the whole width. */}
      <header className="mx-auto w-full max-w-2xl shrink-0 pt-[env(safe-area-inset-top)]">
        {/* Everything in this row tightens below 390px.

            At 320 — an iPhone SE, and roughly what an in-app browser leaves
            you once the host app has taken its margins — the three pills and
            the two circular buttons wanted 408px of a 320px row. The middle
            group is flex-1, but a pill with fixed padding won't shrink, so
            the group overflowed and shoved the close button 58px off the
            right-hand edge, where the shell's overflow-hidden quietly ate
            it. Nothing looked broken; there was simply no way to close the
            screen. */}
        <div className="flex items-center gap-1.5 px-3 pt-[21px] min-[390px]:gap-2 min-[390px]:px-4">
          <IconButtonLink href="/" label={t("common.back")}>
            <BackIcon />
          </IconButtonLink>

          {/* The three modes, centred between the two circular buttons. */}
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 min-[390px]:gap-2">
            {MODES.map(({ id, label }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeMode(id)}
                  aria-pressed={active}
                  style={{
                    backgroundColor: active ? ink : "transparent",
                    color: active ? onInk : ink,
                    borderColor: active ? ink : controlBorder,
                  }}
                  className="flex h-[34px] shrink-0 cursor-pointer items-center rounded-full border px-2.5 text-[14px] leading-none transition-colors duration-150 min-[390px]:px-4 min-[390px]:text-[15px] sm:px-5"
                >
                  {t(label)}
                </button>
              );
            })}
          </div>

          {/* Dropped below 390px, where there simply isn't room for both.
              It's the one to lose: it goes to the same place as the back
              arrow beside it, so nothing becomes unreachable — a narrow
              screen just gets one way out instead of two. */}
          <span className="hidden min-[390px]:block">
            <IconButtonLink href="/" label={t("common.close")}>
              <CloseIcon />
            </IconButtonLink>
          </span>
        </div>

        <div className="relative px-5 pb-[17px] pt-[26px]">
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            aria-label={t(PLACEHOLDER[mode])}
            placeholder={t(PLACEHOLDER[mode])}
            // No address to take when no courier can collect it. Disabled
            // rather than accepting one and failing on the quote.
            disabled={deliveryOff}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setBounds(null);
              // Typing invalidates the place that was picked. Leaving it set
              // would keep the map filtered to a town the field no longer
              // names, with nothing on screen explaining why.
              setSearched(null);
              setToastDismissed(false);
            }}
            // 16px so iOS doesn't zoom the viewport on focus.
            className="w-full bg-transparent pb-[11px] text-[16px] leading-[19px] text-ink outline-none placeholder:text-faint"
            style={{ borderBottom: `1px solid ${controlBorder}` }}
          />
          {/* CLEAR, as in the reference — a long address is tedious to
              backspace out of on a phone. */}
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute end-5 top-[26px] cursor-pointer text-[13px] font-medium uppercase tracking-[0.08em] transition-opacity hover:opacity-60"
              style={{ color: muted }}
            >
              {t("finder.clear")}
            </button>
          ) : null}
        </div>

        <SearchResults
          mode={mode}
          value={query}
          stores={matching}
          onValueChange={setQuery}
          onPickStore={pickFromSearch}
          onPickPlace={lookAt}
          onResolvedAddress={chooseAddress}
        />
      </header>

      {/* Keyed on the language, which forces a fresh map when it changes.
          Google settles the basemap's labels when the library loads and there
          is no way to change them on a live map, so switching language has to
          throw the library away and load it again (see unloadMaps). A new key
          unmounts the old map with the old library and mounts a new one that
          asks for the new language — without it, the reload happens and the
          dead Map instance stays on screen. */}
      <StoreMap
        key={locale}
        locations={results}
        showSearchArea={mode !== "delivery"}
        onSearchArea={setBounds}
        onLocate={locateHere}
        onLocateFailed={() => {
          setLocateFailed(true);
          setToastDismissed(false);
        }}
        onChoose={chooseLocation}
        focus={focus}
      />

      {/* The toast sits between the map and the nav rather than over the map,
          as in the reference — it pushes the map up instead of covering it. */}
      {showToast ? (
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4"
          style={{ backgroundColor: "var(--cb-raise)", borderColor: border }}
        >
          <p className="m-0 text-[14px] text-ink">{toastText}</p>
          <button
            type="button"
            onClick={() => setToastDismissed(true)}
            aria-label={t("common.dismiss")}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--cb-faint)] transition-opacity hover:opacity-60"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="var(--cb-ink)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      {/* The finder is the front door for Home, and the first step for Menu.
          Which one lit it is the only difference. */}
      <CateringModal location={cateringFor} onClose={() => setCateringFor(null)} />

      <TabBar active={activeTab} />
    </div>
  );
}
