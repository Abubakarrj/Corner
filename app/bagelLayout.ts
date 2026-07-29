// The bagel page's geometry, in one place.
//
// The corner icon lives in the root layout (so it never remounts on navigation)
// and is pinned to the bagel page's caption line. To do that it renders an
// invisible replica of this layout — page wrapper, frame, caption — and hangs
// itself off the replica's caption. Everything here is pure CSS driven by the
// viewport alone: no state, no content, so the replica and the real page always
// resolve to the same box, and the icon lands on the same spot on every page.
//
// Change these here, never inline at a call site — that's what keeps the two in
// step.

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

// The caption the corner icon is positioned against. The real caption swaps to
// the schmear line on the last slide, but the icon must not move with it — this
// one line is the fixed ruler the icon is measured off.
export const CAPTION_REFERENCE =
  "Bagels available as 1, 3, 6. Mix and match bagel flavors";
