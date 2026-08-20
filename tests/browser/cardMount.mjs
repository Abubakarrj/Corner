// Does the card field actually mount?
//
// ——— How to run it ———
//
//   npm run build
//   SQUARE_ACCESS_TOKEN=fake SQUARE_LOCATION_ID=L-fake \
//     SQUARE_APPLICATION_ID=sandbox-fake SHOP_OPEN_PREVIEW=1 npx next start -p 3115
//   node tests/browser/cardMount.mjs
//
// Playwright is not a dependency of this app and deliberately is not — it would
// be a large install carried by every deploy for one script. Point NODE_PATH at
// wherever it lives, e.g. a global install:
//
//   PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.mjs \
//     node tests/browser/cardMount.mjs
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

// Resolved at run time rather than imported by name, because ESM ignores
// NODE_PATH: with Playwright installed somewhere other than this project, the
// only way in is the full path. PLAYWRIGHT takes one.
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const BASE = process.env.BASE ?? "http://localhost:3115";

const FAKE_SDK = `
window.Square = {
  payments(appId, locationId) {
    window.__squareInit = { appId, locationId };
    return {
      async card(options) {
        // ——— The stub validates, because the real one does ———
        //
        // This used to accept any style object at all, which is why the suite
        // passed green while the deployed checkout showed no card field: a
        // backgroundColor on .input-container is not ignored by Square, it
        // throws, and the field never mounts.
        //
        // The lists below are Square's own, from the CardClassSelectors type in
        // @square/web-payments-sdk-types: input properties, component (border)
        // properties, component state properties, and colour-only text and icon
        // properties.
        const ALLOWED = {
          input: ["backgroundColor", "color", "fontFamily", "fontSize", "fontWeight"],
          "input.is-focus": ["backgroundColor", "color", "fontFamily", "fontSize", "fontWeight"],
          "input::placeholder": ["color"],
          "input.is-focus::placeholder": ["color"],
          "input.is-error": ["color"],
          "input.is-error::placeholder": ["color"],
          ".input-container": ["borderColor", "borderRadius", "borderWidth"],
          ".input-container.is-focus": ["borderColor", "borderWidth"],
          ".input-container.is-error": ["borderColor", "borderWidth"],
          ".message-text": ["color"],
          ".message-text.is-error": ["color"],
          ".message-icon": ["color"],
          ".message-icon.is-error": ["color"],
        };
        const style = options && options.style ? options.style : null;
        if (style) {
          for (const [selector, properties] of Object.entries(style)) {
            const allowed = ALLOWED[selector];
            if (!allowed) throw new Error("unsupported selector " + selector);
            for (const property of Object.keys(properties)) {
              if (!allowed.includes(property)) {
                throw new Error(property + " is not supported on " + selector);
              }
            }
          }
        }
        window.__squareStyle = style;
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
const THEME = process.env.THEME ?? "light";
await page.addInitScript((theme) => {
  localStorage.setItem("cb-theme-v1", theme);
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
}, THEME);

await page.goto(`${BASE}/shop/checkout`, { waitUntil: "networkidle" });

const config = await page.evaluate(async () => {
  const r = await fetch("/api/payments-config");
  return r.json();
});
console.log(`theme: ${THEME}`);
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

// ——— On brand, not Square's white default ———
//
// The iframe cannot read this page's stylesheet, so the only way it is themed is
// the style object we hand the SDK. This checks the values actually resolved
// from the page's custom properties rather than that a style object was passed:
// a fieldStyle() that read the wrong variable names would send a full object of
// empty strings and look, from the outside, exactly like this working.
const style = await page.evaluate(() => window.__squareStyle ?? null);
const dark = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--cb-surface").trim(),
);
const hex = /^#[0-9a-fA-F]{3,8}$|^rgb/;
const styled =
  style &&
  hex.test(style.input?.backgroundColor ?? "") &&
  hex.test(style.input?.color ?? "") &&
  hex.test(style[".input-container"]?.borderColor ?? "");
console.log("style handed to Square:", JSON.stringify(style?.input ?? null));
// The style may legitimately be absent — the hook falls back to an unstyled
// card rather than no card when Square refuses it. That is the right trade and
// it is also exactly what a styling bug looks like, so it is reported loudly
// rather than passing quietly.
if (style === null) {
  console.log("FAIL  Square refused the styling and the field fell back to plain");
}
console.log(styled ? "pass  the fields are styled with resolved colours"
                   : "FAIL  no usable colours reached Square");
const matchesPage = style?.input?.backgroundColor === dark;
console.log(matchesPage ? `pass  and the ground matches the page (${dark})`
                        : `FAIL  ground ${style?.input?.backgroundColor} is not the page's ${dark}`);
// 16px or larger, or iOS Safari zooms the whole page when the field takes focus.
const bigEnough = parseInt(style?.input?.fontSize ?? "0", 10) >= 16;
console.log(bigEnough ? "pass  the text is 16px so iOS does not zoom on focus"
                      : `FAIL  fontSize ${style?.input?.fontSize} will make iOS zoom`);

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

const failed =
  !attached || stillLoading || !fieldVisible || !reattached ||
  style === null || !styled || !matchesPage || !bigEnough;
console.log(failed ? "\nFAILED" : "\nALL PASS");
await browser.close();
process.exit(failed ? 1 : 0);
