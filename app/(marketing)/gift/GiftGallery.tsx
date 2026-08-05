"use client";

import { useMemo, useState } from "react";
import { PALETTE, SHOP_FONT } from "../../shop/shopControls";
import TabBar from "../TabBar";
import GiftAuthModal from "./GiftAuthModal";
import GiftCardArt from "./GiftCardArt";
import { CATEGORIES, GIFT_CARDS, type Category } from "./giftCards";

const { cream, olive, onOlive, controlBorder, muted } = PALETTE;

// The gift screen, built to the reference: a heading, a redeem line, a row of
// category pills that scrolls sideways, and the card designs stacked below.
//
// Tapping a card asks you to sign in (GiftAuthModal). "Redeem Now" still
// doesn't go anywhere: both it and the step past the sign-in need gift-card
// commerce — issuing a card, taking payment, storing a balance, redeeming
// against it — and none of that exists yet.
export default function GiftGallery() {
  // null is "All" — the reference has no All pill, it simply starts unfiltered
  // with every design showing, and tapping the selected pill again clears it.
  const [category, setCategory] = useState<Category | null>(null);
  // The card waiting on a sign-in, or null when the sheet is closed. Kept as
  // the card's id rather than a bare boolean because the step after signing
  // in — amount and recipient — will need to know which design it was.
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  // Redeeming needs an account too, so it opens the same sheet with its own
  // copy. Separate state rather than a sentinel card id: one of these is
  // about a specific design and the other isn't about a design at all.
  const [redeeming, setRedeeming] = useState(false);

  const cards = useMemo(
    () =>
      category
        ? GIFT_CARDS.filter((card) => card.categories.includes(category))
        : GIFT_CARDS,
    [category],
  );

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden"
      style={{ backgroundColor: cream, fontFamily: SHOP_FONT }}
    >
      <main className="min-h-0 flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-lg">
          <div className="px-5 pt-8">
            <h1
              className="m-0 text-[24px] font-medium leading-[1.15] tracking-[-0.02em] sm:text-[27px]"
              style={{ color: olive }}
            >
              Send a little something around the corner
            </h1>
            <p className="m-0 mt-3 text-[15px]" style={{ color: olive }}>
              Have a gift card?{" "}
              <button
                type="button"
                onClick={() => setRedeeming(true)}
                className="cursor-pointer underline underline-offset-2 transition-opacity hover:opacity-70"
              >
                Redeem now
              </button>
            </p>
          </div>

          {/* Scrolls sideways rather than wrapping, as in the reference — the
              row is meant to run off the edge, which is what tells you there
              are more than fit. Negative margin + matching padding so the
              first and last pill still align with the page gutter. */}
          <div className="mt-6 -mx-0 overflow-x-auto px-5 pb-1">
            <div className="flex w-max items-center gap-2">
              {CATEGORIES.map((name) => {
                const active = category === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(active ? null : name)}
                    style={{
                      backgroundColor: active ? olive : "transparent",
                      color: active ? onOlive : olive,
                      borderColor: active ? olive : controlBorder,
                    }}
                    className="cb-press flex h-[34px] shrink-0 cursor-pointer items-center rounded-full border px-4 text-[12px] font-medium uppercase leading-none tracking-[0.08em]"
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="cb-stagger flex flex-col gap-5 px-5 pb-10 pt-6">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                aria-label={card.label}
                onClick={() => setPendingCard(card.id)}
                // 1.35:1, measured off the reference — taller than a credit
                // card, which is what gives the artwork room to be artwork.
                className="cb-press relative aspect-[1.35] w-full cursor-pointer overflow-hidden rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.08)] hover:scale-[1.01]"
              >
                <GiftCardArt art={card.art} />
              </button>
            ))}

            {cards.length === 0 ? (
              <p className="m-0 py-10 text-center text-[14px]" style={{ color: muted }}>
                Nothing in this category yet.
              </p>
            ) : null}
          </div>
        </div>
      </main>

      <TabBar active="gift" />

      {/* One sheet, two reasons to open it. Redeeming wins if both are
          somehow set, since it's the more specific errand. */}
      <GiftAuthModal
        open={redeeming || pendingCard !== null}
        intent={redeeming ? "redeem" : "send"}
        guestHref={
          redeeming || pendingCard === null ? undefined : `/gift/buy?design=${pendingCard}`
        }
        onClose={() => {
          setRedeeming(false);
          setPendingCard(null);
        }}
      />
    </div>
  );
}
