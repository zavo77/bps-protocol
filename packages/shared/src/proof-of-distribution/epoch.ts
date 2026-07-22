// Exact 15-minute UTC epoch derivation. All integer arithmetic.
//   epochId    = floor(unixTimestamp / 900)
//   epochStart = epochId * 900
//   epochEnd   = epochStart + 900   (epoch interval is half-open: [epochStart, epochEnd))

import { EPOCH_SECONDS } from "./constants.js";

export interface EpochBounds {
  readonly epochId: bigint;
  readonly epochStart: bigint;
  readonly epochEnd: bigint;
}

export function epochIdOf(unixTimestamp: bigint): bigint {
  return unixTimestamp / EPOCH_SECONDS;
}

export function epochStartOf(epochId: bigint): bigint {
  return epochId * EPOCH_SECONDS;
}

export function epochEndOf(epochId: bigint): bigint {
  return epochStartOf(epochId) + EPOCH_SECONDS;
}

export function epochBoundsOf(unixTimestamp: bigint): EpochBounds {
  const epochId = epochIdOf(unixTimestamp);
  return { epochId, epochStart: epochStartOf(epochId), epochEnd: epochEndOf(epochId) };
}
