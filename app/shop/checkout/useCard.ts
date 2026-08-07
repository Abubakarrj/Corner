"use client";

import { useState } from "react";
import { useT } from "../../i18n";
import {
  brandOf,
  cvcValid,
  describeCard,
  expiryValid,
  formatExpiry,
  formatNumber,
  numberValid,
  type CardBrand,
  type CardSummary,
} from "./card";

// The card fields as state, kept out of useCheckout on purpose.
//
// useCheckout is the transaction: what is owed, whether it can be ordered,
// what gets posted. The card is a different kind of thing — it is the most
// sensitive data on the screen and the one piece that must never reach
// /api/shop-order — so it lives in its own hook, and the only thing that
// crosses between them is a boolean (is it filled in?) and, at submit, four
// digits and a brand. There is no path from here into the request body except
// `summary()`, and `summary()` cannot return a number because CardSummary has
// nowhere to put one.

export type CardEntry = {
  number: string;
  setNumber: (value: string) => void;
  expiry: string;
  setExpiry: (value: string) => void;
  cvc: string;
  setCvc: (value: string) => void;
  brand: CardBrand;
  /** Filled in and self-consistent. Not "will be accepted" — nothing here can know that. */
  complete: boolean;
  numberError: string | undefined;
  expiryError: string | undefined;
  cvcError: string | undefined;
  /** Brand and last four. The whole of what leaves this hook. */
  summary: () => CardSummary;
  clear: () => void;
};

export function useCard(tried: boolean): CardEntry {
  const t = useT();
  const [number, setRawNumber] = useState("");
  const [expiry, setRawExpiry] = useState("");
  const [cvc, setRawCvc] = useState("");

  const brand = brandOf(number);
  const okNumber = numberValid(number);
  // Read once per render rather than per check, so a field can't validate
  // against a different instant from the one beside it.
  const okExpiry = expiryValid(expiry, new Date());
  const okCvc = cvcValid(cvc, brand);

  return {
    number,
    // Formatting on the way in rather than on the way out: the value in state
    // is what's on screen, so the caret arithmetic browsers do for us stays
    // right and there's no second version of the truth.
    setNumber: (value) => setRawNumber(formatNumber(value)),
    expiry,
    setExpiry: (value) => setRawExpiry(formatExpiry(value)),
    cvc,
    setCvc: (value) => setRawCvc(value.replace(/\D/g, "").slice(0, 4)),
    brand,
    complete: okNumber && okExpiry && okCvc,
    // Nothing is marked wrong until somebody has tried to place the order —
    // the same rule the name and email fields follow. A card field that turns
    // red on the fourth digit is telling you about an unfinished number.
    numberError: tried && !okNumber ? t("checkout.cardNumberInvalid") : undefined,
    expiryError: tried && !okExpiry ? t("checkout.cardExpiryInvalid") : undefined,
    cvcError: tried && !okCvc ? t("checkout.cardCvcInvalid") : undefined,
    summary: () => describeCard(number),
    clear: () => {
      setRawNumber("");
      setRawExpiry("");
      setRawCvc("");
    },
  };
}
