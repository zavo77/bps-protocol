export interface WorkspaceInfo {
  readonly name: string;
  readonly implemented: boolean;
}

export const workspaceInfo: WorkspaceInfo = {
  name: "@bps/shared",
  implemented: true,
};

export * from "./proof-of-distribution/index.js";
