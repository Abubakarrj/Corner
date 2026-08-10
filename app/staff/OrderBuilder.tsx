"use client";

import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Notice } from "./StaffUI";
import { money, type Supplier } from "./supplies";

// Building the week's order.
//
// One list per supplier, because that is how it is sent: a rep at the dairy
// gets the dairy lines and nothing else. Grouping the screen the same way the
// email is grouped means what somebody sees before pressing send is the shape
// of what goes out, rather than a flat list that silently becomes five
// messages.
//
// ——— Quantities, and what the running total is for ———
//
// The totals shown here are the shop's own last-recorded costs, the same
// figures that go on the priced document. They are on screen so that a
// mistyped quantity looks wrong before it is sent — an order that reads
// $4,200 when the week is usually $600 is a caught typo, and no amount of
// re-reading a list of numbers catches it as reliably.
//
// Nothing here is charged and no payment is taken. See app/staff/orderPdf.ts.

type Counts = Record<string, number>;

const key = (supplierId: string, itemId: string) => `${supplierId}:${itemId}`;

export default function OrderBuilder({
  suppliers,
  defaultDay,
  earliestDay,
}: {
  suppliers: Supplier[];
  /** Both come from the server, already in the shop's timezone. Working them
   *  out here would mean reading the clock during render, which the lint rules
   *  rightly refuse, and would disagree with the server on the first paint. */
  defaultDay: string;
  earliestDay: string;
}) {
  const [counts, setCounts] = useState<Counts>({});
  const [day, setDay] = useState(defaultDay);
  const [open, setOpen] = useState<string | null>(suppliers[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { ok: boolean; sent: string[]; failed: string[] } | null
  >(null);
  const [error, setError] = useState("");

  const set = (supplierId: string, itemId: string, quantity: number) => {
    const at = key(supplierId, itemId);
    setCounts((was) => {
      const next = { ...was };
      // Zero is removal, not a stored zero. The payload is then exactly what
      // was asked for, and "did I clear that?" has one visible answer.
      if (quantity <= 0) delete next[at];
      else next[at] = Math.min(quantity, 999);
      return next;
    });
    setResult(null);
  };

  const perSupplier = useMemo(
    () =>
      suppliers.map((supplier) => {
        const lines = supplier.items
          .map((item) => ({ item, quantity: counts[key(supplier.id, item.id)] ?? 0 }))
          .filter((line) => line.quantity > 0);
        return {
          supplier,
          lines,
          subtotal: lines.reduce((sum, line) => sum + line.item.unitCost * line.quantity, 0),
        };
      }),
    [suppliers, counts],
  );

  const active = perSupplier.filter((entry) => entry.lines.length > 0);
  const total = active.reduce((sum, entry) => sum + entry.subtotal, 0);

  async function send() {
    if (busy || active.length === 0) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/staff/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedFor: day,
          orders: active.map((entry) => ({
            supplierId: entry.supplier.id,
            lines: entry.lines.map((line) => ({
              itemId: line.item.id,
              quantity: line.quantity,
            })),
          })),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        sent?: string[];
        failed?: string[];
      };
      if (body.sent || body.failed) {
        setResult({
          ok: Boolean(body.ok),
          sent: body.sent ?? [],
          failed: body.failed ?? [],
        });
        // Only cleared when every supplier got theirs. A half-sent order still
        // on screen is a half-sent order somebody can finish; a cleared one is
        // one they have to rebuild from memory.
        if (body.ok) setCounts({});
      }
      if (!response.ok) setError(body.error ?? "That didn't send.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="cb-delivery-day" className="mb-1 block text-[12px] text-muted">
          Requested delivery
        </label>
        <input
          id="cb-delivery-day"
          type="date"
          value={day}
          min={earliestDay}
          onChange={(event) => setDay(event.target.value)}
          className="w-full rounded-xl border border-line-soft bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors focus:border-ink sm:w-auto"
        />
      </div>

      {perSupplier.map(({ supplier, lines, subtotal }) => {
        const isOpen = open === supplier.id;
        return (
          <section key={supplier.id} className="rounded-2xl border border-line-soft bg-surface">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : supplier.id)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-start"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">
                  {supplier.name}
                </span>
                <span className="block truncate text-[12px] text-quiet">
                  {supplier.rep.name} · {supplier.rep.email}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {lines.length > 0 ? (
                  <span className="rounded-full bg-olive px-2 py-0.5 text-[11px] font-semibold text-on-ink">
                    {lines.length}
                  </span>
                ) : null}
                <span aria-hidden className="text-quiet">
                  {isOpen ? "−" : "+"}
                </span>
              </span>
            </button>

            {isOpen ? (
              <ul className="m-0 list-none border-t border-line-faint p-0">
                {supplier.items.map((item) => {
                  const quantity = counts[key(supplier.id, item.id)] ?? 0;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 border-b border-line-faint px-4 py-2.5 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] text-ink">{item.name}</span>
                        <span className="block text-[12px] text-quiet">
                          {item.pack} · {money.format(item.unitCost)}
                        </span>
                      </span>
                      <Stepper
                        label={item.name}
                        quantity={quantity}
                        onChange={(next) => set(supplier.id, item.id, next)}
                      />
                    </li>
                  );
                })}
                {lines.length > 0 ? (
                  <li className="flex justify-between px-4 py-2.5 text-[13px] text-muted">
                    <span>Subtotal</span>
                    <span>{money.format(subtotal)}</span>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </section>
        );
      })}

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <Notice tone={result.ok ? "good" : "bad"}>
          {result.sent.length > 0 ? `Sent to ${result.sent.join(", ")}.` : ""}
          {result.failed.length > 0
            ? ` Did not send to ${result.failed.join(", ")} — those still need ordering.`
            : ""}
        </Notice>
      ) : null}

      {/* Docked to the bottom, so it clears the cookie banner the same way
          everything else docked down there does: by adding the banner's
          measured height to its own offset. Without this the consent bar sits
          on top of Send order and the one button on the screen cannot be
          pressed until somebody dismisses a banner they did not expect on an
          internal tool. See --cb-consent-h in app/CookieConsent.tsx. */}
      <div
        style={{ bottom: "var(--cb-consent-h, 0px)" }}
        className="sticky -mx-5 flex items-center justify-between gap-4 border-t border-line-soft bg-page px-5 py-4"
      >
        <span className="text-[13px] text-muted">
          {active.length === 0
            ? "Nothing selected"
            : `${active.length} ${active.length === 1 ? "supplier" : "suppliers"} · ${money.format(total)}`}
        </span>
        <Button onClick={send} disabled={busy || active.length === 0}>
          {busy ? "Sending…" : "Send order"}
        </Button>
      </div>
    </div>
  );
}

function Stepper({
  label,
  quantity,
  onChange,
}: {
  label: string;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        disabled={quantity === 0}
        onClick={() => onChange(quantity - 1)}
        className="cb-press h-8 w-8 cursor-pointer rounded-full border border-line-soft text-ink disabled:cursor-default disabled:opacity-[var(--cb-disabled)]"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`How many ${label}`}
        value={quantity === 0 ? "" : String(quantity)}
        placeholder="0"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onChange(digits === "" ? 0 : Number(digits));
        }}
        className="h-8 w-11 rounded-lg border border-line-soft bg-surface text-center text-[15px] text-ink outline-none focus:border-ink"
      />
      <button
        type="button"
        aria-label={`One more ${label}`}
        onClick={() => onChange(quantity + 1)}
        className="cb-press h-8 w-8 cursor-pointer rounded-full border border-line-soft text-ink"
      >
        +
      </button>
    </span>
  );
}
