import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "./session";
import { locationOf } from "./staff";
import { SUPPLIERS } from "./supplies";
import OrderBuilder from "./OrderBuilder";
import SignOut from "./SignOut";

// The ordering screen. Everything behind the staff login starts here.
//
// The gate is this server component and not a proxy rule, because the session
// has to be verified — a rewrite can check that a cookie exists, and a cookie
// existing is not a cookie that verifies. currentStaff() checks the signature,
// which is what makes the answer mean anything.
export default async function StaffPage() {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/login");
  const location = locationOf(staff);

  return (
    <main>
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[24px] font-semibold text-heading">Ingredient order</h1>
          <p className="m-0 mt-1 text-[14px] text-muted">
            {location.name} · {location.address}, {location.city}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-[13px] text-quiet">{staff.name}</span>
          {staff.role === "admin" ? (
            <>
              <Link href="/staff/team" className="text-[13px] text-link underline">
                Team
              </Link>
              <Link href="/staff/email" className="text-[13px] text-link underline">
                Email
              </Link>
            </>
          ) : null}
          <SignOut />
        </div>
      </header>

      <OrderBuilder
        suppliers={SUPPLIERS}
        defaultDay={shopDay(1)}
        earliestDay={shopDay(0)}
      />
    </main>
  );
}

/** A day, `offset` days from now, in the shop's timezone.
 *
 *  Worked out here rather than in the browser for two reasons: reading the
 *  clock during render is what the purity lint rule exists to stop, and a
 *  tablet whose clock is set to another timezone would otherwise disagree with
 *  the server about what "tomorrow" means and get its order refused as being
 *  in the past. The shop's day is the only one that matters. */
function shopDay(offset: number): string {
  const now = new Date();
  // en-CA formats as YYYY-MM-DD, which is what a date input wants.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const shifted = new Date(`${today}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offset);
  return shifted.toISOString().slice(0, 10);
}
