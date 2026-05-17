import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { Button, Empty } from "antd";
import { memo, useEffect, useMemo, useState } from "react";

import type { GitPageCopy } from "../i18n";
import { WorkspaceDiffChanges } from "./diff-changes";
import { WorkspaceFileIcon } from "./file-icon";
import { resolveWorkspaceReviewStatusClass } from "./review-model";
import {
  buildGitChangeTree,
  LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD,
  type GitChangeTreeDirectoryNode,
  type GitChangeTreeNode,
  type GitSectionEntry,
  type GitSectionKey,
} from "./view-model";

type Props = {
  copy: GitPageCopy;
  entries: GitSectionEntry[];
  sectionKey: GitSectionKey;
  activePath?: string;
  busyAction?: string;
  emptyDescription: string;
  onSelectFile: (path: string) => void;
  onRunPrimary: (path: string) => void;
  onRunSecondary?: (path: string) => void;
};

function buildInitialCollapsedDirectories(input: {
  nodes: GitChangeTreeNode[];
  activePath?: string;
  collapseAll: boolean;
}) {
  const next: Record<string, boolean> = {};

  const visit = (node: GitChangeTreeNode) => {
    if (node.type !== "directory") {
      return;
    }

    const keepOpen = input.activePath
      ? input.activePath === node.path || input.activePath.startsWith(`${node.path}/`)
      : false;

    next[node.path] = input.collapseAll && !keepOpen;
    node.children.forEach(visit);
  };

  input.nodes.forEach(visit);
  return next;
}

function resolveStatusGlyph(status: GitSectionEntry["status"]) {
  if (status === "added") {
    return "A";
  }
  if (status === "deleted") {
    return "D";
  }
  if (status === "renamed") {
    return "R";
  }
  if (status === "conflict") {
    return "!";
  }
  if (status === "untracked") {
    return "U";
  }
  return "M";
}

function resolveIndentClass(level: number) {
  return `is-level-${Math.min(level, 8)}`;
}

type TreeNodeProps = {
  copy: GitPageCopy;
  nodes: GitChangeTreeNode[];
  level: number;
  collapsedDirectories: Record<string, boolean>;
  activePath?: string;
  busyAction?: string;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRunPrimary: (path: string) => void;
  onRunSecondary?: (path: string) => void;
};

function TreeNodeList(props: TreeNodeProps) {
  return (
    <div className={props.level > 0 ? "git-page-change-tree is-nested" : "git-page-change-tree"}>
      {props.nodes.map((node) => {
        if (node.type === "directory") {
          const collapsed = props.collapsedDirectories[node.path];
          return (
            <div key={node.path} className="git-page-change-tree-group">
              <button
                type="button"
                className={`git-page-change-tree-row is-directory ${resolveIndentClass(props.level)}`}
                onClick={() => props.onToggleDirectory(node.path)}
              >
                <span className={collapsed ? "git-page-change-tree-caret" : "git-page-change-tree-caret is-open"}>
                  <DownOutlined />
                </span>
                <WorkspaceFileIcon
                  path={node.path}
                  className="git-page-review-file-icon"
                  isDirectory
                  expanded={!collapsed}
                />
                <span className="git-page-change-tree-label">{node.name}</span>
                <span className="git-page-change-tree-count">{node.fileCount}</span>
                <WorkspaceDiffChanges className="git-page-change-tree-diff" changes={node} />
              </button>
              {!collapsed && node.children.length > 0 ? (
                <TreeNodeList
                  {...props}
                  nodes={node.children}
                  level={props.level + 1}
                />
              ) : null}
            </div>
          );
        }

        const statusClassName = resolveWorkspaceReviewStatusClass(node.entry.status);
        const isActive = node.path === props.activePath;

        return (
          <div
            key={node.path}
            className={isActive ? "git-page-change-tree-row is-file is-active" : "git-page-change-tree-row is-file"}
          >
            <button
              type="button"
              className={`git-page-change-tree-main ${resolveIndentClass(props.level)}`}
              onClick={() => props.onSelectFile(node.path)}
            >
              <span className="git-page-change-tree-caret is-placeholder">
                <DownOutlined />
              </span>
              <WorkspaceFileIcon path={node.path} className="git-page-review-file-icon" />
              <span className="git-page-change-tree-label">{node.name}</span>
            </button>
            <div className="git-page-change-tree-utility">
              <div className="git-page-change-tree-side">
                <span className={`git-page-change-tree-status git-page-review-status ${statusClassName}`}>
                  {resolveStatusGlyph(node.entry.status)}
                </span>
                <WorkspaceDiffChanges className="git-page-change-tree-diff" changes={node.entry} />
              </div>
              <div className="git-page-change-tree-actions">
                <Button
                  type="text"
                  size="small"
                  className="git-page-change-tree-action"
                  icon={props.onRunSecondary ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  disabled={Boolean(props.busyAction)}
                  onClick={() => props.onRunPrimary(node.path)}
                />
                {props.onRunSecondary ? (
                  <Button
                    type="text"
                    danger
                    size="small"
                    className="git-page-change-tree-action"
                    icon={<DeleteOutlined />}
                    disabled={Boolean(props.busyAction)}
                    onClick={() => props.onRunSecondary?.(node.path)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const GitChangesTree = memo(function GitChangesTree(props: Props) {
  const treeNodes = useMemo(() => buildGitChangeTree(props.entries), [props.entries]);
  const shouldAutoCollapseDirectories = props.entries.length >= LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD;
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, boolean>>(() =>
    buildInitialCollapsedDirectories({
      nodes: treeNodes,
      activePath: props.activePath,
      collapseAll: shouldAutoCollapseDirectories,
    }));

  useEffect(() => {
    setCollapsedDirectories(buildInitialCollapsedDirectories({
      nodes: treeNodes,
      activePath: props.activePath,
      collapseAll: shouldAutoCollapseDirectories,
    }));
  }, [props.activePath, props.entries, shouldAutoCollapseDirectories, treeNodes]);

  if (props.entries.length === 0) {
    return (
      <div className="git-page-change-section-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.emptyDescription} />
      </div>
    );
  }

  return (
    <TreeNodeList
      copy={props.copy}
      nodes={treeNodes}
      level={0}
      collapsedDirectories={collapsedDirectories}
      activePath={props.activePath}
      busyAction={props.busyAction}
      onToggleDirectory={(path) => {
        setCollapsedDirectories((current) => ({
          ...current,
          [path]: !current[path],
        }));
      }}
      onSelectFile={props.onSelectFile}
      onRunPrimary={props.onRunPrimary}
      onRunSecondary={props.onRunSecondary}
    />
  );
});