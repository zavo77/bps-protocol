"use client";
// Client-side fetch helper for /api/lab endpoints. Every route returns the
// ApiResult<T> envelope; failures are surfaced as LabApiError with the server
// error code so callers can react to specific codes (e.g. AUTH_NOT_ALLOWLISTED).
import type { ApiResult } from "@bps/launch-lab";

export class LabApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LabApiError";
  }
}

export async function labFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  let body: ApiResult<T> | null = null;
  try {
    body = (await res.json()) as ApiResult<T>;
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new LabApiError("BAD_RESPONSE", `Request failed (HTTP ${res.status}).`, res.status);
  }
  if (!body.ok) throw new LabApiError(body.code, body.error, res.status);
  return body.data;
}

/** The server allowlist is private; this is the only client-visible signal. */
export function isNotAllowlisted(e: unknown): boolean {
  return e instanceof LabApiError && e.code === "AUTH_NOT_ALLOWLISTED";
}

/** Server said creation is switched off (access mode 'disabled'). */
export function isCreationDisabled(e: unknown): boolean {
  return e instanceof LabApiError && e.code === "AUTH_CREATION_DISABLED";
}

/**
 * User-facing messages for the public-beta access/limit error codes. Codes not
 * listed here fall back to the server-provided error message.
 */
const FRIENDLY_CODE_MESSAGES: Record<string, string> = {
  AUTH_CREATION_DISABLED: "Market creation is currently disabled.",
  AUTH_REPLAY: "That signed request was already used. Sign a fresh request and try again.",
  LIMIT_WALLET_MAX: "This wallet has reached its public-beta launch limit.",
  LIMIT_COOLDOWN: "This wallet is in its launch cooldown window. Please wait and try again.",
  LIMIT_DAILY_CAP: "Today's public-beta launch cap has been reached. Try again tomorrow.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof LabApiError) {
    return `${FRIENDLY_CODE_MESSAGES[e.code] ?? e.message} (${e.code})`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
