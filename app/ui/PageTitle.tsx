"use client";

import { useT, type StringKey } from "../i18n";

// The page's own name, for the people who cannot see the screen.
//
// ——— Why several screens had none ———
//
// The shop, the map, the landing page and /about were all built to look like
// apps rather than documents: the title is the header, or the logo, or simply
// the thing you are obviously looking at. That reads fine and leaves a page
// with no <h1> at all.
//
// Jumping by heading is how most screen reader users move through a page. With
// no headings there is nothing to jump to, so the entire menu — twenty-seven
// items, a category rail and a toolbar — has to be read linearly from the
// header down every time.
//
// ⚠️ `sr-only` rather than a styled heading, deliberately. The fix is not to
// add a title to a design that does not want one; it is to give the page a
// name in the accessibility tree and change nothing on screen. Where a screen
// already shows a real heading — the cart, the checkout, the gift gallery —
// that heading is the <h1> and this component has no business there.
export default function PageTitle({ k }: { k: StringKey }) {
  const t = useT();
  return <h1 className="sr-only">{t(k)}</h1>;
}
