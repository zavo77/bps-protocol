// Genesis proof record: registry facts + live anchor verification.
// Pre-launch it returns the pending state; nothing is ever fabricated.

import { GENESIS_MARKET, resolveAnchor, type ProofRecord } from '@bps/launch-lab';
import { getLabClient } from '../../../../lib/lab/server';
import { mapError, ok } from '../../../../lib/lab/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    let anchor = null;
    try {
      anchor = await resolveAnchor(getLabClient());
    } catch {
      anchor = null;
    }
    const record: ProofRecord = {
      deploymentUrl: new URL(req.url).host,
      sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local-dev',
      manifest: null,
      manifestHash: GENESIS_MARKET.manifestHash,
      anchor,
      simulation: null,
      receipt: null,
      buyTransactionHash: GENESIS_MARKET.buyTransactionHash,
      sellTransactionHash: GENESIS_MARKET.sellTransactionHash,
      anchorReserveWei: null,
      notes: GENESIS_MARKET.launched
        ? []
        : ['Genesis launch pending — checklist state; no launch has occurred yet.'],
    };
    return ok(record);
  } catch (e) {
    return mapError(e);
  }
}
