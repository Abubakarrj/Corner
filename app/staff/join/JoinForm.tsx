"use client";

import { useState } from "react";
import { Button } from "../../ui/Button";
import { Notice, StaffField } from "../StaffUI";

const MIN_LENGTH = 12;

export default function JoinForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    // Checked here so the mismatch is caught before the password is sent
    // anywhere, and again on the server for the length, which is the rule that
    // actually matters.
    if (password !== again) {
      setError("Those two don't match.");
      return;
    }
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "That didn't work.");
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Notice tone="good">
        Password set. An admin has to add you before you can sign in — they have just been
        emailed everything they need. You&rsquo;ll be able to sign in at /staff once they have.
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <StaffField
        label="Password"
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_LENGTH} characters. A few words you'll remember beats one clever one.`}
        required
      />
      <StaffField
        label="Password again"
        value={again}
        onChange={setAgain}
        type="password"
        autoComplete="new-password"
        required
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button type="submit" disabled={busy} block>
        {busy ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
