import { redirect } from "next/navigation";
import { currentStaff } from "../session";
import LoginForm from "./LoginForm";

// Signed in already? Then this page has nothing to offer. Somebody who
// bookmarked the login rather than the tool should land on the tool.
export default async function StaffLoginPage() {
  if (await currentStaff()) redirect("/staff");
  return (
    <main>
      <h1 className="m-0 text-[24px] font-semibold text-heading">Team tools</h1>
      <p className="mb-7 mt-1 text-[14px] text-muted">Corner Bagel</p>
      <LoginForm />
    </main>
  );
}
