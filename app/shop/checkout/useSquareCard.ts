"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useResolvedTheme } from "../../theme";

// Square's hosted card fields, and the token they produce.
//
// ——— What makes this different from useCard ———
//
// useCard next door holds a card number in React state. That was safe precisely
// because nothing charged anybody: the number stayed in the browser and only a
// brand and four digits ever left. Now that there is a charge, the number must
// not be in our state at all — not in a variable, not in a ref, not in a form
// field we render.
//
// So the fields below are not ours. Square serves them from its own origin
// inside iframes, the digits are typed into Square's document, and the only
// thing that crosses back is an opaque single-use token. Our JavaScript cannot
// read the number even if it wanted to, which is a much stronger guarantee than
// a promise not to look, and it is what keeps this deployment out of the PCI
// scope that handling a PAN would drag it into.
//
// ——— Why the script is loaded here rather than in a <Script> tag ———
//
// The URL depends on the environment, which comes from the server at request
// time — see /api/payments-config. A tag in the layout would have to know
// sandbox from production at build time, which is the thing that config
// endpoint exists to avoid, and it would load Square's SDK on every page in the
// app rather than on the one screen that takes money.

/** What a receipt is allowed to know about a card typed into Square's iframes.
 *
 *  ⚠️ A brand and four digits, which is the same pair app/shop/checkout/card.ts
 *  permits itself and for the same reason. There is no shape here that can hold
 *  a card number, so nothing downstream can accidentally be handed one. */
export type TokenizedCard = { brand: string | null; last4: string | null };

type SquareCard = {
  attach: (selector: string | HTMLElement) => Promise<void>;
  tokenize: () => Promise<{
    status: string;
    token?: string;
    errors?: { message?: string }[];
    // Square describes the card it just tokenized. This used to be left off the
    // type and thrown away with the rest of the result, which is why the
    // confirmation could not name the card on any order that actually paid for
    // itself — see labelForSquareBrand().
    details?: { card?: { brand?: string; last4?: string } };
  }>;
  destroy?: () => Promise<void>;
};

type SquarePayments = {
  card: (options?: { style?: Record<string, Record<string, string>> }) => Promise<SquareCard>;
  verifyBuyer: (
    token: string,
    details: unknown,
  ) => Promise<{ token?: string } | null>;
};

declare global {
  interface Window {
    Square?: { payments: (appId: string, locationId: string) => SquarePayments };
  }
}

type Config = {
  provider: "square" | null;
  applicationId?: string;
  locationId?: string;
  environment?: "sandbox" | "production";
};

