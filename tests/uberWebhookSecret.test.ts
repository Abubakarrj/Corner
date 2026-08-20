// Which name the Uber webhook secret answers to.
//
// ——— Why this is worth a suite at all ———
//
// Every variable in the Uber block is UBER_DIRECT_*, and this one was
// UBER_WEBHOOK_SECRET. That single inconsistency cost a real half hour: the
// sensibly-named variable was set, the code read the other one, and the log
// went on reporting it missing while looking, from the outside, exactly like a
// value that had not been pasted in.
//
// So both names work, the consistent one wins, and that is asserted rather than
// remembered.

import { uberWebhookSecret } from "../app/uberDirect";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else { failures += 1; console.log("FAIL ", what, detail); }
};

const clear = () => {
  delete process.env.UBER_DIRECT_WEBHOOK_SECRET;
  delete process.env.UBER_WEBHOOK_SECRET;
};

clear();
ok("neither name set is null, not an empty string", uberWebhookSecret() === null,
   JSON.stringify(uberWebhookSecret()));

process.env.UBER_DIRECT_WEBHOOK_SECRET = "new-name";
ok("the consistent name works", uberWebhookSecret() === "new-name",
   String(uberWebhookSecret()));

clear();
process.env.UBER_WEBHOOK_SECRET = "old-name";
ok("the legacy name still works, so an upgrade does not go quiet",
   uberWebhookSecret() === "old-name", String(uberWebhookSecret()));

// A deployment mid-rename holds both. The one being moved to is the one meant.
clear();
process.env.UBER_DIRECT_WEBHOOK_SECRET = "new-name";
process.env.UBER_WEBHOOK_SECRET = "old-name";
ok("with both set the consistent one wins", uberWebhookSecret() === "new-name",
   String(uberWebhookSecret()));

// Render keeps an emptied variable as "" rather than removing it, and an empty
// secret would sign every message to the same value.
clear();
process.env.UBER_DIRECT_WEBHOOK_SECRET = "   ";
process.env.UBER_WEBHOOK_SECRET = "old-name";
ok("a blanked-out new name falls through rather than signing with whitespace",
   uberWebhookSecret() === "old-name", String(uberWebhookSecret()));

clear();
process.env.UBER_DIRECT_WEBHOOK_SECRET = "  padded  ";
ok("and a padded value is trimmed", uberWebhookSecret() === "padded",
   JSON.stringify(uberWebhookSecret()));

clear();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
