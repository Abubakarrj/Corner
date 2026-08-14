import type { Destination } from "./tools";

// ——— Where the order is going, said by us rather than by the caller ———
//
// This is the one part of the system prompt that varies per visitor, and until
// now it was whatever string the browser put in `context`, interpolated
// straight into a system block. Everything else the client sends is treated as
// what it is: the turns arrive as user messages, and the @-mentions arrive as
// slugs that get resolved against the catalog precisely so nothing the client
// wrote reaches the prompt. This field was the exception, and there was no
// reason for it to be one.
//
// So the mode is an enum the route checks and the route writes the sentence.
// What's left of the caller's text is the destination label, which cannot be
// enumerated — it is somebody's street address — and is handled the way an
// unenumerable field has to be: whitespace collapsed so it cannot open a new
// line, and cut to a length no address exceeds. That does not make it
// trustworthy, and it does not need to be. A prompt is not a security
// boundary; what keeps this safe is that Riley cannot place an order, cannot
// see an account and cannot move money, so the worst a doctored label buys is
// a strange sentence in the caller's own chat window.
const MODE_SENTENCE = {
  pickup: (where: string) => `They are collecting from ${where}.`,
  delivery: (where: string) => `They are having it delivered to ${where}.`,
  catering: (where: string) => `They are arranging catering from ${where}.`,
} as const;

// Long enough for a full US address with a unit on it, short enough that the
// field can't carry a paragraph.
const MAX_WHERE_CHARS = 120;

export type ChatContext = {
  /** The sentence that goes into the system block. */
  sentence: string;
  /** The delivery address the customer has already settled, with the point
   *  they dropped on it. Handed to the tools so a delivery check about *this*
   *  address doesn't re-derive a coordinate the customer already gave us. */
  destination?: Destination;
};

export function readContext(raw: unknown): ChatContext | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { mode, where, lat, lng } = raw as {
    mode?: unknown;
    where?: unknown;
    lat?: unknown;
    lng?: unknown;
  };
  if (typeof mode !== "string" || !(mode in MODE_SENTENCE)) return null;
  if (typeof where !== "string") return null;
  const label = where.replace(/\s+/g, " ").trim().slice(0, MAX_WHERE_CHARS);
  if (!label) return null;

  const sentence = MODE_SENTENCE[mode as keyof typeof MODE_SENTENCE](label);
  if (mode !== "delivery") return { sentence };

  // Range-checked rather than trusted. A pair outside these bounds is not a
  // place, and passing one on would send a distance calculation somewhere odd
  // rather than fail; the tool falls back to geocoding when there's no point,
  // which is the behaviour we want for a nonsense one too.
  const at: [number, number] = [Number(lat), Number(lng)];
  const usable =
    Number.isFinite(at[0]) &&
    Number.isFinite(at[1]) &&
    Math.abs(at[0]) <= 90 &&
    Math.abs(at[1]) <= 180;
  if (!usable) return { sentence };

  return { sentence, destination: { address: label, lat: at[0], lng: at[1] } };
}
