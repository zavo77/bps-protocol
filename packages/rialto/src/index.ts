export interface WorkspaceInfo {
  readonly name: string;
  readonly implemented: boolean;
}

export const workspaceInfo: WorkspaceInfo = {
  name: "@bps/rialto",
  implemented: true,
};

// Server-only Rialto quote boundary (never import into browser/client code).
export * from "./quote-client.js";
