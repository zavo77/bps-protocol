// Composed-trade recovery state (client, localStorage). When a two-step route's
// first leg confirms but the second is interrupted/failed/expired or the page
// reloads, this lets the UI detect the partial trade and resume the second leg
// FROM THE ACTUAL received amount — never the stale estimate, never auto-submit.
//
// SECURITY: only non-secret PUBLIC trade state is persisted. Wallet signatures
// and executable calldata are NEVER stored — a hard allow-list of fields is
// enforced on save AND load, so a tampered/legacy record can't smuggle calldata
// back into the flow.

export interface PendingComposedTrade {
  /** schema version for forward-compatible invalidation */
  v: 1;
  side: "buy" | "sell";
  marketToken: string;
  marketSymbol: string | null;
  anchorSymbol: string;
  anchorAddress: string;
  /** the user-chosen payment/output token */
  paymentSymbol: string;
  paymentAddress: string;
  /** hash of the successful first leg */
  completedLegTxHash: string;
  /** ACTUAL intermediate anchor amount received from leg 1 (wei, decimal string) */
  actualReceivedAnchorWei: string;
  /** which leg still needs signing (2 for a two-step route) */
  pendingLegNumber: number;
  /** unix ms; after this the second leg MUST be re-quoted before use */
  quoteExpiry: number;
  createdAt: number;
}

const ALLOWED_KEYS: (keyof PendingComposedTrade)[] = [
  "v",
  "side",
  "marketToken",
  "marketSymbol",
  "anchorSymbol",
  "anchorAddress",
  "paymentSymbol",
  "paymentAddress",
  "completedLegTxHash",
  "actualReceivedAnchorWei",
  "pendingLegNumber",
  "quoteExpiry",
  "createdAt",
];

/** Any field that could carry executable/secret material — rejected outright. */
const FORBIDDEN_SUBSTRINGS = [
  "signature",
  "calldata",
  "data",
  "envelope",
  "sig",
  "privatekey",
  "secret",
];

function storageKey(marketToken: string, wallet: string): string {
  return `bps.lab.pendingTrade.${wallet.toLowerCase()}.${marketToken.toLowerCase()}`;
}

/** Strip to the allow-list; drop anything whose key looks executable/secret. */
export function sanitizePending(input: Record<string, unknown>): PendingComposedTrade | null {
  for (const k of Object.keys(input)) {
    const lk = k.toLowerCase();
    if (FORBIDDEN_SUBSTRINGS.some((f) => lk.includes(f))) return null;
  }
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) {
    if (!(k in input)) return null;
    out[k] = input[k];
  }
  const rec = out as unknown as PendingComposedTrade;
  if (rec.v !== 1) return null;
  if (rec.side !== "buy" && rec.side !== "sell") return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(rec.marketToken)) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(rec.anchorAddress)) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(rec.paymentAddress)) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(rec.completedLegTxHash)) return null;
  if (!/^[0-9]{1,36}$/.test(rec.actualReceivedAnchorWei)) return null;
  if (!Number.isInteger(rec.pendingLegNumber) || rec.pendingLegNumber < 2) return null;
  if (!Number.isFinite(rec.quoteExpiry) || !Number.isFinite(rec.createdAt)) return null;
  return rec;
}

export function savePendingTrade(wallet: string, trade: PendingComposedTrade): void {
  if (typeof window === "undefined") return;
  const clean = sanitizePending(trade as unknown as Record<string, unknown>);
  if (!clean) return;
  try {
    window.localStorage.setItem(storageKey(clean.marketToken, wallet), JSON.stringify(clean));
  } catch {
    // storage unavailable (private mode / quota) — recovery simply won't persist
  }
}

export function loadPendingTrade(wallet: string, marketToken: string): PendingComposedTrade | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(marketToken, wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return sanitizePending(parsed);
  } catch {
    return null;
  }
}

export function clearPendingTrade(wallet: string, marketToken: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(marketToken, wallet));
  } catch {
    /* ignore */
  }
}

/** The persisted quote is only a hint; expiry forces a fresh second-leg quote. */
export function isQuoteExpired(trade: PendingComposedTrade, now = Date.now()): boolean {
  return now >= trade.quoteExpiry;
}

/** Human resume prompt honoring the required copy. */
export function resumePrompt(trade: PendingComposedTrade): {
  heading: string;
  detail: string;
  action: string;
} {
  if (trade.side === "buy") {
    return {
      heading: "Trade partially completed",
      detail: `Your ${trade.paymentSymbol} was converted to ${trade.anchorSymbol}. The ${trade.anchorSymbol} remains in your wallet until you continue.`,
      action: `Continue buying ${trade.marketSymbol ?? "the token"}`,
    };
  }
  return {
    heading: "Sale partially completed",
    detail: `${trade.marketSymbol ?? "The token"} was sold. Your ${trade.anchorSymbol} remains in your wallet.`,
    action: `Continue converting ${trade.anchorSymbol} to ${trade.paymentSymbol}`,
  };
}
