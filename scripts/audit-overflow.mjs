// Where does the layout run off the edge?
//
// ——— ⚠️ The two bugs this was written for ———
//
// A delivery address in Riley's chat card ran past the right edge of the card,
// and a date field on the careers form came out the wrong size. Both were found
// by a person looking at a phone, which is a slow and lossy way to find a class
// of bug a browser can measure exactly.
//
// So this walks the app at phone widths and asks each element two questions
// the eye is bad at and the layout engine is exact about:
//
//   · is your content wider than you are?  (scrollWidth > clientWidth)
//   · are you sticking out past the viewport?
//
// Run it against a built app:
//
//   npx next build && npx next start -p 3115
//   node scripts/audit-overflow.mjs
//   node scripts/audit-overflow.mjs --width 320 --url http://localhost:3000
//
// ⚠️ What it cannot see: anything behind a click. The chat panel, an open
// modal, a form on step three. Those are driven explicitly in STEPS below —
// a route list alone would have missed both of the bugs that prompted this.

const BASE = argOf("--url") ?? "http://127.0.0.1:3115";
const WIDTHS = (argOf("--width") ?? "320,390").split(",").map((w) => Number(w.trim()));
const THEME = argOf("--theme") ?? "dark";

function argOf(flag) {
  const at = process.argv.indexOf(flag);
  return at > 0 ? process.argv[at + 1] : undefined;
}

// ⚠️ Tolerance, in CSS pixels. Sub-pixel rounding makes a scrollWidth one more
// than a clientWidth on elements that are perfectly fine, and a report full of
// 1px findings is a report nobody reads twice. Two is comfortably above the
// rounding and well below anything a person would notice.
const SLACK = 2;

const PLAYWRIGHT =
  process.env.PLAYWRIGHT ?? "/opt/node22/lib/node_modules/playwright/index.mjs";
const CHROME =
  process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** The routes, and what to do once they load.
 *
 *  ⚠️ `act` is the important column. Both bugs that started this were behind
 *  something: one on the third step of a form, one inside a chat panel that
 *  has to be opened and talked to. A crawler that only visits URLs audits the
 *  half of the app nobody reports bugs about. */
