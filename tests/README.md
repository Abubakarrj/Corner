# Tests

```
npm test                     # everything
npm test pickupSlots         # one suite, matched by substring
```

Each suite is a plain script that prints `pass` / `FAIL` lines and exits
non-zero if anything failed. `tests/run.mjs` runs them in order with `TZ=UTC`
and a stub for `server-only` — see `shim/README.md`.

## What is covered, and what is deliberately not

These cover the parts of the shop where being wrong is expensive and being
right is not obvious from reading the code: when a pickup can be promised, how
many can be promised at once, which counter an order leaves from, and how far
the shop will drive.

| Suite | What it pins |
|---|---|
| `pickupSlots` | Which minutes exist, the opening ramp, the horizon. Pure. |
| `pickupSchedule` | Which slot an order is given, and what happens when one fills. |
| `scheduledPickups` | The seat table: capacity, idempotence, and the race. **Needs Postgres.** |
| `locations` | Every counter, and everything derived from a location record. |
| `deliveryRouting` | Which kitchen a delivery leaves from, by hour and by basket. |
| `deliveryReach` | The radius as a reach around every counter. |
| `deliveryArea` | The published boundary contour, driving the real measurement. |
| `toastScheduled` | What a scheduled order looks like on the wire to Toast. |
| `demandMisses` | The refused-address counter, and what it refuses to store. **Needs Postgres.** |
| `demandWiring` | That a refusal actually reaches the counter, through a real route handler. **Needs Postgres.** |
| `policyPacks` | Every locale's privacy policy still rebuilds, section for section. |

Not covered here: anything that needs a live third party to answer. Google's
Routes behaviour has its own probe (`npm run check:maps`, which needs a real
key); Toast and Uber accepting what we send can only be learned by sending it.
The suites stub those transports and test the half that is ours — the shape we
send and the arithmetic we do with what comes back. A green run says the app is
internally consistent, not that Google agreed.

## The database suites

`scheduledPickups`, `demandMisses` and `demandWiring` skip, loudly, without a
database.

`scheduledPickups` is the only place the seat constraint can actually be
tested — a slot is a fixed set of seats and taking one is a single insert, so
that two people paying in the same second get one booking and one conflict, and
an in-memory Map cannot be wrong about isolation the way a real database can.

The two `demand` suites need one because the table *is* the privacy guarantee:
several assertions read `information_schema` to check that the columns cannot
hold an address and the coordinate columns cannot hold a precise fix.

⚠️ **They drop and recreate their tables.** Point them at a scratch database.

```sh
CORNER_DATABASE_URL=postgres://localhost/corner_test npm test
```

`demandMisses` is worth reading before changing anything in
`app/demandMisses.ts`: most of its assertions are about what the table must
*not* contain, and several of them check the schema rather than behaviour,
because "we do not store the address" is a promise about a shape.

## Writing another one

Copy the shape: a local `ok(what, cond, detail)`, a sentence per assertion
saying what the *shop* is supposed to do, and `process.exit(failures === 0 ? 0 : 1)`
at the end. The sentences are the point — when one fails, what prints is the
rule that broke rather than two objects that differ.

Then check it fails. Break the thing it covers, run it, and confirm it goes
red for the reason you expect; several assertions in these files were written
badly the first time and passed against code that was wrong.