export type SquareCardEntry = {
  /** Whether this shop charges cards at all. False means the checkout behaves
   *  exactly as it did before: the money moves at the counter. */
  enabled: boolean;
  /** The fields are mounted and can be typed into. */
  ready: boolean;
  /** Something went wrong loading or mounting. The checkout says so rather than
   *  showing an empty box where a card field should be. */
  error: string | null;
  /** Where the iframes go.
   *
   *  ⚠️ A callback ref, not a RefObject, and the difference is the whole bug
   *  this replaced. The card fields are rendered only once somebody selects
   *  "Pay now by card", which happens well after the config has arrived. An
   *  effect keyed on the config alone therefore ran once against a container
   *  that did not exist yet, returned early, and was never woken again — the
   *  node appeared later and nothing was watching for it. The screen sat on
   *  "Loading the card fields…" forever.
   *
   *  A callback ref makes the node attaching an event rather than a silent
   *  mutation, so the effect below can depend on it. */
  mountRef: (node: HTMLDivElement | null) => void;
  /** Hand the typed card to Square and take back a token.
   *
   *  Null when the card was refused or incomplete — the caller must not submit
   *  the order in that case. Never returns anything derived from the number. */
  tokenize: (buyer: {
    amountCents: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) => Promise<{ token: string; verificationToken?: string; card: TokenizedCard } | null>;
};

/** The checkout's own colours, handed to Square as literal values.
 *
 *  ——— Why this is not just CSS ———
 *
 *  Square's fields are iframes served from Square's origin. They cannot see this
 *  document's stylesheet, so `var(--cb-surface)` means nothing inside them and a
 *  class name reaches nothing. The only way to style them is to pass resolved
 *  values through the SDK — which means reading the custom properties out of the
 *  page at mount time and sending the colours they currently hold.
 *
 *  That in turn is why the theme is a dependency of the mount effect below: a
 *  light/dark flip changes what these variables resolve to, and the iframe has
 *  already been handed the old answer. Nothing repaints it but a re-mount.
 *
 *  ⚠️ Square accepts a fixed set of properties per selector and rejects the
 *  rest, so this stays to the documented ones. The font is a system stack rather
 *  than the page's own face: a webfont would have to be loadable from Square's
 *  origin, and one that silently fails to load is worse than one that was never
 *  asked for. */
function fieldStyle(): Record<string, Record<string, string>> {
  const read = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  const surface = read("--cb-surface", "#fdfcf7");
  const ink = read("--cb-ink", "#1d1c19");
  const quieter = read("--cb-quieter", "#666666");
  const line = read("--cb-line-soft", "#ddd6c2");
  const red = read("--cb-red", "#be1923");

  return {
    // 16px, the same as the fields above it — and the size below which iOS
    // Safari zooms the page when a field takes focus.
    input: {
      backgroundColor: surface,
      color: ink,
      fontSize: "16px",
      // ⚠️ One family name. Not a stack.
      //
      // This was a CSS font stack, chosen to be the safe option, and it is what
      // took the card field off the checkout entirely:
      //
      //   Invalid style value '-apple-system, BlinkMacSystemFont, …'
      //   for property 'fontFamily'
      //
      // Square parses this value itself rather than handing it to a browser, and
      // it accepts a single family. Commas and nested quotes are not a fallback
      // chain here, they are a syntax error — and the error arrives at attach
      // time, inside an iframe, which is why it stayed invisible for days.
      //
      // Helvetica Neue is the value Square's own documented example uses, so it
      // is known to be accepted. The page's own face would need to be loadable
      // from Square's origin, which is a different piece of work.
      fontFamily: "Helvetica Neue",
    },
    "input::placeholder": { color: quieter },
    // ⚠️ Border only. `.input-container` accepts borderColor, borderRadius and
    // borderWidth and nothing else — Square's own CardClassSelectors type calls
    // it ComponentPropertyValues — and a backgroundColor here does not get
    // ignored, it throws, which takes the whole field off the screen. The ground
    // belongs on `input` above, where it is.
    ".input-container": {
      borderColor: line,
      borderRadius: "12px",
      borderWidth: "1px",
    },
    // Matches what the name and phone fields do on focus, so the whole form
    // behaves as one form.
    ".input-container.is-focus": { borderColor: ink },
    ".input-container.is-error": { borderColor: red },
    ".message-text": { color: quieter },
    ".message-text.is-error": { color: red },
    ".message-icon": { color: quieter },
    ".message-icon.is-error": { color: red },
  };
}

function scriptFor(environment: "sandbox" | "production"): string {
  return environment === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";
}

/** Load Square's SDK once per page, however many times this hook runs. */
function loadSdk(src: string): Promise<void> {
  if (window.Square) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("square-sdk-failed")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("square-sdk-failed"));
    document.head.appendChild(script);
  });
}

