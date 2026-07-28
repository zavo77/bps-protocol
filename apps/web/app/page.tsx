import { redirect } from "next/navigation";

// The public site IS the Launch Lab. The legacy restricted-beta protocol
// dashboard remains available at /protocol with its own shell.
export default function HomePage() {
  redirect("/lab/tokens");
}
