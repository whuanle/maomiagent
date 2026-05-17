import { DownOutlined, MoreOutlined, RightOutlined } from "@ant-design/icons";
import { Button, Dropdown, Empty, type MenuProps } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { DesktopGitBranchItem } from "../../../../shared/desktop-git";
import type { GitBranchCopy } from "../branch-copy";
import { formatGitSyncText } from "./branch-model";

type BranchActionMenuKey = string;

type BranchTreeGroupNode = {
  key: string;
  kind: "group";
  label: string;
  count: number;
  children: BranchTreeNode[];
};

type BranchTreeFolderNode = {
  key: string;
  kind: "folder";
  label: string;
  count: number;
  children: BranchTreeNode[];
};

type BranchTreeBranchNode = {
  key: string;
  kind: "branch";
  label: string;
  branch: DesktopGitBranchItem;
  children: [];
};

type BranchTreeNode = BranchTreeGroupNode | BranchTreeFolderNode | BranchTreeBranchNode;

type BuildBranchTreeResult = {
  roots: BranchTreeNode[];
  expandableKeys: string[];
  requiredExpandedKeys: string[];
};

type Props = {
  copy: GitBranchCopy;
  items: DesktopGitBranchItem[];
  selectedBranchName: string | null;
  busyAction: string | null;
  searchValue: string;
  emptyDescription: string;
  getActionMenuItems: (item: DesktopGitBranchItem) => NonNullable<MenuProps["items"]>;
  onSelectBranch: (item: DesktopGitBranchItem) => void;
  onMenuAction: (item: DesktopGitBranchItem, key: BranchActionMenuKey) => void;
};

