export interface WorkspaceInfo {
  readonly name: string;
  readonly implemented: boolean;
}

export const workspaceInfo: WorkspaceInfo = {
  name: "@bps/rialto",
  implemented: true,
};

// The server-only Rialto quote boundary is deliberately NOT re-exported here. It handles the
// RIALTO_API_KEY server-side and must never be reachable from browser/client bundles that import the
// package's main entry. Import it explicitly from "@bps/rialto/server" (see ./server.ts).
