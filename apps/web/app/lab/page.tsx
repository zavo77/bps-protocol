import { redirect } from "next/navigation";

// /lab is the section root; the public entry point is the markets directory.
export default function LabIndex() {
  redirect("/lab/tokens");
}
