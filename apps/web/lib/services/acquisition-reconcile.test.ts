import { describe, expect, it } from "vitest";
import {
  createPublicClient,
  custom,
  encodeFunctionResult,
  toFunctionSelector,
  type Address,
} from "viem";
import { robinhoodChain } from "../chain";
import { distributionFundingCoordinatorAbi } from "../abis";
import { reconcileCycleAcquisition } from "./acquisition-reconcile";

const COORD = "0x0000000000000000000000000000000000000c00" as Address;
const STOCK = "0x00000000000000000000000000000000000aaaa1" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const CYCLE = 42n;

const SEL = {
  cycleUsed: toFunctionSelector("cycleUsed(uint256)"),
  cycleAcquisitionId: toFunctionSelector("cycleAcquisitionId(uint256)"),
  acquisitions: toFunctionSelector("acquisitions(uint256)"),
};

interface AcqRecord {
  status: number;
  stockToken: Address;
  wethSpent: bigint;
  acquiredStock: bigint;
  distributionAmount: bigint;
  reserveAmount: bigint;
  cycleId: bigint;
}

const FUNDED_RECORD: AcqRecord = {
  status: 2, // FUNDED
  stockToken: STOCK,
  wethSpent: 20n * 10n ** 18n,
  acquiredStock: 2000n * 10n ** 18n,
  distributionAmount: 1600n * 10n ** 18n,
  reserveAmount: 400n * 10n ** 18n,
  cycleId: CYCLE,
};

const EMPTY_RECORD: AcqRecord = {
  status: 0,
  stockToken: ZERO,
  wethSpent: 0n,
  acquiredStock: 0n,
  distributionAmount: 0n,
  reserveAmount: 0n,
  cycleId: 0n,
};

const EXPECTATION = {
  acquisitionId: 1n,
  wethSpent: FUNDED_RECORD.wethSpent,
  distributionAmount: FUNDED_RECORD.distributionAmount,
  reserveAmount: FUNDED_RECORD.reserveAmount,
  acquiredStock: FUNDED_RECORD.acquiredStock,
};

interface Opts {
  used?: boolean;
  acqId?: bigint;
  record?: AcqRecord;
  throwOn?: keyof typeof SEL;
  malformedOn?: keyof typeof SEL;
}

function client(opts: Opts) {
  const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_chainId") return `0x${robinhoodChain.id.toString(16)}`;
    if (method === "eth_call") {
      const data = String((params as [{ data: string }])[0].data);
      const s = data.slice(0, 10).toLowerCase();
      const which = (Object.keys(SEL) as (keyof typeof SEL)[]).find(
        (k) => SEL[k].toLowerCase() === s,
      );
      if (which && opts.throwOn === which) throw new Error(`execution reverted: ${which}`);
      if (which && opts.malformedOn === which) return "0xdead"; // undecodable
      if (s === SEL.cycleUsed.toLowerCase()) {
        return encodeFunctionResult({
          abi: distributionFundingCoordinatorAbi,
          functionName: "cycleUsed",
          result: opts.used ?? true,
        });
      }
      if (s === SEL.cycleAcquisitionId.toLowerCase()) {
        return encodeFunctionResult({
          abi: distributionFundingCoordinatorAbi,
          functionName: "cycleAcquisitionId",
          result: opts.acqId ?? 1n,
        });
      }
      if (s === SEL.acquisitions.toLowerCase()) {
        const r = opts.record ?? FUNDED_RECORD;
        return encodeFunctionResult({
          abi: distributionFundingCoordinatorAbi,
          functionName: "acquisitions",
          result: [
            r.status,
            r.stockToken,
            r.wethSpent,
            r.acquiredStock,
            r.distributionAmount,
            r.reserveAmount,
            r.cycleId,
          ],
        });
      }
    }
    throw new Error(`unexpected ${method}`);
  };
  return createPublicClient({ chain: robinhoodChain, transport: custom({ request }) });
}

describe("authoritative acquisition↔cycle reconciliation (§B)", () => {
  it("successful authoritative reconciliation (used cycle, matching id + funding)", async () => {
    const r = await reconcileCycleAcquisition(client({}), COORD, CYCLE, EXPECTATION);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("authoritative-confirmed");
    expect(r.onchainAcquisitionId).toBe(1n);
    expect(r.record?.cycleId).toBe(CYCLE);
    expect(r.record?.distributionAmount).toBe(1600n * 10n ** 18n);
  });

  it("unused cycle with no event expectation is a clean, valid state", async () => {
    const r = await reconcileCycleAcquisition(client({ used: false }), COORD, CYCLE);
    expect(r).toMatchObject({ status: "cycle-unused", ok: true, onchainAcquisitionId: null });
  });

  it("unused cycle but events reference an acquisition → inconsistent (fails closed)", async () => {
    const r = await reconcileCycleAcquisition(client({ used: false }), COORD, CYCLE, EXPECTATION);
    expect(r).toMatchObject({ status: "cycle-acquisition-mismatch", ok: false });
  });

  it("used cycle with the correct bound acquisition id confirms", async () => {
    const r = await reconcileCycleAcquisition(
      client({ used: true, acqId: 1n }),
      COORD,
      CYCLE,
      EXPECTATION,
    );
    expect(r.ok).toBe(true);
    expect(r.onchainAcquisitionId).toBe(1n);
  });

  it("cycle/acquisition id mismatch (chain id != event id) fails closed", async () => {
    const r = await reconcileCycleAcquisition(client({ acqId: 7n }), COORD, CYCLE, EXPECTATION);
    expect(r).toMatchObject({
      status: "cycle-acquisition-mismatch",
      ok: false,
      onchainAcquisitionId: 7n,
    });
  });

  it("missing acquisition (id bound but record empty/unfunded) fails closed", async () => {
    const r = await reconcileCycleAcquisition(
      client({ acqId: 1n, record: EMPTY_RECORD }),
      COORD,
      CYCLE,
      EXPECTATION,
    );
    expect(r).toMatchObject({ status: "acquisition-missing", ok: false });
  });

  it("acquisition/event cycle mismatch (record.cycleId != queried cycle) fails closed", async () => {
    const r = await reconcileCycleAcquisition(
      client({ record: { ...FUNDED_RECORD, cycleId: 99n } }),
      COORD,
      CYCLE,
      EXPECTATION,
    );
    expect(r).toMatchObject({ status: "acquisition-cycle-mismatch", ok: false });
  });

  it("funding-record mismatch (authoritative amounts disagree with events) fails closed", async () => {
    const r = await reconcileCycleAcquisition(
      client({ record: { ...FUNDED_RECORD, distributionAmount: 1n } }),
      COORD,
      CYCLE,
      EXPECTATION,
    );
    expect(r).toMatchObject({ status: "funding-record-mismatch", ok: false });
  });

  it("malformed read fails closed (read-failed)", async () => {
    const r = await reconcileCycleAcquisition(
      client({ malformedOn: "acquisitions" }),
      COORD,
      CYCLE,
      EXPECTATION,
    );
    expect(r).toMatchObject({ status: "read-failed", ok: false });
  });

  it("RPC failure fails closed (read-failed) at each read step", async () => {
    for (const step of ["cycleUsed", "cycleAcquisitionId", "acquisitions"] as const) {
      const r = await reconcileCycleAcquisition(
        client({ throwOn: step }),
        COORD,
        CYCLE,
        EXPECTATION,
      );
      expect(r).toMatchObject({ status: "read-failed", ok: false });
    }
  });
});
