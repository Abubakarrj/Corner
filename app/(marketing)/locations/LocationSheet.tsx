"use client";

import { useState } from "react";
import Modal from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { useCapabilities } from "../../capabilities";
import { useLocale, useT } from "../../i18n";
import { localeById } from "../../localeScript";
import { OUTLET_CHIP, PALETTE } from "../../shop/shopControls";
import { clockLabel, closeHour } from "../../shopFacts";
import KitchenLoad from "./KitchenLoad";
import { opensAt, type StoreLocation } from "./locations";

const { ink, muted, controlBorder } = PALETTE;

// Everything about one shop, on a sheet.
//
// This exists to take the weight off the card on the map. That card used to
// carry the name, the address, the hours and an Order button, and a popup on
// the pin carried all of it a second time, three inches above. Two boxes
// saying the same thing is not two pieces of information.
//
// So the card names the place and offers the one thing most people came to do,
// and everything else, the hours, directions, the phone, lives behind the
// info button. Which is also where it can be given room: "Wed to Sun" squeezed
// into a third line of a map card is worse than one line on a sheet.

function Chip({
  icon,
  label,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 text-[14px] transition-colors hover:bg-raise";
  const style = { borderColor: controlBorder, color: ink };

  // An anchor when it navigates, a button when it acts. The difference matters
  // to a screen reader and to a long press, and "looks like a pill" is not a
  // reason to make everything a button.
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
      {icon}
      {label}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className} style={style}>
      {icon}
      {label}
    </button>
  );
}

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 14.5s5-4.6 5-8a5 5 0 1 0-10 0c0 3.4 5 8 5 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="6.4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CopyIcon({ done }: { done: boolean }) {
  return done ? (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 8.6l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.4" y="5.4" width="8" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.6 3.3A1.8 1.8 0 0 0 8.9 2.2H4.4A2.2 2.2 0 0 0 2.2 4.4v4.5c0 .8.5 1.4 1.1 1.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.2 2.5 6.6 5 5.3 6.5a8 8 0 0 0 4.2 4.2L11 9.4l2.5 1.4v2A1.2 1.2 0 0 1 12.2 14 10.8 10.8 0 0 1 2 3.8 1.2 1.2 0 0 1 3.2 2.5h2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LocationSheet({
  location,
  queue = true,
  onClose,
  onOrder,
}: {
  location: StoreLocation | null;
  /** Whether "orders ahead" belongs on this sheet. False under catering: see
   *  the note where KitchenLoad is rendered. */
  queue?: boolean;
  onClose: () => void;
  onOrder: (location: StoreLocation) => void;
}) {
  const { phone } = useCapabilities();
  const t = useT();
  const tag = localeById(useLocale()).tag;
  // Tagged with the shop it belongs to rather than reset by an effect, the
  // same way the address search keys its results. A bare boolean would need
  // clearing when the sheet changes shop, and a tick left over from the last
  // visit would greet the next one.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Nothing to show, and nothing to keep mounted. Modal's own closed state is
  // for the fade out of a sheet that had content; this component is handed
  // null only when there is no shop at all.
  if (!location) return null;

  const copied = copiedId === location.id;
  const full = `${location.address}, ${location.city}`;
  // The universal cross-platform form. iOS hands it to Apple Maps, Android and
  // desktop to Google Maps, and nobody has to have an app installed.
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(full)}`;

  return (
    <Modal open onClose={onClose} label={location.name}>
      {/* No close button here: Modal draws its own, top right. Adding a
          second one put two crosses in the same corner. The heading is padded
          clear of it rather than sharing the row. */}
      <div className="pe-10">
        {/* Ink, not the brand green.
            The shop's name is the heading of this sheet, and a heading is text
            — colouring it olive made the one word somebody opened the sheet to
            read the only word on the screen not set like text, and it did not
            match the same name on the card that opens the sheet, which has
            always been ink. Olive is for the marks that say Corner Bagel: the
            pins, the eyebrow on the careers page. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h2
            className="m-0 text-[26px] font-medium leading-[1.15] tracking-[-0.01em]"
            style={{ color: ink }}
          >
            {location.name}
          </h2>
          {location.outlet ? (
            <span className={OUTLET_CHIP}>{t("finder.outlet")}</span>
          ) : null}
        </div>
        {/* What this counter makes, and nothing else about what it is called.
            The chip beside the heading has already said it is an outlet, and
            a line under it repeating that in longer words is the same fact
            twice. This line is the part the chip cannot carry. */}
        {location.outlet ? (
          <p className="m-0 mt-2.5 text-[15px] leading-[1.5]" style={{ color: muted }}>
            {t("finder.outletNote")}
          </p>
        ) : null}
        {/* ——— No address here ———

            It was printed in full, and then the row of chips below offers
            Directions and Copy address, which are the two things anybody
            actually does with it. Printing it as well was a third copy that
            could only be read, on the one screen where reading it is the
            least useful thing you can do with it. The map card behind this
            sheet still shows it for anyone who wants to see it.

            `full` is still built below: Copy address and the directions link
            both need the string, they just do not need it on screen. */}
        {/* This counter's hours, not the shop's. They were the same number
            for both until the outlet opened at 11, and a sheet about one
            address printing the other one's opening time is the kind of wrong
            that sends somebody to a shut door. */}
        <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: muted }}>
          {t("finder.hoursEveryDay", {
            open: clockLabel(opensAt(location), tag),
            close: clockLabel(closeHour() % 24, tag),
          })}
        </p>
      </div>

      {/* Wraps rather than scrolls. Three chips fit a phone on two rows, and a
          horizontal scroller here would hide the third one off the edge. */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Chip icon={<PinIcon />} label={t("finder.directions")} href={directions} />
        {phone ? <Chip icon={<PhoneIcon />} label={t("finder.call")} href={`tel:${phone}`} /> : null}
        <Chip
          icon={<CopyIcon done={copied} />}
          label={copied ? t("finder.copied") : t("finder.copyAddress")}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(full)
              .then(() => setCopiedId(location.id))
              // Clipboard access can be refused, and a silent no-op is better
              // than an error dialog over an address you can still read.
              .catch(() => {});
          }}
        />
      </div>

      <Button block className="mt-6" onClick={() => onOrder(location)}>
        {t("finder.orderNow")}
      </Button>

      {/* Under the button, not above it. This is the answer to "should I order
          now or in twenty minutes", which is a question somebody asks with
          their thumb already on the button — putting it above would push the
          button down the sheet to make room for a line most people will read
          once and never again. It renders nothing when the shop is shut or
          when the count cannot be trusted.

          And nothing at all under catering. "No orders ahead" answers "should
          I order now or in twenty minutes", which is a bagel-counter question:
          a catering enquiry is a tray for a date, arranged in a conversation,
          and how many breakfast orders are on the rail this minute has nothing
          to do with it. */}
      {queue ? <KitchenLoad /> : null}
    </Modal>
  );
}
