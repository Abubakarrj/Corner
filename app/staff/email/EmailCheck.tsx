"use client";

import { useState } from "react";
import { Button } from "../../ui/Button";
import { Notice, StaffField } from "../StaffUI";

export type EmailConfig = {
  resendKey: boolean;
  from: readonly (readonly [string, string])[];
  careersInbox: string;
  orderingInbox: string;
};

type TestResult = {
  ok: boolean;
  to: string;
  from: string;
  note?: string;
  detail?: string;
};

export default function EmailCheck({
  config,
  signedInAs,
}: {
  config: EmailConfig;
  signedInAs: string;
}) {
  const [to, setTo] = useState(signedInAs);
  const [stream, setStream] = useState("orders");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  async function test() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/staff/email-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, stream }),
      });
      setResult((await response.json()) as TestResult);
    } catch {
      setResult({ ok: false, to, from: "", detail: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-line-soft bg-surface p-4">
        <h2 className="m-0 mb-3 text-[13px] font-medium text-muted">What the server sees</h2>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-quiet">RESEND_API_KEY</dt>
          <dd
            className={`m-0 break-all ${
              config.resendKey ? "text-ink" : "font-semibold text-brand-red"
            }`}
          >
            {config.resendKey ? "set" : "MISSING — nothing can send"}
          </dd>
          {config.from.map(([name, address]) => (
            <Row key={name} label={`from · ${name}`} value={address} />
          ))}
          <Row label="applications go to" value={config.careersInbox} />
          <Row label="order copies go to" value={config.orderingInbox} />
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="m-0 text-[13px] font-medium text-muted">Send a real one</h2>
        <StaffField
          label="To"
          value={to}
          onChange={setTo}
          type="email"
          autoComplete="off"
          hint="Send it somewhere you can actually read."
        />
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[12px] text-muted">As</legend>
          <div className="flex gap-2">
            {config.from.map(([id]) => (
              <label
                key={id}
                className={`flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-center text-[13px] transition-colors ${
                  stream === id
                    ? "border-ink bg-raise text-ink"
                    : "border-line-soft bg-surface text-muted"
                }`}
              >
                <input
                  type="radio"
                  name="cb-stream"
                  className="sr-only"
                  checked={stream === id}
                  onChange={() => setStream(id)}
                />
                {id}
              </label>
            ))}
          </div>
        </fieldset>

        <Button onClick={test} disabled={busy} block>
          {busy ? "Sending…" : "Send test"}
        </Button>

        {result ? (
          <Notice tone={result.ok ? "good" : "bad"}>
            {result.ok ? (
              <>
                {result.from} → {result.to}. {result.note}
              </>
            ) : (
              <>Refused. {result.detail}</>
            )}
          </Notice>
        ) : null}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-quiet">{label}</dt>
      <dd className="m-0 break-all text-ink">{value}</dd>
    </>
  );
}
