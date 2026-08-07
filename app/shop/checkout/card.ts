// Card entry: the formatting, the brand, and what counts as a valid card.
//
// ——— Read this before moving any of it ———
//
// The number typed into these fields never leaves the browser. Not in the
// order body, not in a log, not in an error report. `describeCard` below is
// the only thing this module gives the rest of the app, and it deliberately
// returns the brand and the last four digits — enough for a receipt to say
// "Visa ending 4242" and useless to anybody who intercepts it.
//
// That is not caution for its own sake. A PAN in a request body is a PAN in
// whatever logs request bodies, which is usually more places than anyone
// remembers, and it puts whoever deploys this inside PCI DSS scope for a form
// that doesn't charge anybody. The fields are here because a checkout without
// them doesn't look like a checkout; the number staying put is what makes that
// safe to do.
//
// Wiring up a real charge is one function, and it is `describeCard`'s
// neighbour rather than its replacement: mount Toast's hosted payment element,
// hand it the entered card, take back the token, and send *that* to
// /api/shop-order. Everything else on this screen already works.

export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "unknown";

// What a receipt is allowed to know. No PAN, by construction — there is no
// field on this type to put one in.
export type CardSummary = {
  brand: CardBrand;
  last4: string;
};

export function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

// Brand from the leading digits, the way every card form does it: the issuer
// identification number. Partial input answers as soon as it can, so the
// fourth digit is enough to light up Visa.
export function brandOf(value: string): CardBrand {
  const digits = digitsOf(value);
  if (/^4/.test(digits)) return "visa";
  // 51-55 and the 2221-2720 range Mastercard added in 2017.
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(011|5|4[4-9])/.test(digits)) return "discover";
  return "unknown";
}

// Amex is 15 digits in 4-6-5; everything else here is 16 in fours. The rest of
// the world's lengths (13-digit Visas, 19-digit Discovers) are accepted by the
// Luhn check below — this only decides where the spaces go.
export function groupsFor(brand: CardBrand): number[] {
  return brand === "amex" ? [4, 6, 5] : [4, 4, 4, 4];
}

export function maxDigits(brand: CardBrand): number {
  return brand === "amex" ? 15 : 19;
}

export function cvcDigits(brand: CardBrand): number {
  return brand === "amex" ? 4 : 3;
}

// Spaces as you type. Rebuilt from the digits every time rather than patched
// in place, so pasting, deleting from the middle and typing all end up in the
// same state.
export function formatNumber(value: string): string {
  const brand = brandOf(value);
  const digits = digitsOf(value).slice(0, maxDigits(brand));
  const parts: string[] = [];
  let at = 0;
  for (const size of groupsFor(brand)) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  // Anything past the last group (a 19-digit card) keeps going in fours.
  while (at < digits.length) {
    parts.push(digits.slice(at, at + 4));
    at += 4;
  }
  return parts.join(" ");
}

// MM/YY, with the slash inserted rather than typed. Typing "1" gives "1" and
// not "1/" — the month isn't decided yet, and a form that commits on the first
// keystroke makes "12" impossible to type.
export function formatExpiry(value: string): string {
  const digits = digitsOf(value).slice(0, 4);
  if (digits.length === 0) return "";
  // A leading 2-9 can only be a month with a zero in front of it, so it gets
  // one: typing "3" means March, and waiting for a second digit that can never
  // come is a field that feels broken.
  if (digits.length === 1) return /[2-9]/.test(digits) ? `0${digits}/` : digits;
  const month = digits.slice(0, 2);
  const rest = digits.slice(2);
  return rest.length > 0 ? `${month}/${rest}` : `${month}/`;
}

// The Luhn check. Catches a transposed pair or a mistyped digit before the
// order is placed, which is the only thing it is for — it says nothing about
// whether the card exists or has any money on it.
export function luhn(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

// `now` is passed in rather than read here so this stays a pure function —
// which is what lets it be tested, and what keeps a Date.now() out of a React
// render.
export function expiryValid(value: string, now: Date): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 4) return false;
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2));
  if (month < 1 || month > 12) return false;
  // A card is good through the last day of its printed month, so the
  // comparison is against the first of the *next* one.
  return new Date(year, month, 1).getTime() > now.getTime();
}

export function numberValid(value: string): boolean {
  const brand = brandOf(value);
  const digits = digitsOf(value);
  const expected = brand === "amex" ? [15] : [13, 16, 19];
  return expected.includes(digits.length) && luhn(digits);
}

export function cvcValid(value: string, brand: CardBrand): boolean {
  return digitsOf(value).length === cvcDigits(brand);
}

// Everything a receipt gets to know about the card. See the note at the top:
// this is the whole surface, and it is this narrow on purpose.
export function describeCard(number: string): CardSummary {
  const digits = digitsOf(number);
  return { brand: brandOf(digits), last4: digits.slice(-4) };
}

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  unknown: "Card",
};
