// Who pays for a refused note.
//
// ——— Why this needed a suite of its own ———
//
// The wall gives an address six notes an hour, and until the wording check
// landed, one request meant one note and the two numbers were the same thing.
// Adding a refusal split them, and the split has a wrong answer that looks
// right: count the request.
//
// Counting the request means the filter's mistakes are what lock somebody out.
// A person whose surname the list misjudges retries with a different spelling,
// six times, and then a bagel shop they were being nice to stops speaking to
// them for an hour — and nothing anywhere records that it happened.
//
// So the budget below is spent on notes that went up, and a separate, looser
// count bounds how often the endpoint is asked. These assertions are about the
// throttle primitives that split does: `remaining` must not spend, `record`
// must spend, and the two must agree about the same window.

import { throttle } from "../app/rateLimit";

let failures = 0;
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) console.log("pass ", what);
  else {
    failures += 1;
    console.log("FAIL ", what, detail);
  }
};

const hour = 60 * 60 * 1000;

// ——— remaining() looks without touching ———
{
  const budget = throttle({ windowMs: hour, max: 6 });
  for (let attempt = 0; attempt < 20; attempt += 1) budget.remaining("a");
  ok("twenty looks spend nothing", budget.remaining("a") === 6, `${budget.remaining("a")}`);
}

// ——— record() spends, and only for its own key ———
{
  const budget = throttle({ windowMs: hour, max: 6 });
  budget.record("a");
  budget.record("a");
  ok("two records leave four", budget.remaining("a") === 4, `${budget.remaining("a")}`);
  ok("another address is untouched", budget.remaining("b") === 6, `${budget.remaining("b")}`);
}

// ——— The endpoint's shape: refuse, retry, succeed ———
//
// Six refusals then a good note. Under the old arrangement the good note is the
// seventh request and never goes up. This is the whole point of the change.
{
  const budget = throttle({ windowMs: hour, max: 6 });
  const address = "1.2.3.4";
  for (let refused = 0; refused < 6; refused += 1) {
    ok(
      `refusal ${refused + 1} still leaves room`,
      budget.remaining(address) > 0,
      `${budget.remaining(address)}`,
    );
    // ...and nothing is recorded, because nothing went up.
  }
  budget.record(address);
  ok("the note that finally worked cost one", budget.remaining(address) === 5, `${budget.remaining(address)}`);
}

// ——— And the allowance is still an allowance ———
{
  const budget = throttle({ windowMs: hour, max: 6 });
  for (let note = 0; note < 6; note += 1) budget.record("c");
  ok("six notes use it up", budget.remaining("c") === 0, `${budget.remaining("c")}`);
  budget.record("c");
  ok("and it does not go negative", budget.remaining("c") === 0, `${budget.remaining("c")}`);
}

// ——— exceeded() is unchanged for everyone else ———
//
// Three other endpoints call it and none of them were touched. It still counts
// its own call, which is what they rely on.
{
  const gate = throttle({ windowMs: hour, max: 2 });
  ok("first call allowed", gate.exceeded("d") === false);
  ok("second call allowed", gate.exceeded("d") === false);
  ok("third call refused", gate.exceeded("d") === true);
  ok("and it counted them itself", gate.remaining("d") === 0, `${gate.remaining("d")}`);
}

// ——— The two counters share a window but not a budget ———
{
  const notes = throttle({ windowMs: hour, max: 6 });
  const asks = throttle({ windowMs: hour, max: 40 });
  for (let ask = 0; ask < 30; ask += 1) asks.exceeded("e");
  ok("thirty asks do not touch the notes budget", notes.remaining("e") === 6, `${notes.remaining("e")}`);
  ok("but they are counted", asks.remaining("e") === 10, `${asks.remaining("e")}`);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
