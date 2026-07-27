// Launch receipt decoding + hard verification against the manifest.

import {
  erc20Abi,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { airlockAbi } from '@whetstone-research/doppler-sdk/evm';
import type { LaunchManifest, LaunchReceiptResult } from '../types/index';

/**
 * Decode the Airlock Create event from the launch receipt and verify every
 * recoverable fact against the manifest. Any mismatch is a hard failure —
 * callers must stop and surface it, never continue.
 */
export async function decodeAndVerifyReceipt(
  client: PublicClient,
  manifest: LaunchManifest,
  predictedTokenAddress: Address,
  receipt: TransactionReceipt,
): Promise<LaunchReceiptResult> {
  const mismatches: string[] = [];
  if (receipt.status !== 'success') mismatches.push(`Transaction status is ${receipt.status}.`);

  const created = parseEventLogs({ abi: airlockAbi, logs: receipt.logs, eventName: 'Create' });
  const ev = created.find((l) => l.address.toLowerCase() === manifest.transactionTarget.toLowerCase());
  let tokenAddress: Address = '0x0000000000000000000000000000000000000000';
  let poolOrHook: Address = '0x0000000000000000000000000000000000000000';
  if (!ev) {
    mismatches.push('No Airlock Create event found in the receipt.');
  } else {
    const args = ev.args as { asset: Address; numeraire: Address; initializer: Address; poolOrHook: Address };
    tokenAddress = args.asset;
    poolOrHook = args.poolOrHook;
    if (args.numeraire.toLowerCase() !== manifest.anchorAddress.toLowerCase()) {
      mismatches.push(`Numeraire ${args.numeraire} != anchor ${manifest.anchorAddress}.`);
    }
    if (tokenAddress.toLowerCase() !== predictedTokenAddress.toLowerCase()) {
      mismatches.push(`Created asset ${tokenAddress} != predicted ${predictedTokenAddress}.`);
    }
    const initializerExpected = manifest.resolvedDopplerModules.dopplerHookInitializer;
    if (initializerExpected && args.initializer.toLowerCase() !== initializerExpected.toLowerCase()) {
      mismatches.push(`Initializer ${args.initializer} != expected ${initializerExpected}.`);
    }
  }

  const creator: Address = manifest.creatorAddress;
  const poolStatus = -1;
  if (tokenAddress !== '0x0000000000000000000000000000000000000000') {
    try {
      const [name, symbol, supply] = await Promise.all([
        client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'name' }),
        client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
        client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'totalSupply' }),
      ]);
      if (name !== manifest.tokenName) mismatches.push(`Token name "${name}" != "${manifest.tokenName}".`);
      if (symbol !== manifest.tokenSymbol) mismatches.push(`Token symbol "${symbol}" != "${manifest.tokenSymbol}".`);
      if (supply.toString() !== manifest.initialSupply) {
        mismatches.push(`totalSupply ${supply} != ${manifest.initialSupply}.`);
      }
    } catch {
      mismatches.push('Post-launch ERC-20 verification reads failed.');
    }
    try {
      const assetData = (await client.readContract({
        address: manifest.transactionTarget,
        abi: airlockAbi,
        functionName: 'getAssetData',
        args: [tokenAddress],
      })) as unknown as readonly Address[];
      const migrator = manifest.resolvedDopplerModules.noOpMigrator?.toLowerCase();
      if (migrator && !assetData.some((a) => typeof a === 'string' && a.toLowerCase() === migrator)) {
        mismatches.push('Airlock asset data does not reference the NoOpMigrator.');
      }
    } catch {
      mismatches.push('Airlock getAssetData verification read failed.');
    }
  }

  const receiptHash: Hex = receipt.transactionHash;
  return {
    launchTransactionHash: receiptHash,
    confirmationBlock: receipt.blockNumber.toString(),
    tokenAddress,
    poolId: (poolOrHook as unknown as Hex) ?? '0x',
    creator,
    anchorAddress: manifest.anchorAddress,
    poolStatus,
    matchesManifest: mismatches.length === 0,
    mismatches,
  };
}
