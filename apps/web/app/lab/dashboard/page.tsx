import { redirect } from "next/navigation";

// Compatibility redirect — the creator dashboard is the profile page.
export default function LabDashboardRedirect() {
  redirect("/lab/profile");
}
