"use client";
// Next 16: `params` is a Promise — unwrap with React.use() in this client page.
import { use } from "react";
import { TokenMarketView } from "./TokenMarketView";

export default function LabTokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  return <TokenMarketView address={address} />;
}
