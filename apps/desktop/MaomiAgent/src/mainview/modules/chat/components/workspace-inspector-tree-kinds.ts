import type { WorkspaceInspectorTreeKind } from "./workspace-inspector-tree";
import type {
  InspectorChangeAggregateStatus,
  InspectorChangeStatusMap,
} from "./workspace-inspector-state-model";

export function resolveWorkspaceInspectorTreeKind(
  status?: InspectorChangeAggregateStatus,
): WorkspaceInspectorTreeKind | undefined {
  if (!status) {
    return undefined;
  }
  if (status === "added" || status === "untracked") {
    return "add";
  }
  if (status === "deleted") {
    return "del";
  }
  return "mix";
}

export function buildWorkspaceInspectorTreeKinds(changeStatusMap: InspectorChangeStatusMap) {
  const kinds = new Map<string, WorkspaceInspectorTreeKind>();

  for (const [path, status] of changeStatusMap.directoryStatus) {
    const kind = resolveWorkspaceInspectorTreeKind(status);
    if (kind) {
      kinds.set(path, kind);
    }
  }

  for (const [path, status] of changeStatusMap.fileStatus) {
    const kind = resolveWorkspaceInspectorTreeKind(status);
    if (kind) {
      kinds.set(path, kind);
    }
  }

  return kinds;
}