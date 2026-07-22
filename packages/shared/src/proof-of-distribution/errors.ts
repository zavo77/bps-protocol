/** Error thrown when a fixture or intermediate result violates a Proof-of-Distribution invariant. */
export class ProofOfDistributionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ProofOfDistributionError";
    this.code = code;
  }
}

export function fail(code: string, message: string): never {
  throw new ProofOfDistributionError(code, message);
}
