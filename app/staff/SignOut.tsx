"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui/Button";

// A button rather than a link, because signing out is a POST — see the note in
// app/api/staff/logout. A link would let anything that can make this browser
// follow a URL end somebody's shift mid-order.
export default function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="quiet"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/staff/logout", { method: "POST" }).catch(() => {});
        router.refresh();
        router.push("/staff/login");
      }}
    >
      Sign out
    </Button>
  );
}
