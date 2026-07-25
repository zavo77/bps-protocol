// Server-only entry point for @bps/rialto.
//
// SECURITY / SCOPE: everything re-exported here is SERVER-ONLY. The Rialto quote client reads
// RIALTO_API_KEY from a server-side environment variable and MUST NEVER be imported into browser or
// client code. It is intentionally absent from the package's main barrel (./index.ts) and reachable
// only through the "@bps/rialto/server" subpath so a client bundle that imports "@bps/rialto" can never
// pull the key-handling code in. No NEXT_PUBLIC_* variable is used or referenced anywhere in this path.
export * from "./quote-client.js";
export * from "./quote-structural.js";
export * from "./price-guard.js";
export * from "./boundary-status.js";
export * from "./quote-eval-cli.js";
export * from "./registry-structural.js";
export * from "./guarded-settlement.js";
