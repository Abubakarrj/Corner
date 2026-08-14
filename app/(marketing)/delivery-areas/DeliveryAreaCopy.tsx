"use client";

import Link from "next/link";
import { useT } from "../../i18n";
import { DELIVERY_RADIUS_MILES } from "../locations/locations";

// The heading and the two sentences above the map.
//
// A client component because the copy is translated and the page is a server
// component. The radius comes from the same constant the boundary is measured
// with and the checkout enforces, so the sentence cannot go stale against the
// shape underneath it — there is one number and three readers of it.
export default function DeliveryAreaCopy() {
  const t = useT();
  return (
    <>
      <Link
        href="/locations"
        className="cb-press inline-block cursor-pointer text-[14px] text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        ← {t("common.backToMenu")}
      </Link>
      <h1 className="mt-4 text-[24px] font-medium leading-tight text-ink">
        {t("deliveryArea.title")}
      </h1>
      <p className="m-0 mt-2 text-[15px] leading-[1.55] text-muted">
        {t("deliveryArea.lead", { miles: String(DELIVERY_RADIUS_MILES) })}
      </p>
    </>
  );
}
