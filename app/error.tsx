"use client";

import { useEffect } from "react";
import Lost from "./Lost";

// A render that threw, anywhere below the root layout.
//
// ⚠️ Same reasoning as not-found.tsx and a different button: a crash is often
// transient — a failed fetch during render, a hydration mismatch on a flaky
// connection — so the first thing offered is trying again. `reset()` re-renders
// the segment without a full page load, which keeps the basket and the chosen
// counter in memory.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is Next's own handle for the server-side stack, which is the
    // only way to tie what the customer saw to what the deployment logged.
    // The message is not shown on screen: a stack trace in front of somebody
    // buying a bagel tells them nothing and tells everybody else too much.
    console.error("[app] a render failed:", error.digest ?? error.message);
  }, [error]);

  return (
    <Lost
      title="broke.title"
      lede="broke.lede"
      action={{ label: "broke.retry", onClick: reset }}
    />
  );
}
