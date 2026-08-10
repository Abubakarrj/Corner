import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "../session";
import { locationOf } from "../staff";
import InviteForm from "./InviteForm";

export default async function TeamPage() {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/login");
  // Members can order; only admins can add people. Checked here as well as in
  // the API route, because a page that renders a form the server will refuse
  // is a page that wastes somebody's time.
  if (staff.role !== "admin") redirect("/staff");
  const location = locationOf(staff);

  return (
    <main>
      <Link href="/staff" className="text-[13px] text-link underline">
        ← Ingredient order
      </Link>
      <h1 className="m-0 mt-4 text-[24px] font-semibold text-heading">Invite a team member</h1>
      <p className="mb-7 mt-1 text-[14px] text-muted">
        They will be added to {location.name} and can place ingredient orders for it.
      </p>
      <InviteForm />
    </main>
  );
}
