# server-only, stubbed

`server-only` is a Next.js marker package: importing it makes the build fail if
the module is ever pulled into a client bundle. It has no runtime behaviour, and
outside Next there is nothing to resolve it to — so a plain `tsx` run of any
server module dies on the import before reaching a line of code worth testing.

This is that package, doing nothing, reached through `NODE_PATH` in the test
script. It is under `tests/` rather than in `node_modules` on purpose: a stub
installed there would still be present at `next build`, where the real package's
protection is the whole point.
