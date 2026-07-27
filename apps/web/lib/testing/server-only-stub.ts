// Test-only stub for the `server-only` package (see vitest.config.ts alias).
// The real package throws on client import; this no-op lets node-env unit tests
// exercise server-lib logic. Never imported by the production build.
export {};
