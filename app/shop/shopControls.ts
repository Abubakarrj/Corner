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

// The shop's heading face (Instrument Sans, loaded in app/layout.tsx). Every
// heading, product name, and drawer title goes through this constant so the
// face can be swapped in one place — it replaced a Georgia serif that was
// hardcoded across a dozen files.
export const DISPLAY_FONT = "var(--font-display), sans-serif";

export const CONTROL_HEIGHT = "h-8";

// The outline-pill shell: sort button and the toggle's container both use
// it so their border, radius, and height are identical by construction.
export const CONTROL_PILL =
  "h-8 rounded-full border border-[#DDD6C2] text-[11px] text-[#3E4A30]";
