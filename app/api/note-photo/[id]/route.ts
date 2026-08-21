import { notePhotoBytes } from "../../../cornerNotes";
import { PHOTO_TYPE } from "../../../notePhoto";

// One photograph off the visitor wall.
//
// ——— ⚠️ The only way bytes a stranger uploaded leave this shop's server ———
//
// Everything else on the wall is rendered: text React escapes, a drawing built
// from integers. This hands back a file somebody else made, on our own origin,
// to anybody with the URL. That is a different kind of endpoint and it gets a
// different kind of care.
//
// Four things, and each one covers a failure the others do not:
//
//   ⚠️ It never decides anything. Whether a photo may be shown is a WHERE
//   clause in notePhotoBytes(): cleared, and on a note that has not been taken
//   down. This file has no branch holding bytes it should not have, because it
//   never receives them.
//
//   ⚠️ The Content-Type is a constant, never anything the upload said. A file
//   that lied its way past the magic-byte check is still served as a JPEG, and
//   nosniff stops a browser deciding for itself that it looks like HTML and
//   running it as a page on our origin. That pair is the whole reason a stored
//   image cannot become stored script.
//
//   ⚠️ Content-Security-Policy: default-src 'none'. Belt and braces on top of
//   the above — if this response were ever treated as a document, it is a
//   document that may load nothing and run nothing.
//
//   ⚠️ A short cache. The bytes never change once cleared, so caching is free —
//   but `hidden` can change, and taking a note down has to take the picture
//   with it. A minute is the longest a takedown may take to reach a CDN, and it
//   is the number that matters more than the bandwidth.
//
// ——— 404, for every kind of no ———
//
// Not found, not cleared, refused, taken down, still developing, database
// asleep: one answer for all of them. Distinguishing them would tell whoever is
// asking which of their photographs was refused and which merely does not
// exist, and there is no reader of this endpoint who needs to know the
// difference — the wall itself already knows, because listNotes told it.

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = await notePhotoBytes(id);
  if (!bytes) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": PHOTO_TYPE,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      // Shown, never saved. Named so a browser that does download it writes a
      // file with our name on it rather than whatever the upload was called —
      // which is another string a stranger chose, and one this app has
      // deliberately never stored.
      "Content-Disposition": `inline; filename="corner-note.jpg"`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // ⚠️ No stale-while-revalidate, unlike every other cached response in
      // this app. It is the right directive when staleness costs a little
      // accuracy; here it would let a cache keep serving a photograph for
      // minutes after somebody asked for it to come down, which is the one
      // thing this header exists to bound.
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
