import OrderCardBody, { orderTextStyle } from "../OrderCardBody";

export default function OrderPage() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-white p-6 overflow-hidden">
      <div className="max-w-md relative text-center flex flex-col" style={orderTextStyle}>
        <OrderCardBody />
      </div>
    </div>
  );
}
