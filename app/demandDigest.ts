import "server-only";

import { LOCATIONS, milesBetween } from "./(marketing)/locations/locations";
import { SHOP_EMAIL, SHOP_TIME_ZONE } from "./shopFacts";
import { demandOn, type DayRow } from "./demand";
import { emailShell, escapeHtml, sendEmail, type SendResult } from "./email";

// Yesterday, as a page the shop reads over coffee.
//
// ——— What this is trying to be ———
//
// Not a dashboard. A dashboard is a thing somebody has to remember to open,
// and a shop deciding where to put its next quarter of a million dollars will
// not remember. This arrives, it is short, and every number on it is one
// somebody could act on.
//
// The order of the sections is the order the questions get asked: what did we
// sell, where did it go, and who did we turn away. The refusals are last
// because they are the part that compounds — one morning's are noise, six
// weeks' are a map.

/** Which day the digest is about, in the shop's own zone.
 *
 *  Yesterday rather than today, and the shop's clock rather than the server's.
 *  A digest sent at 5am UTC covering "today" would cover the four hours of a
 *  Los Angeles night, which is a report about nothing. */
export function digestDay(now: Date = new Date()): string {
  const shopNow = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SHOP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
  );
  shopNow.setUTCDate(shopNow.getUTCDate() - 1);
  return shopNow.toISOString().slice(0, 10);
}

/** The nearest counter to a cell, and how far. What turns a coordinate into a
 *  sentence somebody can read without a map open. */
function nearestCounter(at: [number, number]): { name: string; miles: number } {
  const store = LOCATIONS.reduce((best, next) =>
    milesBetween(at, next.position) < milesBetween(at, best.position) ? next : best,
  );
  return { name: store.name, miles: milesBetween(at, store.position) };
}

const counterName = (id: string) =>
  LOCATIONS.find((store) => store.id === id)?.name ?? id;

type Section = { title: string; lines: string[]; note?: string };

/** The digest as text, which is also what the HTML is built from.
 *
 *  One shape rather than two, so the plain-text part of the mail cannot drift
 *  from the HTML part and quietly become the version nobody proofread. */
export function buildDigest(day: string, rows: DayRow[]): {
  subject: string;
  sections: Section[];
  total: number;
} {
  const sum = (filter: (row: DayRow) => boolean) =>
    rows.filter(filter).reduce((n, row) => n + row.n, 0);

  const placed = sum((r) => r.outcome === "placed");
  const refused = sum((r) => r.outcome === "refused");
  const interest = sum((r) => r.outcome === "interest");

  const sections: Section[] = [];

  // ——— Pickup, by counter ———
  const pickupRows = rows.filter((r) => r.mode === "pickup" && r.outcome === "placed");
  sections.push({
    title: `Pickup — ${sum((r) => r.mode === "pickup" && r.outcome === "placed")} orders`,
    lines: byCounter(pickupRows),
    note: pickupRows.length === 0 ? "No pickup orders." : undefined,
  });

  // ——— Delivery, by where it went ———
  const deliveryRows = rows.filter((r) => r.mode === "delivery" && r.outcome === "placed");
  sections.push({
    title: `Delivery — ${sum((r) => r.mode === "delivery" && r.outcome === "placed")} orders`,
    lines: deliveryRows
      .slice()
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .map((row) => {
        const near = nearestCounter(row.at);
        const from = row.counter ? counterName(row.counter) : "";
        // "near USC Neighborhood, from USC Neighborhood" is the same fact
        // twice. The second half earns its place only when the delivery left
        // from somewhere other than the counter it ended up nearest — which is
        // the case worth noticing, because it is a courier crossing the city.
        return `${row.n}× near ${near.name} (${near.miles.toFixed(1)} mi)` +
          (from && from !== near.name ? `, from ${from}` : "");
      }),
    note: deliveryRows.length === 0 ? "No deliveries." : undefined,
  });

  // ——— Catering, which is interest and says so ———
  const cateringOrders = rows.filter((r) => r.mode === "catering" && r.outcome === "placed");
  const cateringInterest = rows.filter((r) => r.mode === "catering" && r.outcome === "interest");
  sections.push({
    title: `Catering — ${cateringInterest.reduce((n, r) => n + r.n, 0)} enquiries started`,
    lines: [...byCounter(cateringInterest), ...byCounter(cateringOrders)],
    // ⚠️ Said every single day, deliberately. A catering order becomes an email
    // in the shop's inbox and never returns to this app, so this number is
    // people who opened the sheet and pressed the button — not orders, and not
    // money. A reader who forgets that will read a quiet week as a quiet
    // market. The way to make it a real number is to give catering a form that
    // posts; until then the caveat is the honest half of the figure.
    note:
      "Enquiries started, not orders. Catering is a mailto, so what happens" +
      " after the button is in the inbox and not in this app.",
  });

  // ——— Refusals, last, because they compound ———
  const refusedRows = rows.filter((r) => r.outcome === "refused");
  sections.push({
    title: `Turned away — ${refused}`,
    lines: refusedRows
      .slice()
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .map((row) => {
        const near = nearestCounter(row.at);
        const where = `${row.n}× ${row.averageMiles.toFixed(1)} mi out`;
        const how =
          row.channel === "checkout"
            ? "at the checkout"
            : row.channel === "area"
              ? "on the delivery page"
              : "in the finder";
        return `${where}, nearest ${near.name}, ${how}`;
      }),
    note:
      refusedRows.length === 0
        ? "Nobody was turned away."
        : "A refusal at the checkout is somebody with a basket. Six weeks of" +
          " these is the map of where to open next.",
  });

  return {
    subject: `Corner Bagel — ${day} — ${placed} orders, ${refused} turned away`,
    sections,
    total: placed + refused + interest,
  };
}

