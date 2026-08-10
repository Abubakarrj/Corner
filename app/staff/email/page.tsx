import Link from "next/link";
import { redirect } from "next/navigation";
import { isEmailConfigured, sender, type MailStream } from "../../email";
import { currentStaff } from "../session";
import EmailCheck from "./EmailCheck";

// "I didn't get an email" — the page that answers it.
//
// The readout is rendered here rather than fetched, because every value on it
// is something this server already knows synchronously. Fetching it would mean
// a loading state and a setState in an effect for information that was
// available before the page was sent.
const STREAMS: MailStream[] = ["orders", "forms", "team"];

export default async function EmailCheckPage() {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/login");
  if (staff.role !== "admin") redirect("/staff");

  const config = {
    resendKey: isEmailConfigured(),
    from: STREAMS.map((stream) => [stream, sender(stream)] as const),
    // Where each kind of mail is addressed. A send can succeed completely and
    // still arrive nowhere if this is a mailbox that was never created, which
    // is the one failure Resend cannot tell us about.
    careersInbox: process.env.CAREERS_INBOX ?? "abu@thecornerbagel.com (the default)",
    orderingInbox: process.env.ORDERING_INBOX ?? "not set — no copy of orders is kept",
  };

  return (
    <main>
      <Link href="/staff" className="text-[13px] text-link underline">
        ← Ingredient order
      </Link>
      <h1 className="m-0 mt-4 text-[24px] font-semibold text-heading">Email</h1>
      <p className="mb-7 mt-1 text-[14px] text-muted">
        What this server can see, and a way to send a real message and read back exactly what
        Resend says about it.
      </p>
      <EmailCheck config={config} signedInAs={staff.email} />
    </main>
  );
}
