import LogoLockup from "../LogoLockup";

// The "SHOP PANTRY" button and its arrow annotation used to sit under the
// logo here, linking to /shop. Pulled until the pantry is ready to launch —
// the shop itself is untouched and still reachable at /shop directly, this
// only removes the front-door entry point. To restore, put back:
//
//   <div className="mt-6 flex flex-col items-center">
//     <Link href="/shop" style={{ borderColor: "#BE1923", color: "#BE1923",
//       fontFamily: "var(--font-geist-sans), sans-serif" }}
//       className="w-48 cursor-pointer border-2 bg-white py-3.5 text-center
//       text-[15px] font-bold tracking-[0.08em] transition-opacity
//       hover:opacity-80 sm:w-56 sm:py-4 md:w-64 lg:w-72">SHOP PANTRY</Link>
//     ...the arrow svg + "Curated from our kitchen" caption...
//   </div>
//
// The arrow and caption went with it: they exist to point at that button,
// so on their own they'd be an arrow aimed at nothing.

export default function Home() {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-white p-6">
      <LogoLockup />
    </div>
  );
}
