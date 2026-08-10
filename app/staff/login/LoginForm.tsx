"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { Notice, StaffField } from "../StaffUI";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "That didn't work.");
        setBusy(false);
        return;
      }
      // refresh() before push(), so the server component behind /staff renders
      // with the cookie that was just set rather than from the router's cache
      // of a page that redirected us here a moment ago.
      router.refresh();
      router.push("/staff");
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <StaffField
        label="Email"
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="username"
        required
      />
      <StaffField
        label="Password"
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="current-password"
        required
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button type="submit" disabled={busy} block>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
