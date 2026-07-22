import { describe, expect, it } from "vitest";
import { concatHex, keccak256, type Address, type Hex } from "viem";
import { acquiredStockSplit, buyAllocation } from "./economics";
import { computeLeaf, verifyClaim, type Entitlement, type OnchainCycle } from "./claim";

// Complete LOCAL end-to-end at the application-logic layer, mirroring RialtoEndToEnd.t.sol:
// official buy -> 2% stock budget -> Rialto acquisition fixture -> exact 80/20 -> cycle publication ->
// valid claim -> invalid-proof rejection -> duplicate-claim rejection. Pure/local; nothing broadcasts.
const MANAGER = "0x000000000000000000000000000000000000c1a1" as Address;
const AAPL = "0x000000000000000000000000000000000000aab1" as Address;
const LOCKER = "0x000000000000000000000000000000000000107c" as Address;
const OTHER = "0x000000000000000000000000000000000000beef" as Address;
const STOCK_RATE = 100n; // 1 WETH -> 100 stock (acquisition fixture)

function pair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a]));
}

describe("local end-to-end (§E)", () => {
  it("buy -> budget -> acquisition -> 80/20 -> cycle -> claim, with invalid/duplicate rejection", () => {
    // 1. Official buy of 1000 WETH -> 2% stock budget.
    const buy = buyAllocation(1000n * 10n ** 18n);
    expect(buy.stockBudget).toBe(20n * 10n ** 18n);

    // 2. Rialto acquisition fixture: spend the whole budget, receive rate*budget stock.
    const wethSpent = buy.stockBudget;
    const acquiredStock = wethSpent * STOCK_RATE; // 2000e18
    expect(acquiredStock).toBe(2000n * 10n ** 18n);

    // 3. Exact 80/20 split.
    const split = acquiredStockSplit(acquiredStock);
    expect(split.distribution).toBe(1600n * 10n ** 18n);
    expect(split.reserve).toBe(400n * 10n ** 18n);

    // 4. Cycle publication: a 2-leaf tree funding the locker with the exact recorded 80%.
    const distribution = split.distribution;
    const leafLocker = computeLeaf({
      chainId: 4663,
      claimManager: MANAGER,
      cycleId: 42n,
      claimant: LOCKER,
      asset: AAPL,
      amount: distribution,
    });
    const leafOther = computeLeaf({
      chainId: 4663,
      claimManager: MANAGER,
      cycleId: 42n,
      claimant: OTHER,
      asset: AAPL,
      amount: 1n,
    });
    const root = pair(leafLocker, leafOther);
    const cycle: OnchainCycle = {
      cycleId: 42n,
      root,
      asset: AAPL,
      remaining: distribution,
      claimStartSec: 100n,
      claimDeadlineSec: 1000n,
    };
    const entitlement: Entitlement = {
      cycleId: 42n,
      claimManager: MANAGER,
      asset: AAPL,
      assetSymbol: "AAPL",
      claimant: LOCKER,
      amount: distribution,
      proof: [leafOther],
      root,
    };

    // 5. Valid claim.
    expect(
      verifyClaim(entitlement, cycle, { chainId: 4663, nowSec: 500n, alreadyClaimed: false }).ok,
    ).toBe(true);

    // 6. Invalid proof rejection.
    expect(
      verifyClaim({ ...entitlement, proof: [leafLocker] }, cycle, {
        chainId: 4663,
        nowSec: 500n,
        alreadyClaimed: false,
      }),
    ).toEqual({ ok: false, reason: "proof-invalid" });

    // 7. Duplicate claim rejection (UI-side; the contract also enforces single-claim).
    expect(
      verifyClaim(entitlement, cycle, { chainId: 4663, nowSec: 500n, alreadyClaimed: true }),
    ).toEqual({ ok: false, reason: "already-claimed" });

    // Reconcile: distribution + reserve == acquired stock.
    expect(split.distribution + split.reserve).toBe(acquiredStock);
  });
});
