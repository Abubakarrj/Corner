// What a stranger is allowed to photograph onto the wall.
//
// ——— ⚠️ Why this file exists at all ———
//
// tests/drawing.test.ts opens by explaining that a note has no field that can
// hold anything but text and numbers, and that this is what makes the wall safe
// to publish. A camera is the exception, deliberately taken, and everything
// that used to be true by construction is now true only because of the code
// under test here.
//
// So the assertions are not about JPEG. They are about the four things that
// replaced the guarantee:
//
//   readPhoto() takes an unknown off a request body and either returns bytes
//   that are a JPEG under the cap, or returns nothing. There is no third
//   answer and no path where a caller has to remember to check something.
//
//   the state a photo is born in is not the state it is served in, and only
//   one word out of three is ever public.
//
//   `refused` and "no photo at all" look identical from a browser.
//
//   and every failure lands on the unpublished side.
//
// ⚠️ The last one is the one to be careful with when editing this file. Several
// assertions below look like they are testing a triviality — "does refused mean
// not public" — and what they are actually pinning is the direction the whole
// feature fails in. A mutation that flips one of them produces code that looks
// correct and publishes photographs nobody looked at.

import {
  PHOTO_MAX_BYTES,
  PHOTO_TYPE,
  isPhotoState,
  looksLikeJpeg,
  photoIsPublic,
  photoOnWall,
  readPhoto,
} from "../app/notePhoto";
import { PHOTO_MAX_EDGE, PHOTO_QUALITY } from "../app/cornerNotesShape";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

/** The smallest thing that passes for a JPEG: the SOI marker and some body. */
const jpeg = (bytes = 64) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, bytes - 4), 7)]);

const b64 = (buffer: Buffer) => buffer.toString("base64");
const dataUrl = (buffer: Buffer, type = PHOTO_TYPE) =>
  `data:${type};base64,${b64(buffer)}`;

// ——— The magic bytes ———
console.log("\n— what a JPEG starts with —");
ok("a JPEG is recognised", looksLikeJpeg(jpeg()));
ok("a PNG is not", looksLikeJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])) === false);
ok("a GIF is not", looksLikeJpeg(Buffer.from("GIF89a")) === false);
// ⚠️ The one that matters. An SVG is markup, and markup served from our own
// origin is a script on our own origin — the exact failure the fixed
// Content-Type and nosniff exist as a second line against.
ok("an SVG is not", looksLikeJpeg(Buffer.from("<svg xmlns=")) === false);
ok("HTML is not", looksLikeJpeg(Buffer.from("<!doctype html>")) === false);
ok("three bytes is not enough to say", looksLikeJpeg(Buffer.from([0xff, 0xd8, 0xff])) === false);
ok("nothing is not", looksLikeJpeg(new Uint8Array()) === false);

// ——— readPhoto: the ordinary cases ———
console.log("\n— reading one off a request —");
const plain = readPhoto(b64(jpeg()));
ok("bare base64 comes back as bytes", plain !== null && plain.length === 64,
   String(plain?.length));
const prefixed = readPhoto(dataUrl(jpeg()));
ok("a data URL comes back as the same bytes",
   prefixed !== null && Buffer.from(prefixed).equals(jpeg()));

console.log("\n— and the ones that are not a photo —");
ok("no field at all is null", readPhoto(undefined) === null);
ok("an empty string is null", readPhoto("") === null);
ok("a number is null", readPhoto(12345) === null);
ok("an object is null", readPhoto({ data: b64(jpeg()) }) === null);
ok("an array is null", readPhoto([b64(jpeg())]) === null);
ok("null is null", readPhoto(null) === null);
// ⚠️ Buffer.from(…, "base64") does not throw on nonsense, it returns what it
// could salvage — so "not base64" has to be caught by what comes out, not by an
// exception nobody gets.
ok("a sentence is null", readPhoto("this is not a photograph") === null);

// ——— ⚠️ The type in the prefix is not a suggestion ———
console.log("\n— a data URL that claims something else —");
// The bytes are a real JPEG in every one of these. What is being refused is the
// declaration, and it is refused before the magic-byte check has a chance to
// pass it — because a caller who writes `data:image/svg+xml` is telling us what
// they meant to send, and we have no business storing it as something else.
ok("image/svg+xml is refused", readPhoto(dataUrl(jpeg(), "image/svg+xml")) === null);
ok("image/png is refused", readPhoto(dataUrl(jpeg(), "image/png")) === null);
ok("text/html is refused", readPhoto(dataUrl(jpeg(), "text/html")) === null);
ok("a data URL with no base64 marker is refused",
   readPhoto(`data:${PHOTO_TYPE},${b64(jpeg())}`) === null);

