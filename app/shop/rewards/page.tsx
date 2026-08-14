import RewardsScreen from "./RewardsScreen";

export const metadata = {
  title: "Rewards — Corner Bagel",
  description: "Points on every order, and a member code of your own.",
};

// Not "Corner Keychain". That name is taken by a real object — the keychain
// the shop drops in the bag past $40, see GIFT_NAME in products.ts — and a
// points scheme sharing its name would mean a customer reading "you've earned
// a Corner Keychain" on the basket bar and finding a balance of points here.

// The route is a server component and the screen is a client one, which is the
// opposite of the other shop pages — they are "use client" all the way up.
//
// It is that way round here because this screen has a title worth having in a
// tab and in a share sheet, and metadata cannot be exported from a client
// module. Nothing else changes: RewardsScreen is the whole page, and it does
// its own fetching.
export default function RewardsPage() {
  return <RewardsScreen />;
}
