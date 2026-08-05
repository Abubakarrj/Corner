// Shared sizing for the catalog toolbar's controls (the sort pill and the
// grid/list toggle). These live together because they sit side by side and
// have to match exactly — keeping the values in their own component files
// let them drift out of alignment twice.
//
// The toolbar is utility chrome, deliberately quiet: it sits well below the
// page heading and category tabs in the type scale so the products, not the
// controls, carry the page.
//
// Shop type scale, for reference when touching any of this:
//   22px  page heading (serif, bold)
//   16px  category tabs
//   15px  product name (serif)
//   13px  page lede
//   12px  product description
//   11px  toolbar controls + item count   <- this file
//   10px  uppercase CTA / tag pills

// The shop's typeface: Helvetica, with the fallbacks that make that a real
// answer rather than a wish.
//
// Helvetica is licensed, not a webfont — it can't be downloaded to a device
// that doesn't already have it, so this is a system stack and what a visitor
// actually sees depends on their device:
//
//   iPhone / iPad / Mac   Helvetica Neue — the genuine article
//   Windows               Arial, which substitutes automatically
//   Android               Roboto, via the generic sans-serif
//
// That's the normal trade for Helvetica and it holds up: Arial is metrically
// compatible with Helvetica, so line breaks and control widths don't shift
// between the two — a layout tuned on one doesn't come apart on the other.
// Roboto is a little narrower but close enough not to reflow anything.
//
// Buying a licensed Helvetica webfont from Monotype is the only way to get
// it on every device; short of that, this is the stack.
export const SHOP_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// Headings, product names, and drawer titles. Now the same face as the body
// — Helvetica carries both, with weight doing the separating — but kept as
// its own constant so a distinct display face can come back in one line.
// It has already been a Georgia serif and then Instrument Sans.
export const DISPLAY_FONT = SHOP_FONT;

// The produce palette, named once so the app-shell screens outside this
// folder — the location finder and membership, in app/(marketing) — can
// dress themselves in it rather than each keeping their own near-miss copy.
//
// Every entry is a CSS custom property rather than a hex, so a phone that
// switches to dark mode carries the whole product with it. The tokens
// themselves, and why the dark set isn't the light set inverted, are in
// app/globals.css.
export const PALETTE = {
  // Page ground, and the colour /shop paints html/body to match.
  cream: "var(--cb-cream)",
  // A half-step up from the ground, for cards and floating controls.
  surface: "var(--cb-surface)",
  // What carries the shop: headings, body text, active pills, filled buttons.
  // A warm near-black, and a warm off-white in dark mode.
  //
  // This used to be called `olive` and used to *be* olive, which is how the
  // whole product came out green — a brand colour asked to do a text colour's
  // job ends up everywhere, and then it isn't a brand colour any more. The
  // name changed with the value on purpose: `olive` now means olive.
  ink: "var(--cb-ink)",
  // Reads on ink.
  onInk: "var(--cb-on-ink)",
  // The brand green, spent where it should read as Corner Bagel rather than
  // as any cream app — the map's pins, the marks on the About page.
  olive: "var(--cb-olive)",
  // Sage — the lighter produce green, for secondary marks.
  sage: "var(--cb-sage)",
  // Information and progress: where an order is, what's estimated.
  sky: "var(--cb-sky)",
  skySoft: "var(--cb-sky-soft)",
  skyInk: "var(--cb-sky-ink)",
  // Reward and highlight: the keychain being earned, a tag on something new.
  sun: "var(--cb-sun)",
  sunSoft: "var(--cb-sun-soft)",
  sunInk: "var(--cb-sun-ink)",
  // Borders, in the two weights the shop uses: the heavier one separates
  // sections, the lighter one outlines controls.
  border: "var(--cb-line)",
  controlBorder: "var(--cb-line-soft)",
  // Muted body copy, and the quietest tier above it.
  muted: "var(--cb-muted)",
  faint: "var(--cb-faint)",
} as const;

export const CONTROL_HEIGHT = "h-8";

// The outline-pill shell: sort button and the toggle's container both use
// it so their border, radius, and height are identical by construction.
export const CONTROL_PILL =
  "h-8 rounded-full border border-line-soft text-[11px] text-ink";
