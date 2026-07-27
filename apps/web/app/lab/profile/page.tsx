"use client";
import { useAccount } from "wagmi";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /lab/profile → the connected wallet's profile, or an honest connect prompt.
export default function LabProfileIndex() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  useEffect(() => {
    if (isConnected && address) router.replace(`/lab/profile/${address}`);
  }, [isConnected, address, router]);
  if (isConnected && address) return null;
  return (
    <main>
      <h1 className="lab-h2">creator profile</h1>
      <p className="lab-lead">Connect a wallet to view your creator profile, markets and fees.</p>
    </main>
  );
}
