# corner-bagel

A [Spectrum](https://photon.codes/docs/spectrum-ts) project. Wired with: iMessage.

## Environment

Before running, open `.env` and fill in the values:

From your project Settings on the [Photon dashboard](https://app.photon.codes):

- `PROJECT_ID`
- `PROJECT_SECRET`

## Run

```sh
bun install
bun start
```

## Deploy (Render)

This app is a long-running process with no HTTP server, so it deploys as a
Render **Background Worker**, defined in `render.yaml` at the repo root
(builds via the included `Dockerfile`).

1. In the Render dashboard: **New > Blueprint**, point it at this repo.
2. Render finds `render.yaml` and provisions the `corner-bagel` worker.
3. Set `PROJECT_ID` and `PROJECT_SECRET` in the service's Environment tab
   (they're marked `sync: false` in the blueprint, so Render prompts for them
   rather than committing them to the repo).

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Edit `src/index.ts` to replace the echo loop with real agent logic.
- Add more providers from `spectrum-ts/providers/*`.
