import { PHOTO_MAX_EDGE, PHOTO_QUALITY, PHOTO_TYPE } from "../../cornerNotesShape";

// A photograph off a phone, made small enough to send.
//
// ——— ⚠️ This is where EXIF is removed, and that is the point of it ———
//
// The size reduction is the visible job. The one that matters is what does not
// survive it: a picture straight off a camera carries a block of metadata, and
// on a phone that block routinely includes the GPS coordinates the shot was
// taken at. Uploading the file as it came would publish, on a public wall, the
// exact spot somebody was standing when they photographed their own kitchen.
//
// Re-drawing the image through a canvas and encoding it again produces a file
// built from pixels alone. There is no EXIF to strip because there is no EXIF:
// the camera, the timestamp, the lens, the coordinates and the phone's serial
// are all simply absent from what the canvas writes.
//
// ⚠️ Doing this in the browser rather than on the server is deliberate. It is
// the difference between the coordinates never leaving the phone and the
// coordinates reaching a shop's server and being deleted there by code that has
// to keep being correct. The server checks what arrives regardless — see
// app/notePhoto.ts — but the private part of the file was gone before the
// request was made.
//
// ——— ⚠️ imageOrientation: "from-image" ———
//
// The one line that turns this from a bug into a feature. Orientation is EXIF
// too: phones store the sensor's pixels the way the sensor read them and add a
// tag saying "rotate this a quarter turn". Strip the metadata without applying
// that tag first and every portrait photo on the wall lies on its side. Asking
// the decoder to bake the rotation in is what makes the stripped file still the
// picture somebody took.

/** ⚠️ The client's own ceiling, and it is lower than the server's on purpose.
 *
 *  app/notePhoto.ts refuses anything over 900,000 bytes after decoding. Sending
 *  something at 899,000 and hoping is how a rounding difference between two
 *  base64 estimates turns into a photo refused at the last step. This leaves
 *  room. */
const MAX_SEND = 800_000;

/** How small it will settle for. In order: the intended size and quality, then
 *  a harder squeeze, then a smaller one — because a photograph of a bright,
 *  detailed scene can come out of the first pass larger than the cap even at a
 *  thousand pixels, and giving somebody "that picture didn't come through" for
 *  a perfectly ordinary photo is not an acceptable answer. */
const ATTEMPTS: { edge: number; quality: number }[] = [
  { edge: PHOTO_MAX_EDGE, quality: PHOTO_QUALITY },
  { edge: PHOTO_MAX_EDGE, quality: 0.55 },
  { edge: 720, quality: 0.5 },
];

/** Roughly how many bytes a base64 string stands for. Checked against the
 *  encoded length rather than by decoding it: this runs on a phone, and
 *  allocating the bytes to measure them is work for no answer that four-thirds
 *  does not already give. */
function byteLength(dataUrl: string): number {
  const body = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((body.length * 3) / 4);
}

/** The largest edge scaled to `edge`, keeping the shape. A photo already
 *  smaller than that is left alone — enlarging it would cost bytes and add
 *  nothing. */
function fit(width: number, height: number, edge: number): [number, number] {
  const scale = Math.min(1, edge / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

/** Decode a file into something a canvas can draw.
 *
 *  createImageBitmap where it exists, which is everywhere current and is the
 *  only route that can be asked to apply the orientation tag. The <img>
 *  fallback is for the browsers that do not have it; it gets the rotation from
 *  the decoder by default, which is the same answer by a longer road. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("could not decode the photo"));
      image.src = url;
    });
  } finally {
    // Revoked whichever way it went. An object URL holds the whole file in
    // memory until it is released, and a composer somebody is fiddling with
    // can go through several.
    URL.revokeObjectURL(url);
  }
}

/** A photo, ready to send: a `data:image/jpeg;base64,…` string, or null when
 *  the file could not be read as an image at all.
 *
 *  Null rather than a throw, and null for every reason: a HEIC nothing here can
 *  decode, a file that is not an image, a canvas the browser refused. The
 *  composer says one sentence about it and lets somebody try another picture,
 *  which is the only useful thing anybody can do with any of those. */
export async function takePhoto(file: File): Promise<string | null> {
  let source: ImageBitmap | HTMLImageElement | null = null;
  try {
    source = await decode(file);
    const width = source.width;
    const height = source.height;
    if (!width || !height) return null;

    for (const attempt of ATTEMPTS) {
      const [w, h] = fit(width, height, attempt.edge);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext("2d");
      if (!context) return null;
      // ⚠️ A white ground before the photo goes down. JPEG has no transparency,
      // so a source that had some (a PNG somebody picked out of their library)
      // would otherwise encode its clear pixels as black — a picture with a
      // black hole in it, from a file that looked fine everywhere else.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, w, h);
      context.drawImage(source, 0, 0, w, h);

      const encoded = canvas.toDataURL(PHOTO_TYPE, attempt.quality);
      // A browser that will not encode JPEG answers with a PNG data URL and no
      // error. Sending it would fail the magic-byte check on the server for a
      // reason nobody could work out from the message, so it is caught here.
      if (!encoded.startsWith(`data:${PHOTO_TYPE};base64,`)) return null;
      if (byteLength(encoded) <= MAX_SEND) return encoded;
    }
    // Every pass was still too big. Rare enough to be worth refusing rather
    // than sending something the endpoint will reject anyway.
    return null;
  } catch {
    return null;
  } finally {
    // ⚠️ An ImageBitmap holds decoded pixels — a phone camera's are tens of
    // megabytes — and holds them until it is closed, not until it goes out of
    // scope. Somebody trying three photographs in a row is three of those.
    // (The <img> fallback has nothing to release; its object URL already went.)
    if (source && "close" in source) source.close();
  }
}
