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

Nothing in this app runs on a timer. One job needs to, and it is one
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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
