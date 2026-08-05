import GiftPurchaseForm from "./GiftPurchaseForm";

export const metadata = {
  title: "Gift card — Corner Bagel",
  description: "Send a Corner Bagel gift card by email or text.",
};

// ?design= names which artwork the card carries. Anything unrecognised falls
// back to the first design rather than erroring — a bad query string should
// cost you the picture you wanted, not the page.
export default async function GiftBuyPage({
  searchParams,
}: {
  searchParams: Promise<{ design?: string }>;
}) {
  const { design } = await searchParams;
  return <GiftPurchaseForm designId={design ?? ""} />;
}
