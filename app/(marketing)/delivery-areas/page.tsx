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
export default function DeliveryAreasPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-10 sm:px-6">
      <DeliveryAreaCopy />
      <div className="mt-6">
        <DeliveryAreaMap />
      </div>
    </main>
  );
}
