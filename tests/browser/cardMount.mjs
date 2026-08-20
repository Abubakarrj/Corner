// Does the card field actually mount?
//
// ——— How to run it ———
//
//   npm run build
//   SQUARE_ACCESS_TOKEN=fake SQUARE_LOCATION_ID=L-fake \
//     SQUARE_APPLICATION_ID=sandbox-fake SHOP_OPEN_PREVIEW=1 npx next start -p 3115
//   node tests/browser/cardMount.mjs
//
// Not part of `npm test`. That suite is node-only and finishes in seconds; this
// needs a built app, a running server and a browser. It is here because the bug
// below is invisible to every kind of test that suite can run — the modules were
// all correct on their own, and what was broken was the order two of them
// happened in.
//
// The bug this checks for: the container is rendered only when somebody selects
// "Pay now by card", which happens after the payments config has arrived. An
// effect keyed on the config alone ran once against a container that did not
// exist and never woke again, and the screen sat on "Loading the card fields…".
//
// Square's SDK is stubbed at the network layer, so this exercises our mount
// sequence rather than Square's. That is the half that was broken.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3115";

const FAKE_SDK = `
window.Square = {
  payments(appId, locationId) {
    window.__squareInit = { appId, locationId };
    return {
      async card() {
        return {
          async attach(target) {
            window.__squareAttached = true;
            const el = typeof target === "string" ? document.querySelector(target) : target;
            // Stand in for the real iframe, so a human looking at a screenshot
            // sees the same shape.
            el.innerHTML = '<div id="fake-square-field" style="padding:14px;color:#888">card field (stub)</div>';
          },
          async tokenize() { return { status: "OK", token: "cnon:fake-token" }; },
          async destroy() { window.__squareAttached = false; },
        };
      },
      async verifyBuyer() { return { token: "verf-fake" }; },
    };
  },
};
`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({ viewport: { width: 420, height: 900 } });

// Serve the stub in place of Square's real script, for both environments.
await context.route("**/*squarecdn.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_SDK }),
);

const page = await context.newPage();
const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(m.text());
});

// A basket and a pickup counter, so the checkout is reachable.
await page.addInitScript(() => {
  localStorage.setItem(
    "cb-shop-cart-v1",
    JSON.stringify([{ slug: "single-bagel", quantity: 2, options: {} }]),
  );
  localStorage.setItem(
    "cb-fulfillment-v1",
    JSON.stringify({
      mode: "pickup",
      locationId: "wilshire",
      label: "Wilshire Blvd",
      detail: "3450 Wilshire Blvd",
    }),
  );
});

await page.goto(`${BASE}/shop/checkout`, { waitUntil: "networkidle" });

const config = await page.evaluate(async () => {
  const r = await fetch("/api/payments-config");
  return r.json();
});
console.log("payments-config:", JSON.stringify(config));
if (config.provider !== "square") {
  console.log("FAIL  the server is not offering Square; nothing to mount");
  await browser.close();
  process.exit(1);
}

// Step one: fill in contact details and continue, since payment is behind it.
// The inputs carry generated ids and no name attribute, so they are addressed
// by their autocomplete tokens — which are the stable, meaningful handle here.
const fill = async (token, value) => {
  const field = page.locator(`input[autocomplete="${token}"]`).first();
  if (await field.count()) await field.fill(value);
  else console.log(`  (no input with autocomplete="${token}")`);
};
await fill("given-name", "Ada");
await fill("family-name", "Lovelace");
await fill("tel", "2135550147");
await page.waitForTimeout(300);

const next = page.getByRole("button", { name: /continue|payment/i }).first();
if (await next.count()) {
  await next.click({ timeout: 10000 }).catch((e) => console.log("  continue click:", e.message.split("\n")[0]));
}
await page.waitForTimeout(900);
const onPayment = await page.getByText(/Pay now by card/i).count();
console.log(onPayment ? "pass  reached the payment step" : "FAIL  never reached the payment step");

// ——— The moment that was broken ———
//
// The config landed long before this tap. Selecting the card tender is what
// renders the container, and the mount has to start from that, not from the
// config.
const cardOption = page.getByText(/Pay now by card/i).first();
await cardOption.click();
await page.waitForTimeout(2500);

const attached = await page.evaluate(() => window.__squareAttached === true);
const init = await page.evaluate(() => window.__squareInit ?? null);
const stillLoading = await page
  .getByText(/Loading the card fields/i)
  .count()
  .then((n) => n > 0);
const fieldVisible = await page.locator("#fake-square-field").count();

console.log("square.payments() called with:", JSON.stringify(init));
console.log(attached ? "pass  the card attached to the container" : "FAIL  never attached");
console.log(
  stillLoading ? "FAIL  still says Loading the card fields" : "pass  the loading line went",
);
console.log(fieldVisible ? "pass  the field is on the page" : "FAIL  no field rendered");

// Switching away and back must re-mount rather than strand a dead node.
await page.getByText(/Pay at the window/i).first().click();
await page.waitForTimeout(400);
await cardOption.click();
await page.waitForTimeout(2000);
const reattached = await page.evaluate(() => window.__squareAttached === true);
console.log(
  reattached ? "pass  and it comes back after switching tender away and back"
             : "FAIL  stranded after switching tender away and back",
);

await page.screenshot({ path: process.env.SHOT ?? "/tmp/card-mounted.png", fullPage: false });

if (problems.length) console.log("console errors:", problems.slice(0, 5));

const failed = !attached || stillLoading || !fieldVisible || !reattached;
console.log(failed ? "\nFAILED" : "\nALL PASS");
await browser.close();
process.exit(failed ? 1 : 0);
