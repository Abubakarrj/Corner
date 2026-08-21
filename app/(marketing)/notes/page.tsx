import type { Metadata } from "next";
import PageTitle from "../../ui/PageTitle";
import BackButton from "../../ui/BackButton";
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
  // ⚠️ 24 rather than 60. The wall is the scattered view and tilted cards need
  // room; the rest live on /notes/all, laid flat and ordered by place.
  const notes = await listNotes(24);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6">
      <PageTitle k="notes.title" />

      {/* ⚠️ The app's own back control, not an underlined link of this page's
          own. Every other screen in this app uses BackButton — it goes back
          where you came from when there is somewhere, and up a level when there
          is not, rather than always to the landing page. A second kind of back
          control is a second thing to learn on the one page a stranger is most
          likely to arrive at cold. */}
      <div className="flex items-center gap-1">
        <BackButton fallback="/" className="-ml-2.5" />
        <p className="m-0 text-[20px] font-medium text-ink">Corner Notes</p>
      </div>

      <div className="mt-6">
        <NotesWall
          // `?? []` rather than passing the null through: the component takes a
          // list and a separate reachable flag, so that the two states the null
          // stands for — no database, and a database that answered — stay
          // distinguishable on screen. See listNotes().
          notes={notes ?? []}
          reachable={isNotesConfigured() && notes !== null}
        />
      </div>
    </div>
  );
}
