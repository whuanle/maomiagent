import type {
  DesktopGitBranchItem,
  DesktopGitHistoryItem,
} from "../../../../shared/desktop-git";

type GitHistoryLaneState = {
  hash: string;
  color: string;
};

export type GitHistoryGraphLink = {
  from: number;
  to: number;
  color: string;
};

export type GitHistoryGraphRow = {
  hash: string;
  nodeLane: number;
  laneCount: number;
  lanesBefore: GitHistoryLaneState[];
  lanesAfter: GitHistoryLaneState[];
  transitions: GitHistoryGraphLink[];
  parentEdges: GitHistoryGraphLink[];
  nodeColor: string;
};

export type GitHistoryGraphLayout = {
  rows: GitHistoryGraphRow[];
  maxLaneCount: number;
};

const GIT_HISTORY_GRAPH_COLORS = [
  "var(--app-accent-solid, #1677ff)",
  "var(--chat-success-text, #2f9e44)",
  "var(--chat-warning-text, #d97706)",
  "var(--chat-danger-text, #dc2626)",
  "#7c3aed",
  "#0891b2",
  "#65a30d",
  "#c2410c",
];

export const GIT_HISTORY_GRAPH_LANE_GAP = 10;
export const GIT_HISTORY_GRAPH_START_X = 11;

export function getGitHistoryGraphLaneX(index: number) {
  return GIT_HISTORY_GRAPH_START_X + index * GIT_HISTORY_GRAPH_LANE_GAP;
}

export function getGitHistoryGraphColumnWidth(laneCount: number) {
  const safeLaneCount = Math.max(1, laneCount);
  return Math.max(30, GIT_HISTORY_GRAPH_START_X * 2 + (safeLaneCount - 1) * GIT_HISTORY_GRAPH_LANE_GAP + 8);
}

export function buildGitHistoryGraph(items: DesktopGitHistoryItem[]): GitHistoryGraphLayout {
  let colorCursor = 0;
  let activeLanes: GitHistoryLaneState[] = [];
  let maxLaneCount = 1;

  const nextLaneColor = () => {
    const color = GIT_HISTORY_GRAPH_COLORS[colorCursor % GIT_HISTORY_GRAPH_COLORS.length] ?? GIT_HISTORY_GRAPH_COLORS[0]!;
    colorCursor += 1;
    return color;
  };

  const rows = items.map<GitHistoryGraphRow>((item) => {
    let nodeLane = activeLanes.findIndex((lane) => lane.hash === item.hash);
    if (nodeLane < 0) {
      nodeLane = activeLanes.length;
      activeLanes = [...activeLanes, {
        hash: item.hash,
        color: nextLaneColor(),
      }];
    }

    const nodeLaneState = activeLanes[nodeLane] ?? {
      hash: item.hash,
      color: nextLaneColor(),
    };
    const lanesBefore = activeLanes.map((lane) => ({ ...lane }));
    const nextLanes = [...activeLanes];
    const parentHashes = item.parentHashes.filter(Boolean);

    if (parentHashes.length > 0) {
      nextLanes[nodeLane] = {
        hash: parentHashes[0]!,
        color: nodeLaneState.color,
      };

      for (const parentHash of parentHashes.slice(1)) {
        if (nextLanes.some((lane) => lane.hash === parentHash)) {
          continue;
        }
        nextLanes.splice(nodeLane + 1, 0, {
          hash: parentHash,
          color: nextLaneColor(),
        });
      }
    } else {
      nextLanes.splice(nodeLane, 1);
    }

    const lanesAfter = nextLanes.map((lane) => ({ ...lane }));
    const afterLaneMap = new Map(lanesAfter.map((lane, index) => [lane.hash, index]));
    const transitions = lanesBefore.flatMap<GitHistoryGraphLink>((lane, index) => {
      const target = afterLaneMap.get(lane.hash);
      if (typeof target !== "number" || target === index) {
        return [];
      }
      return [{
        from: index,
        to: target,
        color: lane.color,
      }];
    });
    const parentEdges = parentHashes.flatMap<GitHistoryGraphLink>((parentHash) => {
      const target = afterLaneMap.get(parentHash);
      if (typeof target !== "number" || target === nodeLane) {
        return [];
      }
      return [{
        from: nodeLane,
        to: target,
        color: lanesAfter[target]?.color ?? nodeLaneState.color,
      }];
    });
    const laneCount = Math.max(1, lanesBefore.length, lanesAfter.length);
    maxLaneCount = Math.max(maxLaneCount, laneCount);
    activeLanes = lanesAfter;

    return {
      hash: item.hash,
      nodeLane,
      laneCount,
      lanesBefore,
      lanesAfter,
      transitions,
      parentEdges,
      nodeColor: nodeLaneState.color,
    };
  });

  return {
    rows,
    maxLaneCount,
  };
}

export function formatGitSyncText(ahead: number, behind: number, upToDateLabel: string) {
  if (ahead <= 0 && behind <= 0) {
    return upToDateLabel;
  }
  return `↑${ahead} ↓${behind}`;
}

export function deriveLocalGitBranchName(remoteName: string): string {
  const normalized = remoteName.trim();
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return normalized;
  }
  return parts.slice(1).join("/");
}

export function matchesGitBranchSearch(item: DesktopGitBranchItem, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    item.name,
    item.upstream,
    item.lastCommitSubject,
    item.lastCommitHash,
  ].some((value) => value?.toLowerCase().includes(normalized));
}

export function matchesGitHistorySearch(item: DesktopGitHistoryItem, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    item.hash,
    item.shortHash,
    item.subject,
    item.authorName,
    item.authorEmail,
    item.authoredRelative,
  ].some((value) => value?.toLowerCase().includes(normalized));
}