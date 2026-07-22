export interface WorkspaceInfo {
  readonly name: string;
  readonly implemented: boolean;
}

export const workspaceInfo: WorkspaceInfo = {
  name: "@bps/db",
  implemented: false,
};
