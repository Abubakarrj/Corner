#!/usr/bin/env node
// Generates the VAPID pair push notifications are signed with.
//
//   node scripts/vapid-keys.mjs
//
// Run it once. Put both values in the environment and leave them there: a
// subscription is bound to the public key it was created with, so rotating
// the pair silently orphans every permission a customer has already granted.
// There is no error when that happens — notifications just stop.
//
// The public key is public by design; it is served to every browser that
// subscribes. The private key is a secret and belongs only in the deployment.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.error("\nSet these three. VAPID_SUBJECT is how a push service reaches");
console.error("a human about this sender — an address you actually read.\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:hello@publicentity.co`);
