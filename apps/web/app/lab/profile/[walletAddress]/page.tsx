"use client";
// Next 16: `params` is a Promise — unwrap with React.use() in this client page.
import { use } from "react";
import { ProfileView } from "./ProfileView";

export default function LabProfilePage({ params }: { params: Promise<{ walletAddress: string }> }) {
  const { walletAddress } = use(params);
  return <ProfileView walletAddress={walletAddress} />;
}
