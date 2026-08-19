// The test runner.
//
// ——— Why this is nine lines of spawn and not a framework ———
//
// Every suite here is a plain script that prints `pass`/`FAIL` lines and exits
// non-zero if any failed. That shape was chosen before this file existed, and
// it has one property worth keeping: a failing assertion prints the sentence a
// person wrote about what the shop is supposed to do, not a diff of two
// objects. Adding a framework would buy parallelism and a nicer summary, and
// cost that.
//
// So this runs them in order and adds up the exit codes.
//
// ——— NODE_PATH, and the stub it reaches ———
//
// Server modules import `server-only`, which resolves only inside Next. See
// tests/shim/README.md for why the stub lives here rather than in node_modules.
//
// ——— TZ=UTC, deliberately ———
//
// The shop's clock is Los Angeles and this machine's is not. Running the suite
// in UTC is what makes a timezone bug fail here instead of on a server: a
// scheduled pickup labelled with `setHours` reads correctly on a laptop in
// California and seven hours wrong everywhere the app actually runs.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const suites = readdirSync(here)
  .filter((name) => name.endsWith(".test.ts"))
  .filter((name) => !only || name.includes(only))
  .sort();

if (suites.length === 0) {
  console.error(only ? `No suite matches ${only}.` : "No suites found.");
  process.exit(1);
}

let failed = 0;
for (const suite of suites) {
  console.log(`\n── ${suite} ──`);
  const result = spawnSync("npx", ["tsx", join(here, suite)], {
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(here, "shim"), TZ: "UTC" },
  });
  if (result.status !== 0) failed += 1;
}

console.log(
  failed === 0
    ? `\n${suites.length} suites passed.`
    : `\n${failed} of ${suites.length} suites FAILED.`,
);
process.exit(failed === 0 ? 0 : 1);
