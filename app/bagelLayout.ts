// Positioning math the corner icon on /about is built from.
//
// This used to be the /bagel page's own geometry — the icon replicated that
// page's layout (page wrapper, frame, caption) and hung itself off the
// caption, so it would land exactly where the real caption's bagel photo
// sat. /bagel no longer exists, but the same viewport-relative math still
// produces the corner position the icon is meant to sit in on /about, so
// it's kept here rather than re-derived. Everything below is pure CSS driven
// by the viewport alone: no state, no content.
//
// Change these here, never inline at the call site — that's what keeps the
// icon's position reproducible if this ever needs adjusting again.

// The arrows sit on the frame's left/right edges (24px wide on mobile, 28px on
// sm+). Everything that has to clear them — the images and the caption — is
// inset by exactly that much on mobile, so the artwork stays as large as it can
// without running underneath. Desktop has room to spare, so the gutter goes.
// Keep this in sync with the frame's mobile height, which subtracts it.
export const gutter = "px-6 sm:px-0";

// The full-viewport page box. `h-dvh` rather than inset-0 stretching, so the
// overlay (which is `fixed`) measures the same viewport the page does when a
// mobile browser's toolbars come and go.
export const pageWrapper =
  "flex h-dvh w-full items-center justify-center overflow-hidden p-6 sm:items-end sm:pb-20";

// The column holding the frame and the caption under it.
export const contentBox = "relative flex w-[min(92vw,620px)] flex-col items-center";

// The frame = the image area. Its slides are absolute layers, so it can't size
// to them — the height is set explicitly. On mobile that's the height the widest
// slide (expand, 541x603) actually takes at the available width, so the frame
// hugs the artwork and the caption sits right under it; 64dvh caps it on short
// screens. Desktop fills the screen height.
export const frameHeight =
  "h-[min(64dvh,calc((92vw_-_3rem)_*_1.114))] sm:h-[calc(100dvh-140px)]";

// Spacing between the frame and the caption.
export const captionGap = "mt-3";

export const captionStyle = {
  fontFamily: "var(--font-geist-sans), sans-serif",
  fontWeight: 400,
  fontSize: "10px",
  lineHeight: "100%",
  letterSpacing: "-0.03em",
  textAlign: "center" as const,
  color: "#C2C2C2",
};

// The reference caption the corner icon is positioned against — not real
// content, just a fixed-width ruler the icon is measured off.
export const CAPTION_REFERENCE =
  "Bagels available as 1, 3, 6. Mix and match bagel flavors";
