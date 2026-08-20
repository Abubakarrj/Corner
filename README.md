This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Scheduled jobs

Nothing in this app runs on a timer. Two jobs need to, and each is one
authenticated request a day.

### The daily demand digest

Where demand came from yesterday — pickup by counter, delivery by
neighbourhood, catering enquiries, and every address the delivery radius turned
away — emailed to the shop. Point a Render Cron Job (or a GitHub Action, or
anything that can make a request on a schedule) at:

```sh
curl -fsS -X POST https://thecornerbagel.com/api/digest \
     -H "Authorization: Bearer $KITCHEN_TOKEN"
```

`0 15 * * *` is 7am in Los Angeles for most of the year, so the mail is there
when the shop opens.

It sends once per day whatever the schedule does: the first call claims the day
and a second is answered `already-sent`, so a cron that retries on a timeout
cannot mail two copies. To send one again on purpose — a digest lost when the
mail itself failed — name the day, which skips the claim:

```sh
curl -fsS -X POST "https://thecornerbagel.com/api/digest?day=2026-08-19" \
     -H "Authorization: Bearer $KITCHEN_TOKEN"
```

Needs `KITCHEN_TOKEN`, `RESEND_API_KEY` and `CORNER_DATABASE_URL`. Without the
database nothing is counted and the endpoint says so rather than mailing a page
of zeroes.

### Gift cards dated for later

A gift card bought on Tuesday for a birthday on Saturday is issued and paid for
on Tuesday and has to arrive on Saturday. This is what sends it:

```sh
curl -fsS -X POST https://thecornerbagel.com/api/gift-send \
     -H "Authorization: Bearer $KITCHEN_TOKEN"
```

`0 15 * * *` again, and for a better reason than the digest's: a birthday card
should arrive with breakfast rather than at midnight. The day it compares
against is the shop's own, so a schedule at `0 0 * * *` would be looking at
tomorrow for everybody west of Greenwich.

Safe to run more often, and safe to run twice by accident — a card that has been
sent is no longer owed, so the second run finds nothing. To catch up after an
outage, name the day; cards dated before it are owed too, so this only moves the
line forward:

```sh
curl -fsS -X POST "https://thecornerbagel.com/api/gift-send?day=2026-08-19" \
     -H "Authorization: Bearer $KITCHEN_TOKEN"
```

It answers `200` with `{ sent, failed, considered }` as long as it ran. **A run
that answers `failed: 3` is not a success** — that is three people who have not
got their present, each row still owed with its reason recorded, and worth
alerting on. A cron job that goes red on one dead mailbox is a cron job somebody
switches off, which is why the status code does not carry that.

Needs `KITCHEN_TOKEN`, `CORNER_DATABASE_URL`, Square, and whichever of
`RESEND_API_KEY` / `TWILIO_*` the queued cards are going out through.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
