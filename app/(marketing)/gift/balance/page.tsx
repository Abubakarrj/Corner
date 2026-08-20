import GiftBalanceForm from "./GiftBalanceForm";

export const metadata = {
  title: "Gift card balance — Corner Bagel",
  description: "Check what is left on a Corner Bagel gift card.",
  // ⚠️ Not indexed. There is nothing here worth finding in a search result and
  // a crawler following a link with a number on it is exactly the accident this
  // page is written to avoid.
  robots: { index: false, follow: false },
};

export default function GiftBalancePage() {
  return <GiftBalanceForm />;
}
