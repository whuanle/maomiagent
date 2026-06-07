import type { DesktopWorkspaceItem } from "../../shared/desktop-workspace";

const DEDICATED_WORKSPACE_ID_PREFIXES = ["wechat-", "feishu-"];
const DEDICATED_WORKSPACE_PATH_SEGMENTS = [
  "/desktop/workspaces/channels/wechat/",
  "/desktop/workspaces/channels/feishu/",
];

function normalizeWorkspacePath(value: string | undefined): string {
  return (value ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

export function isDedicatedExternalWorkspace(item: DesktopWorkspaceItem): boolean {
  const workspaceId = item.workspaceId.trim().toLowerCase();
  if (DEDICATED_WORKSPACE_ID_PREFIXES.some((prefix) => workspaceId.startsWith(prefix))) {
    return true;
  }

  const directoryPath = normalizeWorkspacePath(item.directoryPath);
  return DEDICATED_WORKSPACE_PATH_SEGMENTS.some((segment) => directoryPath.includes(segment));
}

export function filterSelectableDesktopWorkspaces(
  items: readonly DesktopWorkspaceItem[],
): DesktopWorkspaceItem[] {
  return items.filter((item) => !isDedicatedExternalWorkspace(item));
}
