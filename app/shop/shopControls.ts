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
// dress themselves in it rather than each keeping their own near-miss copy
// of these hexes. That drift is exactly what the note at the top of this
// file is about; the shop's own components still use the literals inline,
// and moving them onto these names is a worthwhile follow-up.
export const PALETTE = {
  // Page ground, and the colour /shop paints html/body to match.
  cream: "#F7F4EB",
  // A half-step up from the ground, for cards and floating controls.
  surface: "#FDFCF7",
  // The deep olive that carries the shop: active pills, headings, body text.
  olive: "#3E4A30",
  // Reads on olive.
  onOlive: "#F3F1E5",
  // Sage — the lighter produce green, for secondary marks.
  sage: "#B7C9A2",
  // Borders, in the two weights the shop uses: the heavier one separates
  // sections, the lighter one outlines controls.
  border: "#E4DECE",
  controlBorder: "#DDD6C2",
  // Muted body copy, and the quietest tier above it.
  muted: "#6F6A5C",
  faint: "#8A8672",
} as const;

export const CONTROL_HEIGHT = "h-8";

// The outline-pill shell: sort button and the toggle's container both use
// it so their border, radius, and height are identical by construction.
export const CONTROL_PILL =
  "h-8 rounded-full border border-[#DDD6C2] text-[11px] text-[#3E4A30]";