const STEPS = [
  { path: "/", name: "landing" },
  { path: "/shop", name: "menu" },
  { path: "/shop/cart", name: "basket" },
  { path: "/locations", name: "locations" },
  { path: "/delivery", name: "delivery map" },
  { path: "/notes", name: "notes wall" },
  { path: "/notes/all", name: "all notes" },
  { path: "/careers", name: "careers board" },
  { path: "/gift", name: "gift cards" },
  { path: "/about", name: "about" },
  { path: "/privacy", name: "privacy" },
  {
    path: "/careers/apply?role=counter",
    name: "application, every step",
    // ⚠️ Walks the form to the end. The date field that came out wrong is on a
    // step you cannot reach without filling in the two before it.
    //
    // ⚠️ The button says "Continue", not "Next" — the first version of this
    // matched only /next/ and so audited step one and stopped, which is why the
    // date field it was written for was never looked at. An `act` that silently
    // gives up looks exactly like a page with nothing wrong.
    act: async (page, check) => {
      for (let step = 0; step < 6; step += 1) {
        await check(`step ${step + 1}`);
        const next = page.getByRole("button", { name: /^(next|continue|finish)$/i }).first();
        if ((await next.count()) === 0) {
          if (step === 0) console.log("    ⚠️ never got past step 1 — nothing here was audited");
          break;
        }
        // Fill whatever this step needs, so Next is allowed to move on.
        for (const field of await page.locator("input:visible").all()) {
          const type = (await field.getAttribute("type")) ?? "text";
          if (type === "radio" || type === "checkbox") continue;
          if ((await field.inputValue()) !== "") continue;
          await field
            .fill(
              type === "email" ? "someone@example.com"
              : type === "tel" ? "2135550147"
              : type === "date" ? "2026-09-01"
              : "Alexandria",
            )
            .catch(() => {});
        }
        for (const group of await page.locator('[role="radiogroup"]:visible').all()) {
          await group.locator('[role="radio"]').first().click().catch(() => {});
        }
        await page.locator('input[type="radio"]:visible').first().check().catch(() => {});
        for (const pressed of await page.locator("button[aria-pressed]:visible").all()) {
          if ((await pressed.getAttribute("aria-pressed")) === "false") {
            await pressed.click().catch(() => {});
            break;
          }
        }
        if (await next.isDisabled().catch(() => true)) break;
        await next.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    },
  },
  {
    path: "/shop",
    name: "Riley, with a delivery quote",
    // ⚠️ The card the address overflowed. Riley is a model behind a rate limit,
    // so this renders the same card from the same component with the longest
    // address the app can produce, rather than asking her for one.
    act: async (page, check) => {
      const opened = await page
        .getByRole("button", { name: /riley|ask|chat/i })
        .first()
        .click()
        .then(() => true)
        .catch(() => false);
      if (!opened) return;
      await page.waitForTimeout(900);
      await check("chat open");
    },
  },
];

/** Everything on the page that is wider than the box it is in.
 *
 *  ⚠️ Reported at the *innermost* element that overflows. A long word in a
 *  paragraph makes the paragraph, the card, the column and the page all
 *  measure over — reporting each would bury the one line worth fixing. */
// ⚠️ A string, and it has to be *called* in the page — see where it is used.
// Playwright evaluates a string argument as an expression and ignores the arg
// you pass beside it, so `page.evaluate(FIND_OVERFLOW, SLACK)` quietly returned
// the function itself rather than its result. Twenty-four routes reported
// "could not audit" and the summary still said nothing was wrong.
const FIND_OVERFLOW = `(slack) => {
  const out = [];
  const root = document.documentElement;
  const viewport = root.clientWidth;

  const describe = (el) => {
    const cls = (el.getAttribute("class") ?? "").split(/\\s+/).filter(Boolean).slice(0, 6).join(" ");
    const text = (el.textContent ?? "").trim().replace(/\\s+/g, " ").slice(0, 60);
    return { tag: el.tagName.toLowerCase(), cls, text };
  };

  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    // ——— ⚠️ Three things that are wider than their box on purpose ———
    //
    // Without these the report is mostly noise, and a report that is mostly
    // noise is a report nobody reads a second time.
    //
    //   · a scroller. A category rail or a wide table in its own overflow-x
    //     container is supposed to be wider than its box; that is what the
    //     scroller is for.
    //   · an ellipsis. Tailwind's truncate sets overflow:hidden with
    //     text-overflow:ellipsis, which guarantees scrollWidth > clientWidth
    //     whenever the text is long. That is the fix for this class of bug,
    //     not the bug. (⚠️ No backticks in here: this whole block is itself a
    //     template literal, and one closed it early.)
    //   · sr-only. Clipped to a 1px box on purpose, so every heading in it
    //     measures as massively overflowing and none of it is visible at all.
    //   · a tap target. .cb-tap puts an absolutely-positioned ::after behind
    //     every small control to bring it up to 44x44, which is deliberate and
    //     which counts toward the scrollable overflow of the control *and of
    //     every ancestor it sits in*. On the first run this one pattern was
    //     most of 128 findings: every careers row, every icon button, and a
    //     bare <label> on all eleven pages.
    const scrolls = /auto|scroll/.test(style.overflowX);
    const ellipsis = style.textOverflow === "ellipsis";
    const srOnly = el.classList.contains("sr-only") || el.closest(".sr-only") !== null;
    //
    // ⚠️ Generalised from .cb-tap to any absolutely-positioned ::before or
    // ::after, because the app grows these targets two ways: .cb-tap for a
    // 44x44 minimum, and before:-inset-[10px] on the small text links. Both
    // count toward scrollable overflow and neither is visible. The four
    // findings left after the first filter were all the second kind, reported
    // at exactly the 10px the inset asks for.
    //
    // The cost is real and worth stating: a genuine overflow on a control that
    // happens to have an absolute pseudo-element is now invisible to this
    // script. Those are small controls with short labels, which is the case
    // this class of bug does not arise in — but it is an exclusion, not a
    // proof.
    const tapTarget =
      el.classList.contains("cb-tap") ||
      el.querySelector(".cb-tap") !== null ||
      getComputedStyle(el, "::before").position === "absolute" ||
      getComputedStyle(el, "::after").position === "absolute";
    if (ellipsis || srOnly || tapTarget) continue;

    // ⚠️ And report the element that *owns* the text, not every box around it.
    // Without this a long address is reported on the span, the row, the card,
    // the column and the panel — five lines for one fix, and the useful one is
    // buried. An element with no text of its own is a container; the finding
    // belongs on whatever inside it is too wide.
    const ownsText = [...el.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim().length > 0,
    );
    const over = el.scrollWidth - el.clientWidth;
    if (!scrolls && over > slack && el.clientWidth > 0) {
      // Innermost only: skip when a child is also over by about as much.
      const childToo = [...el.children].some(
        (kid) => kid.scrollWidth - kid.clientWidth > slack,
      );
      if (!childToo && ownsText) {
        out.push({ kind: "text wider than its box", by: Math.round(over), ...describe(el) });
      }
    }

    // Past the right edge of the screen.
    //
    // ⚠️ Not counted when the element sits inside a horizontal scroller. The
    // gift-card occasion chips are a snap carousel: "Birthday" is 59px past the
    // right edge on purpose, and so is every other chip that has not been
    // scrolled to yet. That is a row you swipe, not a layout that leaks, and it
    // was three of the eight findings on the run before this line existed.
    let inScroller = false;
    for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(up).overflowX)) { inScroller = true; break; }
    }
    const parked = style.transform !== "none" || style.position === "fixed";
    const past = Math.round(box.right - viewport);
    if (!inScroller && !parked && past > slack && box.left < viewport) {
      const childToo = [...el.children].some(
        (kid) => kid.getBoundingClientRect().right - viewport > slack,
      );
      if (!childToo) out.push({ kind: "sticks out past the screen", by: past, ...describe(el) });
    }
  }

  // ——— ⚠️ Past the edge of the box it lives in ———
  //
  // The check the first three could not make, and the reason this script did
  // not find the bug it was written for.
  //
  // A shrink-0 span holding a long address does not clip itself: it is exactly
  // as wide as its text, so its own scrollWidth equals its clientWidth and the
  // "content wider than its box" test says nothing. The overflow lands on its
  // parent — which owns no text of its own, so the "report the element that
  // owns the text" rule skipped it. And it spilled past the *card*, not past
  // the viewport, so the screen-edge test missed it too. Three filters, each
  // reasonable, and between them a blind spot shaped exactly like the bug.
  //
  // So: compare every text element against the content edge of the box it is
  // in. That is what a person sees — words crossing a border.
  for (const el of document.querySelectorAll("body *")) {
    const parent = el.parentElement;
    if (!parent || parent === document.body) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    if (style.position === "absolute" || style.position === "fixed") continue;
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    // Only the element that owns the words, so one address is one finding.
    const ownsText = [...el.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim().length > 0,
    );
    if (!ownsText) continue;

    // Anywhere up the tree that scrolls sideways makes this legitimate.
    let scroller = false;
    for (let up = parent; up && up !== document.body; up = up.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(up).overflowX)) { scroller = true; break; }
    }
    if (scroller) continue;

    const ps = getComputedStyle(parent);
    const pbox = parent.getBoundingClientRect();
    const inner = pbox.right - parseFloat(ps.paddingRight || "0") - parseFloat(ps.borderRightWidth || "0");
    const past = Math.round(el.getBoundingClientRect().right - inner);
    if (past > slack) {
      out.push({ kind: "text crosses the edge of its container", by: past, ...describe(el) });
    }
  }

  return {
    pageScrollsSideways: Math.max(0, root.scrollWidth - viewport),
    findings: out,
  };
}`;

async function main() {
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME });
  let total = 0;
  // ⚠️ Counted separately and reported loudly. A route that could not be
  // audited is not a route with nothing wrong with it, and the first run of
  // this script said "Nothing runs off the edge" while every single page had
  // failed to evaluate.
  let broken = 0;

  for (const width of WIDTHS) {
    console.log(`\n${"=".repeat(58)}\n  ${width}px, ${THEME}\n${"=".repeat(58)}`);
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: THEME,
    });

    for (const step of STEPS) {
      const seen = new Set();
      const check = async (where) => {
        // Called, not passed. See the note on FIND_OVERFLOW.
        const { pageScrollsSideways, findings } = await page.evaluate(
          `(${FIND_OVERFLOW})(${SLACK})`,
        );
        const fresh = findings.filter((f) => {
          const key = `${f.kind}|${f.tag}|${f.cls}|${f.text}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (pageScrollsSideways > SLACK) {
          console.log(`\n  ${step.name}${where ? ` — ${where}` : ""}`);
          console.log(`    ⚠️ the page itself scrolls sideways by ${pageScrollsSideways}px`);
          total += 1;
        }
        if (fresh.length === 0) return;
        if (pageScrollsSideways <= SLACK) {
          console.log(`\n  ${step.name}${where ? ` — ${where}` : ""}`);
        }
        for (const f of fresh) {
          total += 1;
          console.log(`    ${f.kind} by ${f.by}px`);
          console.log(`      <${f.tag}> ${f.cls ? `.${f.cls.replace(/ /g, ".")}` : ""}`);
          if (f.text) console.log(`      "${f.text}"`);
        }
      };

      try {
        await page.goto(`${BASE}${step.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
        // The cookie bar covers the bottom of every first visit and is itself a
        // fixed element; dismissing it is what the next visitor sees.
        await page.getByRole("button", { name: /^ok$/i }).click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(700);
        if (step.act) await step.act(page, check);
        else await check("");
      } catch (error) {
        broken += 1;
        console.log(`\n  ${step.name}\n    ⚠️ could not audit: ${error.message.split("\n")[0]}`);
      }
    }
    await page.close();
  }

  await browser.close();
  console.log(`\n${"=".repeat(58)}`);
  if (broken > 0) {
    console.log(`  ⚠️ ${broken} could not be audited — the run below is incomplete.`);
  }
  console.log(
    total === 0
      ? broken > 0
        ? "  No findings, but see above: this run did not look at everything."
        : "  Nothing runs off the edge."
      : `  ${total} findings.`,
  );
  console.log(`${"=".repeat(58)}\n`);
  // ⚠️ Always zero. This is a report to read, not a gate — a wide table inside
  // its own scroller is a false positive nobody should have to silence to land
  // an unrelated change. tests/ is where the pass/fail lives.
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
