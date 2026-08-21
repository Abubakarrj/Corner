import Link from "next/link";
import type { Metadata } from "next";
import PageTitle from "../../ui/PageTitle";
import { isNotesConfigured, listNotes } from "../../cornerNotes";
import NotesWall from "./NotesWall";

// Corner Notes: the wall people leave things on.
//
// ——— Server-rendered first, then live ———
//
// The first page of notes is read here and handed to the client component,
// rather than fetched after mount. A wall is the whole content of this page, so
// fetching it in the browser would mean arriving at an empty box and watching
// it fill — and it would put the notes outside what a crawler or a link preview
// can see.
//
// ⚠️ `force-dynamic`, and it matters here more than on most pages: the default
// would prerender this at build time and serve every visitor the wall as it
// looked when the deploy went out. Somebody leaving a note and telling a friend
// to look would be telling them to look at a cached page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corner Notes",
  description: "Notes and drawings left by people who came by Corner Bagel.",
};

export default async function NotesPage() {
  const notes = await listNotes(60);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
      <PageTitle k="notes.title" />

      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[20px] font-medium text-ink">Corner Notes</p>
        <Link
          href="/"
          className="cb-tap cursor-pointer text-[13px] text-muted underline hover:text-ink"
        >
          ← Corner Bagel
        </Link>
      </div>

      <div className="mt-6">
        <NotesWall
          // `?? []` rather than passing the null through: the component takes a
          // list and a separate reachable flag, so that the two states the null
          // stands for — no database, and a database that answered — stay
          // distinguishable on screen. See listNotes().
          initial={notes ?? []}
          reachable={isNotesConfigured() && notes !== null}
        />
      </div>
    </div>
  );
}
