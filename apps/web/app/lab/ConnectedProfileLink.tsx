"use client";
// Renders a link to the connected wallet's creator profile, only when a wallet
// is connected. Nothing is shown while disconnected (no address to link to).
import { useAccount } from "wagmi";

export function ConnectedProfileLink() {
  const { address } = useAccount();
  if (!address) return null;
  return (
    <a href={`/lab/profile/${address}`} data-testid="nav-profile-link">
      Profile
    </a>
  );
}
