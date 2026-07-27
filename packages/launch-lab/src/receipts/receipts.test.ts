import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { airlockAbi } from '@whetstone-research/doppler-sdk/evm';
import { decodeAndVerifyReceipt } from './index';
import type { LaunchManifest } from '../types/index';

const AIRLOCK = getAddress('0xeb7C034704eF8Dcd2D32324c1545f62fB4aD0862');
const GOOGL = getAddress('0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3');
const TOKEN = getAddress('0xC3Dab5aF881C69F8CfB0Fa3270b8529fC404817A');
const INIT = getAddress('0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544');
const POOL = getAddress('0x1111111111111111111111111111111111111111');
const MIGRATOR = getAddress('0xba2F330EDb16cD8056f5988d8CE19BbC63475A0e');

const manifest = {
  transactionTarget: AIRLOCK,
  anchorAddress: GOOGL,
  creatorAddress: getAddress('0x29244A2309B703F82E292A3db7df0e95d0cdca72'),
  tokenName: 'PRINT',
  tokenSymbol: 'PRINT',
  initialSupply: (10n ** 27n).toString(),
  resolvedDopplerModules: { dopplerHookInitializer: INIT, noOpMigrator: MIGRATOR },
} as unknown as LaunchManifest;

function createLog(numeraire = GOOGL, asset = TOKEN, initializer = INIT) {
  const topics = encodeEventTopics({ abi: airlockAbi, eventName: 'Create', args: { numeraire } });
  const data = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
    [asset, initializer, POOL],
  );
  return { address: AIRLOCK, topics, data, blockNumber: 1n, logIndex: 0, transactionHash: '0xabc', removed: false } as never;
}

function receiptWith(logs: unknown[], status: 'success' | 'reverted' = 'success'): TransactionReceipt {
  return {
    status,
    logs,
    blockNumber: 20_200_000n,
    transactionHash: `0x${'ab'.repeat(32)}`,
  } as unknown as TransactionReceipt;
}

function clientWith(overrides?: { name?: string; supply?: bigint; assetData?: string[] }): PublicClient {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'name') return overrides?.name ?? 'PRINT';
      if (functionName === 'symbol') return 'PRINT';
      if (functionName === 'totalSupply') return overrides?.supply ?? 10n ** 27n;
      if (functionName === 'getAssetData') return overrides?.assetData ?? [GOOGL, INIT, MIGRATOR];
      throw new Error(`unexpected ${functionName}`);
    }),
  } as unknown as PublicClient;
}

describe('decodeAndVerifyReceipt', () => {
  it('accepts a matching receipt', async () => {
    const r = await decodeAndVerifyReceipt(clientWith(), manifest, TOKEN, receiptWith([createLog()]));
    expect(r.mismatches).toEqual([]);
    expect(r.matchesManifest).toBe(true);
    expect(r.tokenAddress).toBe(TOKEN);
  });

  it('hard-fails on predicted-token mismatch', async () => {
    const other = getAddress('0x2222222222222222222222222222222222222222');
    const r = await decodeAndVerifyReceipt(clientWith(), manifest, other, receiptWith([createLog()]));
    expect(r.matchesManifest).toBe(false);
    expect(r.mismatches.join(' ')).toMatch(/predicted/);
  });

  it('hard-fails on wrong numeraire', async () => {
    const wrongNumeraire = getAddress('0x3333333333333333333333333333333333333333');
    const r = await decodeAndVerifyReceipt(clientWith(), manifest, TOKEN, receiptWith([createLog(wrongNumeraire)]));
    expect(r.matchesManifest).toBe(false);
    expect(r.mismatches.join(' ')).toMatch(/anchor/i);
  });

  it('hard-fails on reverted status and missing event', async () => {
    const r = await decodeAndVerifyReceipt(clientWith(), manifest, TOKEN, receiptWith([], 'reverted'));
    expect(r.matchesManifest).toBe(false);
    expect(r.mismatches.length).toBeGreaterThanOrEqual(2);
  });

  it('hard-fails on wrong on-chain name or supply', async () => {
    const r = await decodeAndVerifyReceipt(clientWith({ name: 'NOTPRINT' }), manifest, TOKEN, receiptWith([createLog()]));
    expect(r.matchesManifest).toBe(false);
    const r2 = await decodeAndVerifyReceipt(clientWith({ supply: 1n }), manifest, TOKEN, receiptWith([createLog()]));
    expect(r2.matchesManifest).toBe(false);
  });
});
