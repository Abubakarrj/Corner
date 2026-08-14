import "server-only";

// A per-caller throttle, in memory.
//
// ——— What this is, honestly ———
//
// Not a real rate limiter. It lives in one process's heap, so it resets on
// every deploy and does not span instances: two containers behind a load
// balancer each let a caller through the full allowance. A shared store
// (Redis, or a limiter at the edge) is the real answer and this is not
// pretending to be it.
//
// It is still worth having, because the difference it makes is not "attackers
// stopped" but "one script cannot spend a day's API budget in a minute". The
// endpoints it guards each hand money to somebody: Resend for an application
// email, Anthropic for a chat turn, Google and Uber for a delivery quote. A
// ceiling that resets on deploy is a ceiling.
//
// ——— Why it's a module ———
//
// There were three copies of this function: /api/apply, /api/drop-list, and a
// fourth about to be written for /api/shop-chat. They had drifted already, in
// the small way copies do: two different variable names, two different cleanup
// strategies for the map, and one of them checked `>` where the others checked
// `>=`. None of that mattered until somebody had to answer "what are our
// limits", at which point three answers is no answer.

/** The visitor's address, as far as we can tell.
 *
 *  Render (and most PaaS) sit in front of this app as a proxy, so the real
 *  address arrives in a header rather than on the socket. That header is
 *  set by the proxy and can be forged by anyone talking to the app directly,
 *  which is worth knowing and does not change what to do: everything behind
 *  this is bounded anyway, and the alternative is throttling every visitor
 *  behind one office NAT as though they were one person. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Keys tracked before the oldest is dropped. Bounds the map on a long-lived
 *  instance being walked through a range of addresses. */
const MAX_TRACKED = 5000;

export type Throttle = {
  /** True when this key has already used its allowance. Counts the call. */
  exceeded(key: string): boolean;
  /** How many calls this key has left, without counting one. For a caller
   *  that wants to check before doing something expensive and count after. */
  remaining(key: string): number;
};

/** Builds a throttle: `max` calls per `windowMs`, sliding.
 *
 *  Each caller gets its own instance, so the chat's turn budget and the
 *  delivery quote's budget are separate counts against the same address. */
export function throttle({ windowMs, max }: { windowMs: number; max: number }): Throttle {
  const hits = new Map<string, number[]>();

  const recent = (key: string, now: number) =>
    (hits.get(key) ?? []).filter((at) => now - at < windowMs);

  return {
    exceeded(key: string): boolean {
      const now = Date.now();
      const times = recent(key, now);
      if (times.length >= max) {
        // Written back even on the refusal, so the window keeps sliding
        // rather than freezing at the moment of the first refusal.
        hits.set(key, times);
        return true;
      }
      times.push(now);
      hits.set(key, times);
      if (hits.size > MAX_TRACKED) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return false;
    },
    remaining(key: string): number {
      return Math.max(0, max - recent(key, Date.now()).length);
    },
  };
}
