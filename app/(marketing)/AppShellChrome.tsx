// Paints the document itself cream for the app-shell screens.
//
// Their own wrapper is h-dvh, so it covers the viewport and the page looks
// right without this — until iOS rubber-band overscroll drags past the edge
// and shows the white underneath, or the browser chrome renders in the
// default colour. /shop solves this the same way in its own layout; these
// screens are the same palette, so they need the same treatment.
//
// Scoped to a layout rather than set globally because the marketing pages —
// the landing mark, /about, the policy pages — are deliberately white.
export default function AppShellChrome() {
  return <style>{`html, body { background-color: #F7F4EB; }`}</style>;
}
