"use client";

import { useState } from "react";
import Modal from "../../ui/Modal";
import { Button } from "../../ui/Button";
import { useCapabilities } from "../../capabilities";
import { PALETTE } from "../../shop/shopControls";
import { SHOP_HOURS } from "../../shopFacts";
import type { StoreLocation } from "./locations";

const { ink, muted, controlBorder, olive } = PALETTE;

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
  onClose,
  onOrder,
}: {
  location: StoreLocation | null;
  onClose: () => void;
  onOrder: (location: StoreLocation) => void;
}) {
  const { phone } = useCapabilities();
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
      <div className="pr-10">
        <h2
          className="m-0 text-[26px] font-medium leading-[1.15] tracking-[-0.01em]"
          style={{ color: olive }}
        >
          {location.name}
        </h2>
        <p className="m-0 mt-2.5 text-[15px] leading-[1.5]" style={{ color: muted }}>
          {location.address}
          <br />
          {location.city}
        </p>
        <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: muted }}>
          {SHOP_HOURS}
        </p>
      </div>

      {/* Wraps rather than scrolls. Three chips fit a phone on two rows, and a
          horizontal scroller here would hide the third one off the edge. */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Chip icon={<PinIcon />} label="Directions" href={directions} />
        {phone ? <Chip icon={<PhoneIcon />} label="Call" href={`tel:${phone}`} /> : null}
        <Chip
          icon={<CopyIcon done={copied} />}
          label={copied ? "Copied" : "Copy address"}
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
        Order now
      </Button>
    </Modal>
  );
}
