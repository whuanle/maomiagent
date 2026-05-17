import type { DesktopWorkspaceFileTreeNode } from "../../../../shared/desktop-workspace";

import type { WorkspaceInspectorTreeKind } from "./workspace-inspector-tree";

export type WorkspaceInspectorTreeFilter = {
  files: Set<string>;
  dirs: Set<string>;
};

export function buildWorkspaceInspectorTreeFilter(
  allowed?: readonly string[],
): WorkspaceInspectorTreeFilter | undefined {
  if (!allowed || allowed.length === 0) {
    return undefined;
  }

  const files = new Set(allowed);
  const dirs = new Set<string>();

  for (const item of allowed) {
    const parts = item.split("/").filter(Boolean);
    for (let index = 0; index < parts.length - 1; index += 1) {
      const dir = parts.slice(0, index + 1).join("/");
      if (dir) {
        dirs.add(dir);
      }
    }
  }

  return {
    files,
    dirs,
  };
}

export function buildWorkspaceInspectorTreeMarks(
  modified?: readonly string[],
  kinds?: ReadonlyMap<string, WorkspaceInspectorTreeKind>,
): Set<string> | undefined {
  const out = new Set<string>();
  for (const item of modified ?? []) {
    out.add(item);
  }
  for (const item of kinds?.keys() ?? []) {
    out.add(item);
  }
  return out.size > 0 ? out : undefined;
}

export function normalizeWorkspaceInspectorTreePath(path: string) {
  return path.replace(/[\\/]+$/, "").replaceAll("\\", "/");
}

function workspaceInspectorTreeBasenameOf(path: string) {
  return normalizeWorkspaceInspectorTreePath(path).split("/").filter(Boolean).pop() ?? "";
}

function workspaceInspectorTreeParentOf(path: string) {
  const normalized = normalizeWorkspaceInspectorTreePath(path);
  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return "";
  }
  return normalized.slice(0, index);
}

export function resolveWorkspaceInspectorTreeChangeLabel(kind: WorkspaceInspectorTreeKind) {
  if (kind === "add") {
    return "A";
  }
  if (kind === "del") {
    return "D";
  }
  return "M";
}

export function resolveWorkspaceInspectorTreeChangeColor(kind?: WorkspaceInspectorTreeKind) {
  if (kind === "add") {
    return "var(--chat-success-solid)";
  }
  if (kind === "del") {
    return "var(--chat-danger-solid)";
  }
  if (kind === "mix") {
    return "#0f8c8c";
  }
  return undefined;
}

export function resolveWorkspaceInspectorVisibleKind(
  node: DesktopWorkspaceFileTreeNode,
  kinds?: ReadonlyMap<string, WorkspaceInspectorTreeKind>,
  marks?: Set<string>,
) {
  const kind = kinds?.get(node.path);
  if (!kind) {
    return undefined;
  }
  if (!marks?.has(node.path)) {
    return undefined;
  }
  return kind;
}

export function buildWorkspaceInspectorVisibleNodes(input: {
  path: string;
  nodesByDir: Record<string, DesktopWorkspaceFileTreeNode[]>;
  filter?: WorkspaceInspectorTreeFilter;
}) {
  const current = input.nodesByDir[input.path] ?? [];
  if (!input.filter) {
    return current;
  }

  const out = current.filter((node) => (
    node.type === "directory"
      ? input.filter?.dirs.has(node.path)
      : input.filter?.files.has(node.path)
  ));
  const seen = new Set(out.map((node) => node.path));

  for (const dir of input.filter.dirs) {
    if (workspaceInspectorTreeParentOf(dir) !== input.path || seen.has(dir)) {
      continue;
    }
    out.push({
      name: workspaceInspectorTreeBasenameOf(dir),
      path: dir,
      absolutePath: dir,
      type: "directory",
      ignored: false,
    });
    seen.add(dir);
  }

  for (const file of input.filter.files) {
    if (workspaceInspectorTreeParentOf(file) !== input.path || seen.has(file)) {
      continue;
    }
    out.push({
      name: workspaceInspectorTreeBasenameOf(file),
      path: file,
      absolutePath: file,
      type: "file",
      ignored: false,
    });
    seen.add(file);
  }

  out.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  return out;
}