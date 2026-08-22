import type { Metadata } from "next";
import { cookies } from "next/headers";
import BackButton from "../../../ui/BackButton";
import PageTitle from "../../../ui/PageTitle";
import { KEEPER_COOKIE, keeperIsValid } from "../../../shopKeeper";
import KeeperForm from "./KeeperForm";

// Where the shop signs in to take a note down.
//
// ——— ⚠️ Why this is a page and not a link anywhere ———
//
// Nothing links here. It is not hidden — a URL is not a secret and this file
// would not be one either — but there is no reason to put a door to the shop's
// key on a page a stranger reads. What keeps it safe is the key, not the
// address, which is why the endpoint behind it is rate-limited and answers
// identically to every wrong guess. See app/shopKeeper.ts.
//
// ⚠️ noindex, so it does not turn up in a search for the shop. Same reasoning:
// it changes nothing about the security and it keeps a staff door out of a
// results page next to the menu.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corner Notes",
  robots: { index: false, follow: false },
};

export default async function KeeperPage() {
  const signedIn = keeperIsValid((await cookies()).get(KEEPER_COOKIE)?.value);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
      <PageTitle k="keeper.title" />

      <div className="flex items-center gap-1">
        <BackButton fallback="/notes" className="-ml-2.5" />
        <p className="m-0 text-[20px] font-medium text-ink">Corner Notes</p>
      </div>

      <div className="mt-8 max-w-md">
        <KeeperForm signedIn={signedIn} />
      </div>
    </div>
  );
}
