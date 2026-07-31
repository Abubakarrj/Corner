import OrderCardBody, { orderTextStyle } from "../OrderCardBody";

export default function OrderPage() {
  return (
    // min-h-dvh, not h-screen: dvh follows a mobile browser's toolbars as
    // they come and go, and min- lets the card scroll rather than be
    // clipped when it cannot fit — this now holds paragraph copy, not the
    // handful of short lines it used to, so it needs the same room /about
    // gives its own paragraph.
    <div className="flex min-h-dvh w-full items-center justify-center bg-white px-6 py-12 sm:py-16">
      <div className="max-w-md w-full relative text-center flex flex-col" style={orderTextStyle}>
        <OrderCardBody />
      </div>
    </div>
  );
}
