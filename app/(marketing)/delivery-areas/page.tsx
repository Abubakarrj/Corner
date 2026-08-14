import DeliveryAreaMap from "./DeliveryAreaMap";
import DeliveryAreaCopy from "./DeliveryAreaCopy";

export const metadata = {
  title: "Delivery areas — Corner Bagel",
  description: "Where Corner Bagel delivers, and how to check your address.",
};

// Where we deliver, as a map somebody can look at before they start an order.
//
// One shop, one boundary. When there is a second kitchen this page becomes
// several shapes rather than a different page — the endpoint already returns
// the origin alongside the ring for that reason.
//
// ——— Full screen, not a card on a page ———
//
// It was a narrow column with a small map in it, which is the shape of an
// article about delivery rather than the shape of a map. The map is the
// content: it wants the width of the phone and as much height as is left
// after the heading and the address field.
//
// cb-app-shell is the same column the store finder uses — viewport height,
// shortened by the cookie banner — so the map fills what is left instead of
// being cropped by it, and the page itself never scrolls.
export default function DeliveryAreasPage() {
  return (
    <main className="cb-app-shell mx-auto flex w-full max-w-2xl flex-col px-5 pb-5 pt-8 sm:px-6">
      <DeliveryAreaCopy />
      {/* min-h-0 so the map is allowed to shrink inside the flex column.
          Without it a flex child refuses to go below its content height and
          the map pushes the address field off the bottom of the screen. */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <DeliveryAreaMap />
      </div>
    </main>
  );
}
