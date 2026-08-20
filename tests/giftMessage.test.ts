// What a gift card says when it arrives.
//
// ——— The two things worth holding this to ———
//
// The message carries a bearer instrument. Whoever reads it can spend it, so
// the rules are: it reaches the recipient intact, and it reaches nowhere else.
// Everything below is one of those two.
//
// The rest is ordinary rendering, and it is here because the buyer's note and
// both names are typed by a member of the public into a form.

import { giftMessage, groupGan } from "../app/giftMessage";
import type { GiftDelivery } from "../app/giftDelivery";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const GAN = "7783320000001234";

const card = (over: Partial<GiftDelivery> = {}): GiftDelivery => ({
  id: "gift-1",
  squareGiftCardId: "gc-1",
  squareOrderId: "ord-1",
  amountCents: 5000,
  designId: "classic",
  method: "email",
  recipientContact: "friend@example.com",
  recipientName: "Sam",
  senderName: "Ada",
  buyerEmail: "ada@example.com",
  message: "happy birthday",
  deliverOn: null,
  ...over,
});

// ——— The number, as somebody has to read it ———
ok("grouped in fours", groupGan(GAN) === "7783 3200 0000 1234", groupGan(GAN));
ok("and grouping is idempotent on an already-spaced number",
   groupGan("7783 3200 0000 1234") === "7783 3200 0000 1234",
   groupGan("7783 3200 0000 1234"));
// ⚠️ No digit may be added or lost. A card number one character off is a card
// that does not exist, and the recipient has no way to tell which digit.
ok("with every digit still there",
   groupGan(GAN).replace(/ /g, "") === GAN, groupGan(GAN));

const plain = giftMessage(card(), GAN);

// ——— It has to arrive ———
ok("the number is in the email body", plain.text.includes("7783 3200 0000 1234"), plain.text);
ok("and in the HTML", plain.html.includes("7783 3200 0000 1234"));
ok("and in the text message", plain.sms.includes("7783 3200 0000 1234"), plain.sms);
ok("the amount is said", plain.text.includes("$50.00") && plain.sms.includes("$50.00"));
ok("who it is from", plain.text.includes("Ada") && plain.sms.includes("Ada"));
ok("what they wrote", plain.text.includes("happy birthday"));
ok("and the recipient is greeted by name", plain.text.startsWith("Sam,"), plain.text.slice(0, 20));
ok("the subject names the sender and the amount",
   plain.subject.includes("Ada") && plain.subject.includes("$50.00"), plain.subject);

// ⚠️ Over 160 characters a text is sent and billed as several messages. Worse,
// one character outside GSM-7 switches the whole thing to UCS-2 and the limit
// drops to 70 — so a typographer's ellipsis in the trimming code turns one
// segment into four.
ok("a text with a short note fits in one segment",
   plain.sms.length <= 160, `${plain.sms.length} characters`);
const long = giftMessage(card({ message: "x".repeat(255) }), GAN);
ok("and so does one with the longest note the form allows",
   long.sms.length <= 160, `${long.sms.length} characters`);
ok("with the note trimmed rather than dropped, since the buyer wrote it",
   long.sms.includes("xxx") && long.sms.includes("..."), long.sms);
ok("and the number still whole after the trim",
   long.sms.includes("7783 3200 0000 1234"), long.sms);
// ⚠️ Nothing this file adds may be outside GSM-7. The buyer's own words can be
// in any alphabet and that is theirs to spend; the trimming marker is not.
const GSM = /^[@£$¥èéùìòÇØøÅå\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039eÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà\n\r]*$/;
const scaffolding = long.sms.replace(/x+/g, "");
ok("and the message this file writes is all GSM-7",
   GSM.test(scaffolding), JSON.stringify(scaffolding));

// A sender name is capped at 80 characters by the form. Left alone it pushes
// the number out of the first segment on its own.
const shouty = giftMessage(card({ senderName: "A".repeat(80), message: "" }), GAN);
ok("a very long sender name does not blow the segment",
   shouty.sms.length <= 160, `${shouty.sms.length} characters`);
