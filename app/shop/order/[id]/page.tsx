import OrderTracker from "./OrderTracker";

// Orders live in the browser that placed them (app/account.ts), so there is
// nothing for the server to look up — this route exists to give an order a
// URL, and the tracking itself is client-side.
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderTracker id={id} />;
}
