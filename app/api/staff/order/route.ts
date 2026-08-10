import { isEmailConfigured, sendEmail } from "../../../email";
import { currentStaff } from "../../../staff/session";
import { locationOf } from "../../../staff/staff";
import { composeOrderEmail } from "../../../staff/orderEmail";
import { attachmentName, renderInvoice, renderOrderList, type OrderMeta } from "../../../staff/orderPdf";
import { priceOrder, supplierById, type OrderLine } from "../../../staff/supplies";

// Sending the shop's ingredient order to its suppliers.
//
// One request from the browser, one email per supplier, each with that
// supplier's lines and nobody else's.
//
// Node rather than the edge: the PDFs need the font off disk.
export const runtime = "nodejs";

// ——— What the browser is allowed to say ———
//
// Item ids and counts. Not names, not pack sizes, not prices — those are read
// from app/staff/supplies.ts on this side. A form that could name its own
// price is a form that will eventually be asked to, and the document that
// leaves here has to be something the shop can stand behind.

// Far enough out to cover a standing order placed a season ahead, close enough
// that a mistyped year is caught rather than mailed.
const MAX_DAYS_AHEAD = 120;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkDay(value: unknown, now: Date): { ok: true; day: string } | { ok: false; why: string } {
  if (typeof value !== "string" || !ISO_DAY.test(value)) {
    return { ok: false, why: "Pick a delivery day." };
  }
  const asked = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(asked.getTime())) return { ok: false, why: "That isn't a real date." };
  // Compared in Los Angeles, because "today" is a question about where the shop
  // is, not about where the server is. Both sides are midday, so neither can be
  // nudged across a boundary by an hour's difference.
  const today = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now)}T12:00:00Z`,
  );
  const days = Math.round((asked.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { ok: false, why: "That day has already been." };
  if (days > MAX_DAYS_AHEAD) return { ok: false, why: "That's too far ahead to order for." };
  return { ok: true, day: value };
}

function readLines(value: unknown): OrderLine[] {
  if (!Array.isArray(value)) return [];
  const lines: OrderLine[] = [];
  for (const entry of value) {
    const line = (entry ?? {}) as { itemId?: unknown; quantity?: unknown };
    if (typeof line.itemId !== "string" || typeof line.quantity !== "number") continue;
    lines.push({ itemId: line.itemId, quantity: line.quantity });
  }
  return lines;
}

export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Sign in first." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const body = (payload ?? {}) as { requestedFor?: unknown; orders?: unknown };

  const now = new Date();
  const day = checkDay(body.requestedFor, now);
  if (!day.ok) return Response.json({ error: day.why }, { status: 400 });

  // The location is the signed-in person's, never the request's. That is the
  // whole point of the accounts being pinned to a shop: ordering for the wrong
  // one is not a mistake anybody can make, including by editing a form.
  const location = locationOf(staff);

  const priced = [];
  for (const entry of Array.isArray(body.orders) ? body.orders : []) {
    const order = (entry ?? {}) as { supplierId?: unknown; lines?: unknown };
    if (typeof order.supplierId !== "string") continue;
    const supplier = supplierById(order.supplierId);
    if (!supplier) continue;
    const result = priceOrder(supplier, readLines(order.lines));
    if (result.lines.length > 0) priced.push(result);
  }

  if (priced.length === 0) {
    return Response.json({ error: "Nothing to order yet." }, { status: 400 });
  }

  // Refused rather than faked. /api/apply tells an applicant it worked when
  // there is no key, because their application is in the log and the
  // alternative is a dead end for a person. This is the opposite case: a
  // purchase order that silently didn't send is a delivery that silently
  // doesn't arrive, and somebody finds out when the flour runs out.
  if (!isEmailConfigured()) {
    return Response.json(
      { error: "Email isn't configured, so nothing was sent. Set RESEND_API_KEY." },
      { status: 503 },
    );
  }

  const meta: OrderMeta = {
    location,
    requestedFor: day.day,
    placedBy: staff.name,
    placedAt: now,
  };

  // A copy of every order in the shop's own mailbox. With no database, that is
  // the record of what was ordered and when.
  const record = process.env.ORDERING_INBOX;

  const sent: string[] = [];
  const failed: { supplier: string; detail: string }[] = [];

  // In sequence, not in parallel. Five suppliers is five requests, Resend
  // rate-limits, and a partial failure is much easier to report honestly when
  // the sends didn't race each other.
  for (const order of priced) {
    const composed = composeOrderEmail(order, meta);
    try {
      const [list, invoice] = await Promise.all([
        renderOrderList(order, meta),
        renderInvoice(order, meta),
      ]);
      const result = await sendEmail({
        from: "orders",
        to: order.supplier.rep.email,
        subject: composed.subject,
        html: composed.html,
        text: composed.text,
        // A rep replying about a substitution should reach the shop, not a
        // no-reply address. The ordering mailbox when there is one, otherwise
        // whoever pressed send.
        replyTo: record ?? staff.email,
        ...(record ? { bcc: record } : {}),
        attachments: [
          { filename: attachmentName("Order List", location.name), bytes: list },
          { filename: attachmentName("Invoice", location.name), bytes: invoice },
        ],
      });
      if (result.sent) {
        sent.push(order.supplier.name);
      } else {
        failed.push({
          supplier: order.supplier.name,
          detail: result.reason === "failed" ? result.detail : result.reason,
        });
      }
    } catch (error) {
      failed.push({
        supplier: order.supplier.name,
        detail: error instanceof Error ? error.message : "render failed",
      });
    }
  }

  if (failed.length > 0) {
    console.error("[staff/order] some orders did not send:", failed);
  }

  // Partial success is reported as partial. Rounding it up to "sent" would
  // leave somebody believing four suppliers have their order when three do,
  // and the one that failed is the one nobody chases.
  return Response.json(
    {
      ok: failed.length === 0,
      sent,
      failed: failed.map((entry) => entry.supplier),
      requestedFor: day.day,
    },
    { status: failed.length === 0 ? 200 : 502 },
  );
}
