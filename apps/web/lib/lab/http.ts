// Shared helpers for /api/lab route handlers.

import "server-only";
import { NextResponse } from "next/server";
import type { ApiResult } from "@bps/launch-lab";

export function ok<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data } satisfies ApiResult<T>);
}

export function err(code: string, error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error, code } satisfies ApiResult<never>, { status });
}

/** Host used for signature binding; honors the proxy header Vercel sets. */
export function requestHost(req: Request): string {
  const url = new URL(req.url);
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
}

/** Same-origin check for mutation routes (browser clients set Origin). */
export function assertSameOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return "Missing Origin header.";
  try {
    const host = requestHost(req);
    if (new URL(origin).host !== host) return `Origin ${origin} does not match host ${host}.`;
    return null;
  } catch {
    return "Malformed Origin header.";
  }
}

const buckets = new Map<string, number[]>();

/** Conservative fixed-window limiter (per serverless instance). */
export function rateLimited(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return true;
  }
  arr.push(now);
  buckets.set(key, arr);
  return false;
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Uniform error mapping that never leaks internals or secret values. */
export function mapError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith("AUTH_")) return err(msg, "Request authentication failed.", 401);
  if (msg === "LAB_DISABLED") return err(msg, "The Launch Lab is not enabled.", 503);
  if (msg.startsWith("Missing required environment"))
    return err("ENV_MISSING", "Server configuration incomplete.", 503);
  if (msg.startsWith("ANCHOR_MISMATCH")) return err("ANCHOR_MISMATCH", msg, 409);
  if (msg === "FEE_PRESET_DISABLED")
    return err(msg, "That fee preset is not available on this chain.", 400);
  if (msg === "BPS_BENEFICIARY_UNCONFIGURED")
    return err(msg, "Server configuration incomplete.", 503);
  return err("INTERNAL", "Unexpected server error.", 500);
}
