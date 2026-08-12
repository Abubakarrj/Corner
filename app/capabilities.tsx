"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { setOpenPreview } from "./useOpening";

// What the app can actually do right now, as something a component can read.
//
// Fetched once from /api/capabilities rather than baked in, so the answer is
// about the environment the app is *running* in. Everything starts false and
// turns on when the answer arrives, which is the safe direction to be wrong
// in: a checkout that briefly says payment is taken at the window when it
// isn't costs nobody anything, and the reverse costs somebody a meal they
// think they've paid for.
export type Capabilities = {
  /** Whether the answer has actually arrived.
   *
   *  Everything below starts false, which is the safe direction to be wrong in
   *  — but "false because we have not asked yet" and "false because it is off"
   *  are different facts, and a screen that cannot tell them apart states the
   *  second one while the first is true. That is what "Delivery is unavailable
   *  right now" said on every single load of the Delivery tab, before the fetch
   *  came back, and permanently on any device where the fetch failed. A claim
   *  about the shop, made while the app is still asking. */
  ready: boolean;
  auth: boolean;
  payments: boolean;
  chat: boolean;
  /** Whether a courier can be booked. False hides delivery rather than
      offering it and failing at the quote. */
  delivery: boolean;
  // The shop's own number, or null when none is configured. Null is the safe
  // default here for the same reason the booleans are false: better to offer
  // no Call button than one that rings a placeholder.
  phone: string | null;
  /** ⚠️ The shop is being treated as open regardless of the clock, for
      testing. See openPreview() in shopFacts.ts. */
  openPreview: boolean;
};

const OFF: Capabilities = {
  ready: false,
  auth: false,
  payments: false,
  chat: false,
  delivery: false,
  phone: null,
  openPreview: false,
};

const CapabilitiesContext = createContext<Capabilities>(OFF);

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<Capabilities>(OFF);

  useEffect(() => {
    let live = true;
    void fetch("/api/capabilities", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!live || !body) return;
        const answer = body as Capabilities;
        setCapabilities({ ...answer, ready: true });
        // The opening store is read synchronously all over the shop, so it is
        // told rather than asked. Without this the browser says "closed" while
        // the server accepts orders.
        setOpenPreview(answer.openPreview === true);
      })
      .catch(() => {
        // Everything stays off — see the note above on which way to be wrong —
        // but the question has been asked and answered, so screens can stop
        // waiting and say what they know.
        if (live) setCapabilities((was) => ({ ...was, ready: true }));
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <CapabilitiesContext value={capabilities}>{children}</CapabilitiesContext>
  );
}

export function useCapabilities(): Capabilities {
  return useContext(CapabilitiesContext);
}
