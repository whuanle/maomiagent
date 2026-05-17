import type {
  DesktopGitChangeItem,
  DesktopGitChangeStatus,
} from "../../../../shared/desktop-git";

export type GitSectionKey = "staged" | "unstaged";

export type GitSectionEntry = {
  path: string;
  previousPath?: string;
  status: DesktopGitChangeStatus;
  additions: number;
  deletions: number;
  item: DesktopGitChangeItem;
};

export type GitChangeTreeFileNode = {
  type: "file";
  name: string;
  path: string;
  entry: GitSectionEntry;
};

export type GitChangeTreeDirectoryNode = {
  type: "directory";
  name: string;
  path: string;
  children: GitChangeTreeNode[];
  fileCount: number;
  additions: number;
  deletions: number;
  opaque?: boolean;
};

export type GitChangeTreeNode = GitChangeTreeFileNode | GitChangeTreeDirectoryNode;

type GitChangeTreeBuildNode = {
  name: string;
  path: string;
  directories: Map<string, GitChangeTreeBuildNode>;
  files: GitChangeTreeFileNode[];
  opaque: boolean;
  opaqueFileCount: number;
  opaqueAdditions: number;
  opaqueDeletions: number;
};

const OPAQUE_DOT_DIRECTORY_MIN_FILE_COUNT = 6;

export const LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD = 40;

function normalizeStatusFromCode(code: string | undefined, fallback: DesktopGitChangeStatus) {
  const normalized = code?.trim().toUpperCase().replace(/\?/g, "U") ?? "";
  const status = normalized[0] ?? "";
  if (status === "A") {
    return "added" as const;
  }
  if (status === "D") {
    return "deleted" as const;
  }
  if (status === "R") {
    return "renamed" as const;
  }
  if (status === "U") {
    return fallback === "untracked" ? "untracked" as const : "conflict" as const;
  }
  if (status === "M") {
    return "modified" as const;
  }
  return fallback;
}

function sectionHasChange(item: DesktopGitChangeItem, section: GitSectionKey) {
  const code = section === "staged" ? item.stagedStatus : item.unstagedStatus;
  return Boolean(code && code.trim() && code.trim() !== "-");
}

export function buildGitSectionEntries(
  items: DesktopGitChangeItem[],
  section: GitSectionKey,
): GitSectionEntry[] {
  return items
    .filter((item) => sectionHasChange(item, section))
    .map((item) => ({
      path: item.path,
      previousPath: item.previousPath,
      status: normalizeStatusFromCode(
        section === "staged" ? item.stagedStatus : item.unstagedStatus,
        item.status,
      ),
      additions: section === "staged"
        ? item.stagedAdditions ?? item.additions
        : item.unstagedAdditions ?? item.additions,
      deletions: section === "staged"
        ? item.stagedDeletions ?? item.deletions
        : item.unstagedDeletions ?? item.deletions,
      item,
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN-u-co-pinyin", {
      numeric: true,
      sensitivity: "base",
    }));
}

function compareLabels(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN-u-co-pinyin", {
    numeric: true,
    sensitivity: "base",
  });
}

function createGitChangeTreeBuildNode(name: string, path: string): GitChangeTreeBuildNode {
  return {
    name,
    path,
    directories: new Map<string, GitChangeTreeBuildNode>(),
    files: [],
    opaque: false,
    opaqueFileCount: 0,
    opaqueAdditions: 0,
    opaqueDeletions: 0,
  };
}

function isOpaqueDotDirectorySegment(segment: string) {
  return segment.startsWith(".") && segment.length > 1;
}

function buildOpaqueDotDirectoryPathSet(items: GitSectionEntry[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const normalizedPath = item.path.replaceAll("\\", "/");
    const parts = normalizedPath.split("/").filter(Boolean);

    let currentPath = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index] ?? "";
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!isOpaqueDotDirectorySegment(segment)) {
        continue;
      }

      counts.set(currentPath, (counts.get(currentPath) ?? 0) + 1);
    }
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= OPAQUE_DOT_DIRECTORY_MIN_FILE_COUNT)
      .map(([path]) => path),
  );
}

function summarizeGitChangeTree(nodes: GitChangeTreeNode[]) {
  return nodes.reduce(
    (summary, node) => {
      if (node.type === "directory") {
        summary.fileCount += node.fileCount;
        summary.additions += node.additions;
        summary.deletions += node.deletions;
        return summary;
      }

      summary.fileCount += 1;
      summary.additions += node.entry.additions;
      summary.deletions += node.entry.deletions;
      return summary;
    },
    {
      fileCount: 0,
      additions: 0,
      deletions: 0,
    },
  );
}

function finalizeGitChangeTreeNode(node: GitChangeTreeBuildNode): GitChangeTreeDirectoryNode {
  if (node.opaque) {
    return {
      type: "directory",
      name: node.name,
      path: node.path,
      children: [],
      fileCount: node.opaqueFileCount,
      additions: node.opaqueAdditions,
      deletions: node.opaqueDeletions,
      opaque: true,
    };
  }

  const directories = [...node.directories.values()]
    .sort((left, right) => compareLabels(left.name, right.name))
    .map((item) => finalizeGitChangeTreeNode(item));
  const files = [...node.files].sort((left, right) => compareLabels(left.name, right.name));
  const children: GitChangeTreeNode[] = [...directories, ...files];
  const summary = summarizeGitChangeTree(children);

  return {
    type: "directory",
    name: node.name,
    path: node.path,
    children,
    fileCount: summary.fileCount,
    additions: summary.additions,
    deletions: summary.deletions,
  };
}

export function buildGitChangeTree(items: GitSectionEntry[]): GitChangeTreeNode[] {
  const root = createGitChangeTreeBuildNode("", "");
  const opaqueDotDirectories = buildOpaqueDotDirectoryPathSet(items);

  for (const item of items) {
    const normalizedPath = item.path.replaceAll("\\", "/");
    const parts = normalizedPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      root.files.push({
        type: "file",
        name: normalizedPath,
        path: normalizedPath,
        entry: item,
      });
      continue;
    }

    let currentNode = root;
    let absorbedByOpaqueDirectory = false;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index] ?? "";
      const currentPath = currentNode.path ? `${currentNode.path}/${segment}` : segment;
      let nextNode = currentNode.directories.get(segment);
      if (!nextNode) {
        nextNode = createGitChangeTreeBuildNode(segment, currentPath);
        currentNode.directories.set(segment, nextNode);
      }

      if (opaqueDotDirectories.has(currentPath)) {
        nextNode.opaque = true;
        nextNode.opaqueFileCount += 1;
        nextNode.opaqueAdditions += item.additions;
        nextNode.opaqueDeletions += item.deletions;
        absorbedByOpaqueDirectory = true;
        break;
      }

      currentNode = nextNode;
    }

    if (absorbedByOpaqueDirectory) {
      continue;
    }

    currentNode.files.push({
      type: "file",
      name: parts[parts.length - 1] ?? normalizedPath,
      path: normalizedPath,
      entry: item,
    });
  }

  return [
    ...[...root.directories.values()]
      .sort((left, right) => compareLabels(left.name, right.name))
      .map((item) => finalizeGitChangeTreeNode(item)),
    ...[...root.files].sort((left, right) => compareLabels(left.name, right.name)),
  ];
}