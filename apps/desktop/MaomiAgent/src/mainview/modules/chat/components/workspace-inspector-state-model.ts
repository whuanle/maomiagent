import type {
  DesktopGitChangeItem,
  DesktopGitChangeStatus,
} from "../../../../shared/desktop-git";

export type InspectorChangeAggregateStatus = DesktopGitChangeStatus | "mixed";

export type InspectorChangeStatusMap = {
  fileStatus: Map<string, DesktopGitChangeStatus>;
  fileChanges: Map<string, DesktopGitChangeItem>;
  directoryStatus: Map<string, InspectorChangeAggregateStatus>;
};

function mergeInspectorChangeStatus(
  current: InspectorChangeAggregateStatus | undefined,
  next: DesktopGitChangeStatus,
): InspectorChangeAggregateStatus {
  if (!current) {
    return next;
  }
  if (current === next) {
    return current;
  }
  return "mixed";
}

export function buildInspectorChangeStatusMap(
  changeItems: DesktopGitChangeItem[],
): InspectorChangeStatusMap {
  const fileStatus = new Map<string, DesktopGitChangeStatus>();
  const fileChanges = new Map<string, DesktopGitChangeItem>();
  const directoryStatus = new Map<string, InspectorChangeAggregateStatus>();

  for (const item of changeItems) {
    fileStatus.set(item.path, item.status);
    fileChanges.set(item.path, item);

    const parts = item.path.split("/").filter(Boolean);
    let currentPath = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      currentPath = currentPath ? `${currentPath}/${parts[index]}` : (parts[index] ?? "");
      if (!currentPath) {
        continue;
      }
      directoryStatus.set(
        currentPath,
        mergeInspectorChangeStatus(directoryStatus.get(currentPath), item.status),
      );
    }
  }

  return {
    fileStatus,
    fileChanges,
    directoryStatus,
  };
}