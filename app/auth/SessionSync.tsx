"use client";

import { useEffect } from "react";
import { syncSession } from "../account";

// Reconciles the local account echo with the session cookie, once, on mount.
//
// It renders nothing. It exists because the cookie is httpOnly — deliberately
// unreadable by script — so the only way for the client to learn whether it's
// still signed in is to ask. Without it, a session that expired or was signed
// out on another device goes on looking signed in here until something
// happens to fail.
export default function SessionSync() {
  useEffect(() => {
    void syncSession();
  }, []);
  return null;
}
