"use client";

import { useEffect, useState } from "react";
import { useAccount } from "../../account";
import { Button, ButtonLink } from "../../ui/Button";
import Swap from "../../ui/Swap";
import { useT } from "../../i18n";
import { DISPLAY_FONT } from "../shopControls";

// Corner Rewards: joining it, and the card once you have.
//
// ——— Two screens, one route ———
//
// Not a member: what it is and one button. A member: the code and the
// balance. They are the same subject at two stages rather than two features,
// and splitting them across routes would mean a link that goes somewhere
// different depending on state — which is the thing that made Reorder and
// Account confusing.
//
// ——— What this will not claim ———
//
// The counter cannot read the code yet. Toast's loyalty integration is what
// decides what a scan contains and what the till does with it, and it is not
// wired up — so there is no Redeem button, and the card says the code is for
// the counter rather than promising it works there today. A button that fails
// in front of a queue is worse than one that is not there.
//
// Earning is real from the first order: see app/rewards.ts.

type Member = { code: string; joinedAt: number; points: number; svg: string | null };
type State =
  | { at: "loading" }
  | { at: "unavailable" }
  | { at: "join"; perDollar: number }
  | { at: "member"; member: Member; perDollar: number };

// Signed out is not one of the states above, and the fetch does not live here.
//
// It was both, once: a "guest" state set from inside the effect. That is a
// setState in an effect body for a thing that is already known at render time
// — whether somebody is signed in — and the second render it costs buys
// nothing.
//
// Keying the signed-in half on the email is the other half of the same fix.
// State inside Card would otherwise survive a sign-out and sign-in as somebody
// else, and the first paint after that would show the previous account's
// balance and code. A key makes React throw the component away instead.
export default function RewardsScreen() {
  const t = useT();
  const account = useAccount();

  return (
    <div className="mx-auto max-w-lg px-5 py-6 sm:px-6 sm:py-8">
      <h1
        className="text-[24px] font-medium leading-tight tracking-[-0.01em] text-ink"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {t("rewards.title")}
      </h1>
      {account ? (
        <Card key={account.email} />
      ) : (
        <Empty body={t("rewards.signInBody")}>
          <ButtonLink href="/membership" className="mt-5">
            {t("account.joinOrSignIn")}
          </ButtonLink>
        </Empty>
      )}
    </div>
  );
}

function Card() {
  const t = useT();
  const [state, setState] = useState<State>({ at: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/rewards")
      .then(async (response) => {
        // 204: no database, or the session did not resolve. Not "you have no
        // points" — a balance that cannot be read must never render as zero.
        if (response.status === 204) return null;
        return response.ok ? await response.json() : null;
      })
      .then((body: { member: Member | null; pointsPerDollar: number } | null) => {
        if (!live) return;
        if (!body) setState({ at: "unavailable" });
        else if (body.member) setState({ at: "member", member: body.member, perDollar: body.pointsPerDollar });
        else setState({ at: "join", perDollar: body.pointsPerDollar });
      })
      .catch(() => {
        if (live) setState({ at: "unavailable" });
      });
    return () => {
      live = false;
    };
  }, []);

  async function join() {
    setJoining(true);
    try {
      const response = await fetch("/api/rewards", { method: "POST" });
      const body = response.ok ? await response.json() : null;
      if (body?.member) setState({ at: "member", member: body.member, perDollar: body.pointsPerDollar });
      else setState({ at: "unavailable" });
    } catch {
      setState({ at: "unavailable" });
    } finally {
      setJoining(false);
    }
  }

  if (state.at === "loading") return null;

  // Said plainly rather than shown as an empty card. Somebody who has been
  // earning for a month must not be told they have nothing.
  if (state.at === "unavailable") return <Empty body={t("rewards.unavailable")} />;

  if (state.at === "member") {
    return <MemberCard member={state.member} perDollar={state.perDollar} />;
  }

  return (
    <>
      <p className="m-0 mt-2 text-[15px] leading-[1.55] text-muted">
        {t("rewards.lead", { points: String(state.perDollar) })}
      </p>
      <ul className="m-0 mt-6 list-none border-t border-line-faint p-0">
        <Benefit
          title={t("rewards.earnTitle")}
          body={t("rewards.earnBody", { points: String(state.perDollar) })}
        />
        <Benefit title={t("rewards.keepTitle")} body={t("rewards.keepBody")} />
        <Benefit title={t("rewards.counterTitle")} body={t("rewards.counterBody")} />
      </ul>
      <Button onClick={join} disabled={joining} className="mt-7 w-full">
        {joining ? t("rewards.joining") : t("rewards.join")}
      </Button>
      {/* Free, and worth saying once: a rewards scheme that asks for a card
          number is a different thing from one that does not. */}
      <p className="m-0 mt-3 text-center text-[12px] text-quiet">{t("rewards.freeNote")}</p>
    </>
  );
}

function Empty({ body, children }: { body: string; children?: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="m-0 text-[14px] leading-[1.5] text-muted">{body}</p>
      {children}
    </div>
  );
}

function Benefit({ title, body }: { title: string; body: string }) {
  return (
    <li className="border-b border-line-faint py-4">
      <p className="m-0 text-[15px] text-ink">{title}</p>
      <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">{body}</p>
    </li>
  );
}

function MemberCard({ member, perDollar }: { member: Member; perDollar: number }) {
  const t = useT();
  return (
    <>
      <div className="mt-5 rounded-2xl border border-line bg-surface p-6 text-center">
        {/* The balance first. It is what somebody opens this screen to see;
            the code is what they open it to *use*, and using it happens at a
            counter with somebody waiting. */}
        <p className="m-0 text-[13px] uppercase tracking-[0.08em] text-faint">
          {t("rewards.balance")}
        </p>
        <Swap
          value={String(member.points)}
          className="mt-1 justify-items-center text-[40px] font-medium leading-none text-ink"
        />

        {member.svg ? (
          // A white square, in dark mode too, and not a mistake.
          //
          // The code used to be painted with currentColor so it would follow
          // the theme. Two things were wrong with that. The library draws the
          // modules with `stroke`, so a fill rule never touched them and the
          // code stayed black on a near-black card — a solid dark square where
          // a QR should be. And even done correctly it would have been wrong:
          // a reader expects dark modules on a light field, and an inverted
          // code is one many will not attempt at all.
          //
          // So the code keeps its own colours and the card gives it a white
          // plate to sit on. It is the brightest thing on the screen, which is
          // right — it is the one part of this page held up to a scanner.
          <div
            className="mx-auto mt-6 w-[190px] overflow-hidden rounded-xl bg-white [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            role="img"
            aria-label={t("rewards.codeLabel")}
            dangerouslySetInnerHTML={{ __html: member.svg }}
          />
        ) : null}

        {/* The code in words under the square. Scanners fail — bad light, a
            cracked screen, a till that will not focus — and a member number
            somebody can read out is the difference between a working scheme
            and an argument. The alphabet has no I, L, O or U in it for the
            same reason. */}
        <p className="m-0 mt-4 font-mono text-[13px] tracking-[0.08em] text-muted">
          {member.code}
        </p>
      </div>

      <p className="m-0 mt-4 text-center text-[13px] leading-[1.55] text-muted">
        {t("rewards.earnBody", { points: String(perDollar) })}
      </p>
      {/* Said out loud, because the card looks like it should already work at
          the till and it does not yet. */}
      <p className="m-0 mt-2 text-center text-[12px] leading-[1.5] text-quiet">
        {t("rewards.notYetAtCounter")}
      </p>
    </>
  );
}