ok("and the number is still in it",
   shouty.sms.includes("7783 3200 0000 1234"), shouty.sms);
// ⚠️ When there is no room left, the note goes rather than arriving as a
// two-word fragment. The whole of it is in the email either way.
ok("and a note that cannot fit at all is dropped rather than stubbed",
   !giftMessage(card({ senderName: "A".repeat(80), message: "hello there" }), GAN)
      .sms.includes('"'),
   giftMessage(card({ senderName: "A".repeat(80), message: "hello there" }), GAN).sms);

// ——— A card sent to the buyer to forward or print ———
const self = giftMessage(card({ method: "self" }), GAN);
ok("a self card does not address the buyer as the recipient",
   !self.text.startsWith("Sam,"), self.text.slice(0, 30));
ok("and says it is theirs", /^Here is the gift card you bought/.test(self.text), self.text.slice(0, 40));
ok("with a subject that does not claim somebody sent it to them",
   !self.subject.includes("sent you"), self.subject);

// ——— What the buyer left out ———
//
// Names are optional on the form. A card that says it is from an empty string,
// or from "ada@example.com", reads as a receipt rather than a present.
const anon = giftMessage(card({ senderName: "", recipientName: "" }), GAN);
ok("no sender name still reads as a person",
   anon.text.includes("someone at Corner Bagel"), anon.text.slice(0, 80));
ok("and never as the buyer's email address",
   !anon.text.includes("ada@example.com") && !anon.html.includes("ada@example.com"));
ok("no recipient name still greets somebody",
   anon.text.startsWith("You have a gift card."), anon.text.slice(0, 30));
const noNote = giftMessage(card({ message: "" }), GAN);
ok("and no note still says who it is from",
   noNote.text.includes("From Ada."), noNote.text.slice(0, 60));

// ——— Escaping ———
//
// ⚠️ Both names and the note are public input. An ampersand in a name is
// ordinary; a tag in one is somebody probing.
const hostile = giftMessage(
  card({
    senderName: '<script>alert(1)</script>',
    recipientName: "Ben & Jerry",
    message: 'say "hi" <b>',
  }),
  GAN,
);
ok("a tag in a name does not reach the HTML as a tag",
   !hostile.html.includes("<script>"), hostile.html.slice(0, 400));
ok("it is escaped instead", hostile.html.includes("&lt;script&gt;"));
ok("an ampersand in a name survives as one",
   hostile.html.includes("Ben &amp; Jerry"), hostile.html);
ok("and quotes in the note are escaped",
   hostile.html.includes("&quot;hi&quot;"), hostile.html);
// The plain-text part is not HTML and must not be mangled into it — a mail
// client showing "Ben &amp; Jerry" is a bug the other way.
ok("but the plain text keeps the ampersand as typed",
   hostile.text.includes("Ben & Jerry") && !hostile.text.includes("&amp;"), hostile.text);

// ——— What must not be in it ———
//
// ⚠️ Square's own id for the card is in every row in the delivery table and in
// every log line about one. The number is not, and the two must never swap
// places — a message that quotes the id instead of the number is a present that
// does not work, and a log that quotes the number is money in a log file.
ok("Square's internal id is not in the message",
   !plain.text.includes("gc-1") && !plain.html.includes("gc-1") && !plain.sms.includes("gc-1"));
ok("nor the row id", !plain.text.includes("gift-1") && !plain.sms.includes("gift-1"));
// The buyer may have bought it as a surprise. Their address in the recipient's
// message tells them who it came from before the sender's name does.
ok("and the buyer's address is not in a card going to somebody else",
   !plain.text.includes("ada@example.com") && !plain.html.includes("ada@example.com"),
   plain.text);

// ——— Amounts ———
ok("a five dollar card reads as $5.00",
   giftMessage(card({ amountCents: 500 }), GAN).text.includes("$5.00"));
ok("and a hundred dollar one as $100.00",
   giftMessage(card({ amountCents: 10000 }), GAN).text.includes("$100.00"));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