export function useSquareCard(): SquareCardEntry {
  const [config, setConfig] = useState<Config | null>(null);
  // A dependency of the mount, not a decoration: see fieldStyle() above for why
  // a theme change has to rebuild the iframe rather than restyle it.
  const theme = useResolvedTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State rather than a ref, so that the container appearing re-runs the effect
  // that mounts into it. See the note on mountRef above.
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const mountRef = useCallback((node: HTMLDivElement | null) => setMount(node), []);
  const cardRef = useRef<SquareCard | null>(null);
  const paymentsRef = useRef<SquarePayments | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments-config")
      .then((response) => (response.ok ? response.json() : { provider: null }))
      .then((answer: Config) => {
        if (!cancelled) setConfig(answer);
      })
      .catch(() => {
        // Unreachable config is not "no card payments" — it is a broken page,
        // and saying so beats silently falling back to a checkout that takes
        // an order without taking the money.
        if (!cancelled) setError("config");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (config?.provider !== "square" || !config.applicationId || !config.locationId) return;
    // The container has to exist before Square can attach to it, and it does not
    // exist until the customer selects the card tender — long after the config
    // lands. So this waits for the node rather than assuming it.
    if (!mount) return;

    let cancelled = false;
    let mounted: SquareCard | null = null;

    (async () => {
      try {
        await loadSdk(scriptFor(config.environment ?? "sandbox"));
        if (cancelled || !window.Square) return;
        const payments = window.Square.payments(config.applicationId!, config.locationId!);
        paymentsRef.current = payments;
        // ⚠️ Styled if it can be, plain if it cannot.
        //
        // Square validates the style object and *throws* on a property it does
        // not accept for a selector. That is the whole failure: the field never
        // mounts, the checkout shows an error, and nobody can pay — over a
        // colour. A white field that works beats a themed field that is not
        // there, and this app cannot reach Square's documentation to check the
        // allowed list against a future version of it.
        //
        // So the theme is an enhancement that is allowed to fail, and the log
        // says which happened rather than leaving somebody to wonder why the
        // colours are wrong.
        // ⚠️ Both calls, because the second is the one that validates.
        //
        // This wrapped payments.card() alone, on the assumption that a style is
        // checked when it is handed over. It is not: Square validates at attach
        // time, so an invalid style threw *past* the fallback and took the field
        // off the page — which is exactly the failure the fallback existed to
        // prevent, sitting one line above the call that needed it.
        //
        // Styled if it can be, plain if it cannot. A white field that works
        // beats a themed field that is not there, and this app cannot check the
        // allowed values against a future version of the SDK.
        let card = await payments.card({ style: fieldStyle() });
        if (cancelled) return;
        try {
          await card.attach(mount);
        } catch (styleError) {
          const why = styleError instanceof Error ? styleError.message : "unknown";
          console.warn(
            "[square] the card fields refused our styling and are rendering in" +
              ` Square's default appearance: ${why}`,
          );
          await card.destroy?.().catch(() => undefined);
          if (cancelled) return;
          card = await payments.card();
          await card.attach(mount);
        }
        if (cancelled) {
          // Attached after the screen went away. Tearing it down here rather
          // than leaving an orphaned iframe listening on a dead node.
          await card.destroy?.().catch(() => undefined);
          return;
        }
        mounted = card;
        cardRef.current = card;
        setReady(true);
      } catch (mountError) {
        // ⚠️ Said out loud, because the screen cannot say it.
        //
        // The customer gets one sentence — there is nothing useful to tell
        // somebody who just wants a bagel — but whoever is configuring this
        // needs the actual reason, and every way this fails looks identical
        // from the outside: an empty box and a red line.
        //
        // window.Square.payments() throws when the application id and the
        // location id are not from the same Square account, which is the same
        // mismatch that makes the server's calls come back FORBIDDEN. One cause,
        // two symptoms, and this is the half that was silent.
        const said = mountError instanceof Error ? mountError.message : String(mountError);
        console.error("[square] the card fields could not be mounted:", said);
        // ——— And sent where somebody will actually see it ———
        //
        // The console line above is invisible on a phone, which is where this
        // shop is configured and tested from. This puts the same sentence in
        // the deployment log, which is read. See /api/client-error for why that
        // endpoint is as narrow as it is.
        //
        // Fire and forget: a checkout must not get slower, or fail differently,
        // because a diagnostic could not be delivered.
        void fetch("/api/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ where: "square-card-mount", message: said }),
          keepalive: true,
        }).catch(() => undefined);
        if (!cancelled) setError("mount");
      }
    })();

    return () => {
      cancelled = true;
      cardRef.current = null;
      setReady(false);
      void mounted?.destroy?.().catch(() => undefined);
    };
  }, [config, mount, theme]);

  const tokenize = useCallback<SquareCardEntry["tokenize"]>(async (buyer) => {
    const card = cardRef.current;
    if (!card) return null;
    try {
      const result = await card.tokenize();
      if (result.status !== "OK" || !result.token) return null;

      // ——— 3-D Secure, when the card's bank asks for it ———
      //
      // Square calls this buyer verification, and it is what turns a
      // liability-shifted transaction into one the shop is not on the hook for
      // if the card turns out to be stolen. It can show a challenge, so it runs
      // here at submit rather than while somebody is still typing.
      //
      // A failure is not fatal: the payment can still go through without it,
      // and refusing an order because an optional verification step did not
      // answer would turn a working card into a refused one.
      let verificationToken: string | undefined;
      try {
        const verified = await paymentsRef.current?.verifyBuyer(result.token, {
          // Square wants a decimal string here, not cents.
          amount: (buyer.amountCents / 100).toFixed(2),
          currencyCode: "USD",
          intent: "CHARGE",
          billingContact: {
            givenName: buyer.firstName,
            familyName: buyer.lastName,
            ...(buyer.email ? { email: buyer.email } : {}),
            ...(buyer.phone ? { phone: buyer.phone } : {}),
          },
        });
        verificationToken = verified?.token;
      } catch {
        verificationToken = undefined;
      }

      // The two harmless facts about the card, carried back beside the token.
      // Square is the only party that saw the number; if it declines to say,
      // both stay null and the receipt simply does not name the card.
      const tokenized: TokenizedCard = {
        brand: result.details?.card?.brand ?? null,
        last4: result.details?.card?.last4 ?? null,
      };

      return {
        token: result.token,
        ...(verificationToken ? { verificationToken } : {}),
        card: tokenized,
      };
    } catch {
      return null;
    }
  }, []);

  return {
    enabled: config?.provider === "square",
    ready,
    error,
    mountRef,
    tokenize,
  };
}