function byCounter(rows: DayRow[]): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.counter, (totals.get(row.counter) ?? 0) + row.n);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${n}× ${id ? counterName(id) : "no counter recorded"}`);
}

function asText(day: string, sections: Section[]): string {
  const out = [`Corner Bagel — demand on ${day}`, ""];
  for (const section of sections) {
    out.push(section.title);
    for (const line of section.lines) out.push(`  ${line}`);
    if (section.note) out.push(`  (${section.note})`);
    out.push("");
  }
  out.push("Counted as neighbourhood tallies, never as addresses. See app/demand.ts.");
  return out.join("\n");
}

function asHtml(day: string, sections: Section[]): string {
  const body = sections
    .map(
      (section) =>
        `<h2 style="margin:24px 0 8px;font-size:15px;font-weight:600;">${escapeHtml(section.title)}</h2>` +
        (section.lines.length > 0
          ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;">` +
            section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("") +
            `</ul>`
          : "") +
        (section.note
          ? `<p style="margin:6px 0 0;font-size:12px;color:#6b6b60;">${escapeHtml(section.note)}</p>`
          : ""),
    )
    .join("");
  return emailShell(
    `<h1 style="margin:0;font-size:18px;font-weight:600;">Demand on ${escapeHtml(day)}</h1>` +
      body +
      `<p style="margin:28px 0 0;font-size:12px;color:#6b6b60;">` +
      `Counted as neighbourhood tallies, never as addresses.</p>`,
  );
}

/** Build and send one day's digest.
 *
 *  Null rows — no database — is not an empty day and must not be mailed as
 *  one: a report saying "0 orders" when the truth is "nothing was counted"
 *  is worse than no report, because somebody would believe it. */
export async function sendDigest(
  day: string,
): Promise<SendResult | { sent: false; reason: "no-store" }> {
  const rows = await demandOn(day);
  if (rows === null) return { sent: false, reason: "no-store" };

  const { subject, sections } = buildDigest(day, rows);
  return sendEmail({
    to: SHOP_EMAIL,
    subject,
    html: asHtml(day, sections),
    text: asText(day, sections),
  });
}