// ——— The magic bytes, through the reader ———
console.log("\n— what is inside, whatever it was called —");
ok("a PNG sent as base64 is refused",
   readPhoto(b64(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) === null);
// ⚠️ The whole point of checking bytes rather than labels: this one announces
// itself correctly as a JPEG and is a web page.
ok("HTML in a jpeg data URL is refused",
   readPhoto(dataUrl(Buffer.from("<html><script>alert(1)</script></html>"))) === null);

// ——— The caps ———
console.log("\n— how much of it there can be —");
const big = readPhoto(b64(jpeg(PHOTO_MAX_BYTES + 1)));
ok("one byte over the cap is refused", big === null);
const atCap = readPhoto(b64(jpeg(PHOTO_MAX_BYTES)));
ok("exactly at the cap is kept", atCap !== null && atCap.length === PHOTO_MAX_BYTES,
   String(atCap?.length));

// ——— ⚠️ The pre-check on the string, which is a separate rule ———
//
// The first version of this block asserted that a huge string of "A" comes back
// null, and called that a test of the length pre-check. It was not: that string
// also decodes to something far over the cap, so the check below it caught it
// and the assertion passed with the pre-check deleted. It tested nothing.
//
// This is the input that tells the two apart. Node's base64 decoder skips
// whitespace, so two megabytes of newlines after a valid little JPEG decode to
// a valid little JPEG — accepted, on every rule except the one about how long
// the string was. It is also a real thing to send: a payload that costs the
// server megabytes of allocation per request and looks, at the end of it, like
// a perfectly ordinary photograph.
const padded = b64(jpeg()) + "\n".repeat(2_000_000);
ok("a huge string that decodes to a small JPEG is still refused",
   readPhoto(padded) === null);
// And the pre-check is not so tight that a normal photo trips it: base64 is
// four characters per three bytes, so a file at the cap is a string a third
// longer than the cap and must still be accepted.
ok("a photo at the cap is not refused for the length of its base64",
   readPhoto(b64(jpeg(PHOTO_MAX_BYTES))) !== null);

// ——— The states ———
console.log("\n— where a photo is in its life —");
ok("pending is a state", isPhotoState("pending"));
ok("clear is a state", isPhotoState("clear"));
ok("refused is a state", isPhotoState("refused"));
ok("approved is not", isPhotoState("approved") === false);
ok("an empty string is not", isPhotoState("") === false);
ok("null is not", isPhotoState(null) === false);
ok("true is not", isPhotoState(true) === false);

// ——— ⚠️ What may be served ———
//
// Read this block as one assertion in four parts: exactly one of the states
// is public, and everything that is not a state is not public either.
console.log("\n— what leaves the server —");
ok("a cleared photo is public", photoIsPublic("clear"));
ok("a pending photo is not", photoIsPublic("pending") === false);
ok("a refused photo is not", photoIsPublic("refused") === false);
ok("no state at all is not", photoIsPublic(null) === false);
ok("undefined is not", photoIsPublic(undefined) === false);

// ——— ⚠️ What a browser is told ———
console.log("\n— what the wall is told —");
ok("cleared shows the picture", photoOnWall("clear") === "ready");
ok("pending shows a frame developing", photoOnWall("pending") === "developing");
// The one that keeps a card from being an accusation: a refused photo and a
// note that never had one are the same answer on the wire.
ok("refused looks like no photo at all", photoOnWall("refused") === null);
ok("and so does no photo at all", photoOnWall(null) === null);
ok("refused and absent are indistinguishable",
   photoOnWall("refused") === photoOnWall(null));
ok("nothing else is ever ready",
   (["pending", "refused", null, undefined] as const)
     .every((state) => photoOnWall(state) !== "ready"));

// ——— The numbers the browser works to ———
console.log("\n— the shape both sides agree on —");
// ⚠️ Not a snapshot of a constant. What is being pinned is that the client's
// re-encode target is far enough under the server's cap that an ordinary photo
// cannot arrive too big: a thousand pixels of JPEG at this quality is tens of
// kilobytes, and the cap is 900,000.
ok("the resize target leaves room under the cap",
   PHOTO_MAX_EDGE * PHOTO_MAX_EDGE * 0.2 < PHOTO_MAX_BYTES,
   `${PHOTO_MAX_EDGE} vs ${PHOTO_MAX_BYTES}`);
ok("quality is a real JPEG quality", PHOTO_QUALITY > 0 && PHOTO_QUALITY < 1);
ok("one type, in and out", PHOTO_TYPE === "image/jpeg");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
