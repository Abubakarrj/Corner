"use client";

import { useState } from "react";
import { Button } from "../../ui/Button";
import { Notice, StaffField } from "../StaffUI";

export default function InviteForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSentTo("");
    try {
      const response = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "That didn't send.");
        return;
      }
      setSentTo(email);
      setName("");
      setEmail("");
      setRole("member");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <StaffField label="Name" value={name} onChange={setName} autoComplete="off" required />
      <StaffField
        label="Email"
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="off"
        required
      />

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[12px] text-muted">Role</legend>
        <div className="flex gap-2">
          {(
            [
              ["member", "Member", "Places ingredient orders."],
              ["admin", "Admin", "Also invites people."],
            ] as const
          ).map(([id, title, detail]) => (
            <label
              key={id}
              className={`flex-1 cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                role === id ? "border-ink bg-raise" : "border-line-soft bg-surface"
              }`}
            >
              <input
                type="radio"
                name="cb-invite-role"
                className="sr-only"
                checked={role === id}
                onChange={() => setRole(id)}
              />
              <span className="block text-[14px] text-ink">{title}</span>
              <span className="block text-[12px] text-quiet">{detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {sentTo ? (
        <Notice tone="good">
          Invite sent to {sentTo}. Once they choose a password, every admin gets the line to
          add to STAFF_ACCOUNTS — they can sign in after that goes live.
        </Notice>
      ) : null}

      <Button type="submit" disabled={busy} block>
        {busy ? "Sending…" : "Send invite"}
      </Button>

      {/* Said on the screen and not only in a source comment, because the
          person pressing this needs to know the invite does not finish the
          job by itself. */}
      <p className="m-0 text-[12px] text-quiet">
        There is no accounts database yet, so the last step is manual: the finished credential
        line is emailed to the admins to paste into STAFF_ACCOUNTS. Their password is never in
        that email — only a hash of it.
      </p>
    </form>
  );
}