function arraysEqual(left: readonly string[], right: readonly string[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function createGroupNode(kind: DesktopGitBranchItem["kind"], count: number): BranchTreeGroupNode {
  return {
    key: `group:${kind}`,
    kind: "group",
    label: kind,
    count,
    children: [],
  };
}

function createFolderNode(kind: DesktopGitBranchItem["kind"], path: string, label: string): BranchTreeFolderNode {
  return {
    key: `folder:${kind}:${path}`,
    kind: "folder",
    label,
    count: 0,
    children: [],
  };
}

function createBranchNode(kind: DesktopGitBranchItem["kind"], item: DesktopGitBranchItem, label: string): BranchTreeBranchNode {
  return {
    key: `branch:${kind}:${item.name}`,
    kind: "branch",
    label,
    branch: item,
    children: [],
  };
}

function buildBranchTree(input: {
  items: DesktopGitBranchItem[];
  selectedBranchName: string | null;
}): BuildBranchTreeResult {
  const roots: BranchTreeNode[] = [];
  const rootByKind = new Map<DesktopGitBranchItem["kind"], BranchTreeGroupNode>();
  const ancestorsByBranchName = new Map<string, string[]>();
  const expandableKeys = new Set<string>();

  for (const item of input.items) {
    let root = rootByKind.get(item.kind);
    if (!root) {
      root = createGroupNode(item.kind, 0);
      rootByKind.set(item.kind, root);
      roots.push(root);
      expandableKeys.add(root.key);
    }
    root.count += 1;

    const segments = item.name.split("/").filter(Boolean);
    const branchLabel = segments[segments.length - 1] || item.name;
    const ancestors = [root.key];
    let parentChildren = root.children;
    let pathAccumulator = "";

    for (let index = 0; index < Math.max(segments.length - 1, 0); index += 1) {
      const segment = segments[index] ?? "";
      pathAccumulator = pathAccumulator ? `${pathAccumulator}/${segment}` : segment;
      const folderKey = `folder:${item.kind}:${pathAccumulator}`;
      let folderNode = parentChildren.find((child): child is BranchTreeFolderNode => child.key === folderKey && child.kind !== "branch");
      if (!folderNode) {
        folderNode = createFolderNode(item.kind, pathAccumulator, segment);
        parentChildren.push(folderNode);
      }
      folderNode.count += 1;
      ancestors.push(folderKey);
      expandableKeys.add(folderKey);
      parentChildren = folderNode.children;
    }

    parentChildren.push(createBranchNode(item.kind, item, branchLabel));
    ancestorsByBranchName.set(item.name, ancestors);
  }

  const requiredExpandedKeys = input.selectedBranchName
    ? [...new Set(ancestorsByBranchName.get(input.selectedBranchName) ?? [...rootByKind.keys()].map((kind) => `group:${kind}`))]
    : roots.map((root) => root.key);

  return {
    roots,
    expandableKeys: [...expandableKeys],
    requiredExpandedKeys,
  };
}

function resolveIndentClass(level: number) {
  return `is-level-${Math.min(level, 8)}`;
}

export function GitBranchTree(props: Props) {
  const tree = useMemo(() => buildBranchTree({
    items: props.items,
    selectedBranchName: props.selectedBranchName,
  }), [props.items, props.selectedBranchName]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(tree.requiredExpandedKeys);

  useEffect(() => {
    const expandableKeySet = new Set(tree.expandableKeys);
    setExpandedKeys((current) => {
      if (props.searchValue.trim()) {
        return arraysEqual(current, tree.expandableKeys) ? current : tree.expandableKeys;
      }

      const next = [...new Set([
        ...current.filter((key) => expandableKeySet.has(key)),
        ...tree.requiredExpandedKeys,
      ])];
      return arraysEqual(current, next) ? current : next;
    });
  }, [props.searchValue, tree.expandableKeys, tree.requiredExpandedKeys]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]);
  };

  const renderNode = (node: BranchTreeNode, depth: number): ReactNode => {
    const indentClassName = resolveIndentClass(depth);

    if (node.kind === "branch") {
      const item = node.branch;
      const isSelected = item.name === props.selectedBranchName;
      const syncText =
        item.ahead > 0 || item.behind > 0 || item.current
          ? formatGitSyncText(item.ahead, item.behind, props.copy.syncUpToDateLabel)
          : "";
      const actionMenuItems = props.getActionMenuItems(item);

      const row = (
        <div
          key={node.key}
          className={`git-page-branch-tree-row is-branch${isSelected ? " is-selected" : ""}${item.current ? " is-current" : ""}`}
        >
          <button
            type="button"
            className={`git-page-branch-tree-main ${indentClassName}`}
            onClick={() => props.onSelectBranch(item)}
          >
            <span className="git-page-branch-tree-caret is-placeholder" aria-hidden="true">
              <RightOutlined />
            </span>
            {item.current ? (
              <span className="git-page-branch-tree-current-dot" aria-hidden="true" />
            ) : null}
            <span className="git-page-branch-tree-label">{node.label}</span>
            {syncText ? (
              <span className={`git-page-branch-tree-sync${item.current ? " is-active" : ""}`}>
                {syncText}
              </span>
            ) : null}
          </button>
          <div className="git-page-branch-tree-actions">
            <Dropdown
              menu={{
                items: actionMenuItems,
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  props.onMenuAction(item, String(key));
                },
              }}
              trigger={["click"]}
            >
              <Button
                size="small"
                type="text"
                className="git-page-branch-action-button"
                icon={<MoreOutlined />}
                disabled={props.busyAction !== null}
                onClick={(event) => event.stopPropagation()}
              />
            </Dropdown>
          </div>
        </div>
      );

      return (
        <Dropdown
          key={node.key}
          menu={{
            items: actionMenuItems,
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              props.onMenuAction(item, String(key));
            },
          }}
          trigger={["contextMenu"]}
        >
          <div onContextMenu={() => props.onSelectBranch(item)}>
            {row}
          </div>
        </Dropdown>
      );
    }

    const expanded = expandedKeys.includes(node.key);
    const label = node.kind === "group"
      ? (node.label === "local" ? props.copy.branchTypeLocal : props.copy.branchTypeRemote)
      : node.label;

    return (
      <div key={node.key} className={`git-page-branch-tree-node is-${node.kind}`}>
        <button
          type="button"
          className={`git-page-branch-tree-row is-${node.kind} ${indentClassName}`}
          onClick={() => toggleExpanded(node.key)}
        >
          <span className="git-page-branch-tree-caret" aria-hidden="true">
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </span>
          <span className="git-page-branch-tree-row-copy">
            <span className={`git-page-branch-tree-label is-${node.kind}`}>{label}</span>
            {node.count > 0 ? (
              <span className={`git-page-branch-tree-count is-${node.kind}`}>
                {node.count}
              </span>
            ) : null}
          </span>
        </button>
        {expanded ? (
          <div className="git-page-branch-tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  if (tree.roots.length === 0) {
    return (
      <div className="git-page-branch-tree-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.emptyDescription} />
      </div>
    );
  }

  return (
    <div className="git-page-branch-tree-shell">
      <div className="git-page-branch-tree">
        {tree.roots.map((root) => renderNode(root, 0))}
      </div>
    </div>
  );
}