// Key-free demonstration fixture constants (Task 9A §A). This module holds ONLY the public demo addresses,
// ids, amounts and the derived demo Merkle root that the DEMONSTRATION app needs. It contains NO private
// key, NO deterministic signer, and imports nothing from `lib/testing/*`, so it is safe to include in the
// production client bundle. The deterministic signing key lives ONLY in the isolated test/E2E
// `lib/testing/local-account.ts`, whose derived address equals `DEMO_ACCOUNT_ADDRESS` (asserted by a test).
import { concatHex, keccak256, type Address, type Hex } from "viem";
import { computeLeaf } from "./claim";
import { ROBINHOOD_CHAIN_ID } from "./chain";
import { LOCAL_DEMO_MANIFEST } from "./fixtures";

// Public address of the deterministic demo/E2E signer. Hardcoded here (NOT derived from the private key)
// so referencing the demo account never pulls key material into production. Must equal
// `lib/testing/local-account.ts`'s `localTestAccount.address` (asserted by a test).
export const DEMO_ACCOUNT_ADDRESS = "0xD9d99859BB8C504daf3A3235a5C73DE4047a0f8B" as Address;

export const DEMO_WETH = LOCAL_DEMO_MANIFEST.external.weth.address as Address;
export const DEMO_BPS = LOCAL_DEMO_MANIFEST.actual.bpsToken as Address;
export const DEMO_STOCK = "0x00000000000000000000000000000000000aaaa1" as Address; // fixture stock (AAPL)
export const DEMO_CYCLE_ID = 42n;
export const DEMO_DISTRIBUTION = 1600n * 10n ** 18n;
export const DEMO_PRELOCKED = 500n * 10n ** 18n; // a pre-existing lock position (id 0)

export const DEMO_ROUTER = LOCAL_DEMO_MANIFEST.actual.tradeRouter as Address;
export const DEMO_COORDINATOR = LOCAL_DEMO_MANIFEST.actual.coordinator as Address;
export const DEMO_MANAGER = LOCAL_DEMO_MANIFEST.actual.claimManager as Address;
export const DEMO_SIBLING = "0x000000000000000000000000000000000000b0b0" as Address;
export const DEMO_SIBLING_AMOUNT = 1n;

// The demo distribution Merkle root — computed identically to the local proof provider so the on-chain
// (cycles()) root and the artifact root agree. Key-free (uses the public demo/sibling addresses).
function pair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]));
}
export const DEMO_ROOT: Hex = pair(
  computeLeaf({
    chainId: ROBINHOOD_CHAIN_ID,
    claimManager: DEMO_MANAGER,
    cycleId: DEMO_CYCLE_ID,
    claimant: DEMO_ACCOUNT_ADDRESS,
    asset: DEMO_STOCK,
    amount: DEMO_DISTRIBUTION,
  }),
  computeLeaf({
    chainId: ROBINHOOD_CHAIN_ID,
    claimManager: DEMO_MANAGER,
    cycleId: DEMO_CYCLE_ID,
    claimant: DEMO_SIBLING,
    asset: DEMO_STOCK,
    amount: DEMO_SIBLING_AMOUNT,
  }),
);
