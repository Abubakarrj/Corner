"use client";

import { useEffect, useRef, useState } from "react";

// The two checkout steps, sliding past each other.
//
// transitions.dev's page-side-by-side (08-page-side-by-side.md): step one
// exits left, step two enters from the right, both with an 8px travel and a
// 3px cross-blur. It is the pattern's stated use — "step 1 ↔ step 2 in a
// wizard" — and it replaces an instant swap where the whole screen was simply
// different on the next frame.
//
// ——— Why there is a measured height ———
//
// The snippet absolutely positions both pages on top of each other, which is
// what lets them cross-fade. That also means the container has no height of
// its own, and these two steps are nowhere near the same size: contact and
// delivery details against a card form and a tip picker. Left alone the page
// would collapse to nothing.
//
// So the container carries .t-resize (01-card-resize.md) and a height read off
// whichever step is showing. Two patterns rather than one, which the skill's
// tie-breaker allows — card resize is the lower-overhead of the pair and it is
// doing the smaller job here.
//
// The measurement is taken from an inner wrapper, never from the .t-page
// itself. `.t-page` is `inset: 0`, so its own height is whatever the container
// was told to be — measuring it would feed the container's height back into
// itself and freeze at the first value.
//
// ——— Both steps stay mounted ———
//
// They have to: a page that unmounts has nothing left to slide out. That is
// safe here for a specific reason worth writing down. Neither step has a mount
// effect, nothing in the payment step reaches the network on render, and no
// input carries a native `required` — validation is React state and submission
// reads that state rather than FormData. If any of those three change, hidden
// fields in the inactive step become a form that will not submit with no
// visible reason why.
//
// `inert` is what keeps the hidden step out of the tab order and away from a
// screen reader in the meantime.
//
// ——— The first paint ———
//
// Before the first measurement there is no height to give the container, so
// the pattern is not applied at all and the active step renders in normal flow
// — exactly what this screen did before. The observer's first callback then
// switches it over, ahead of anybody being able to press anything. Applying
// the pattern with a null height instead would collapse the page for a frame.
export default function StepSlide({
  step,
  details,
  payment,
}: {
  step: "details" | "payment";
  details: React.ReactNode;
  payment: React.ReactNode;
}) {
  const [height, setHeight] = useState<number | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const paymentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = step === "details" ? detailsRef.current : paymentRef.current;
    if (!active) return;
    // ResizeObserver rather than a one-off read: these steps change height
    // while you are on them — a validation message appears, the delivery
    // quote arrives, the order-details accordion opens.
    //
    // Its first callback is asynchronous, which is also what keeps the initial
    // measurement out of the effect body and off the wrong side of the "no
    // setState in an effect" rule.
    const observer = new ResizeObserver(() => setHeight(active.offsetHeight));
    observer.observe(active);
    return () => observer.disconnect();
  }, [step]);

  const ready = height !== null;

  return (
    <div
      className={ready ? "t-page-slide t-resize" : undefined}
      data-page={step === "details" ? "1" : "2"}
      style={ready ? { height } : undefined}
    >
      <section
        className={ready ? "t-page" : step === "details" ? undefined : "hidden"}
        data-page-id="1"
        inert={step !== "details"}
      >
        <div ref={detailsRef}>{details}</div>
      </section>
      <section
        className={ready ? "t-page" : step === "payment" ? undefined : "hidden"}
        data-page-id="2"
        inert={step !== "payment"}
      >
        <div ref={paymentRef}>{payment}</div>
      </section>
    </div>
  );
}
