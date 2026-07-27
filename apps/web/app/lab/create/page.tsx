import { redirect } from "next/navigation";

// Legacy path — the creation flow now lives at /lab/launch.
export default function LabCreateRedirect() {
  redirect("/lab/launch");
}
