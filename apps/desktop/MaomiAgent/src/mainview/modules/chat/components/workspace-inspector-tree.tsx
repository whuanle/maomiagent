import {
  CaretDownFilled,
  CaretRightFilled,
  LoadingOutlined,
} from "@ant-design/icons";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";

import type { DesktopGitChangeItem } from "../../../../shared/desktop-git";
import type { DesktopWorkspaceFileTreeNode } from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import { WorkspaceFileIcon } from "./workspace-file-icon";
import { WorkspaceInspectorFileContextMenu } from "./workspace-inspector-file-context-menu";
import {
  buildWorkspaceInspectorTreeFilter,
  buildWorkspaceInspectorTreeMarks,
  buildWorkspaceInspectorVisibleNodes,
  normalizeWorkspaceInspectorTreePath,
  resolveWorkspaceInspectorTreeChangeLabel,
  resolveWorkspaceInspectorVisibleKind,
  type WorkspaceInspectorTreeFilter,
} from "./workspace-inspector-tree-model";

export type WorkspaceInspectorTreeKind = "add" | "del" | "mix";

type Props = {
  language: LanguageCode;
  workspaceId?: string;
  path: string;
  nodesByDir: Record<string, DesktopWorkspaceFileTreeNode[]>;
  expandedByPath: Record<string, boolean>;
  loadingByPath: Record<string, boolean>;
  loadingLabel?: string;
  activePath?: string;
  level?: number;
  allowed?: readonly string[];
  modified?: readonly string[];
  kinds?: ReadonlyMap<string, WorkspaceInspectorTreeKind>;
  fileChanges?: ReadonlyMap<string, DesktopGitChangeItem>;
  isGitRepo?: boolean;
  autoExpandFilteredDirectories?: boolean;
  empty?: ReactNode;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onRefreshGitState?: () => void | Promise<void>;
  _filter?: WorkspaceInspectorTreeFilter;
  _marks?: Set<string>;
  _chain?: readonly string[];
};

const WorkspaceInspectorTreeFileIcon = memo(function WorkspaceInspectorTreeFileIcon(props: {
  node: DesktopWorkspaceFileTreeNode;
  kind?: WorkspaceInspectorTreeKind;
}) {
  const kindClass = props.kind ? `is-${props.kind}` : "";

  if (props.node.ignored) {
    return (
      <WorkspaceFileIcon
        path={props.node.path}
        kind="file"
        mono
        className="chat-inspector-tree-node-icon filetree-icon filetree-icon--mono is-muted"
      />
    );
  }

  if (props.kind) {
    return (
      <WorkspaceFileIcon
        path={props.node.path}
        kind="file"
        mono
        className={`chat-inspector-tree-node-icon filetree-icon filetree-icon--mono ${kindClass}`.trim()}
      />
    );
  }

  return (
    <WorkspaceFileIcon
      path={props.node.path}
      kind="file"
      className="chat-inspector-tree-node-icon"
    />
  );
});

const WorkspaceInspectorTreeDirectory = memo(function WorkspaceInspectorTreeDirectory(props: {
  node: DesktopWorkspaceFileTreeNode;
  level: number;
  expanded: boolean;
  loading: boolean;
  selected: boolean;
  kind?: WorkspaceInspectorTreeKind;
  children?: ReactNode;
  onToggle: () => void;
}) {
  const kindClass = props.kind ? `is-${props.kind}` : "";
  const directoryIconClassName = [
    "chat-inspector-tree-node-icon",
    "chat-inspector-tree-directory-icon",
    props.kind ? "filetree-icon filetree-icon--mono" : "",
    kindClass,
  ].filter(Boolean).join(" ");

  return (
    <div className="chat-inspector-tree-group">
      <button
        type="button"
        className={[
          "chat-inspector-tree-row",
          props.selected ? "is-active" : "",
        ].filter(Boolean).join(" ")}
        data-tree-kind="directory"
        data-level={String(Math.min(props.level, 12))}
        onClick={props.onToggle}
        title={props.node.path || props.node.name}
        ref={(node) => {
          if (node && props.selected) {
            requestAnimationFrame(() => {
              node.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            });
          }
        }}
      >
        <span className="chat-inspector-tree-leading">
          {props.loading ? (
            <LoadingOutlined spin className="chat-inspector-tree-caret is-loading" />
          ) : props.expanded ? (
            <CaretDownFilled className="chat-inspector-tree-caret" />
          ) : (
            <CaretRightFilled className="chat-inspector-tree-caret" />
          )}
        </span>
        <span className="chat-inspector-tree-node">
          <WorkspaceFileIcon
            path={props.node.path}
            kind="directory"
            expanded={props.expanded}
            mono={Boolean(props.kind)}
            className={directoryIconClassName}
          />
        </span>
        <span
          className={[
            "chat-inspector-tree-name",
            props.kind ? "is-kind-active" : "",
            kindClass,
          ].filter(Boolean).join(" ")}
        >
          {props.node.name}
        </span>
        {props.kind ? (
          <span
            className={`chat-inspector-tree-mark is-dot is-${props.kind}`}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {props.expanded ? (
        <div className="chat-inspector-tree-children">
          {props.children}
        </div>
      ) : null}
    </div>
  );
});

const WorkspaceInspectorTreeLoading = memo(function WorkspaceInspectorTreeLoading(props: {
  level: number;
  loadingLabel?: string;
}) {
  return (
    <div
      className="chat-inspector-tree-loading"
      data-level={String(Math.min(props.level, 12))}
    >
      <LoadingOutlined spin className="chat-inspector-tree-loading-icon" />
      <span className="chat-inspector-tree-loading-text">
        {props.loadingLabel ?? "加载中..."}
      </span>
    </div>
  );
});

const WorkspaceInspectorTreeFile = memo(function WorkspaceInspectorTreeFile(props: {
  language: LanguageCode;
  workspaceId?: string;
  node: DesktopWorkspaceFileTreeNode;
  level: number;
  selected: boolean;
  kind?: WorkspaceInspectorTreeKind;
  gitChange?: DesktopGitChangeItem;
  isGitRepo?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  onRefreshGitState?: () => void | Promise<void>;
}) {
  const kindClass = props.kind ? `is-${props.kind}` : "";

  return (
    <WorkspaceInspectorFileContextMenu
      language={props.language}
      workspaceId={props.workspaceId}
      path={props.node.path}
      absolutePath={props.node.absolutePath}
      isGitRepo={props.isGitRepo}
      gitChange={props.gitChange}
      onSelect={() => props.onSelect()}
      onOpen={() => props.onOpen?.()}
      onAfterGitMutation={props.onRefreshGitState}
    >
      <button
        type="button"
        className={[
          "chat-inspector-tree-row",
          props.selected ? "is-active" : "",
          props.node.ignored ? "is-dimmed" : "",
        ].filter(Boolean).join(" ")}
        data-tree-kind="file"
        data-level={String(Math.min(props.level, 12))}
        onClick={props.onSelect}
        onDoubleClick={props.onOpen}
        title={props.node.path}
        ref={(node) => {
          if (node && props.selected) {
            requestAnimationFrame(() => {
              node.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            });
          }
        }}
      >
        <span className="chat-inspector-tree-leading">
          <span className="chat-inspector-tree-caret is-placeholder" />
        </span>
        <span className="chat-inspector-tree-node">
          <WorkspaceInspectorTreeFileIcon node={props.node} kind={props.kind} />
        </span>
        <span
          className={[
            "chat-inspector-tree-name",
            props.kind ? "is-kind-active" : "",
            kindClass,
          ].filter(Boolean).join(" ")}
        >
          {props.node.name}
        </span>
        {props.kind ? (
          <span
            className={`chat-inspector-tree-mark is-label is-${props.kind}`}
            aria-hidden="true"
          >
            {resolveWorkspaceInspectorTreeChangeLabel(props.kind)}
          </span>
        ) : null}
      </button>
    </WorkspaceInspectorFileContextMenu>
  );
});

export function WorkspaceInspectorTree(props: Props) {
  const level = props.level ?? 0;
  const autoExpandedRef = useRef(false);
  const filter = useMemo(
    () => props._filter ?? buildWorkspaceInspectorTreeFilter(props.allowed),
    [props._filter, props.allowed],
  );
  const marks = useMemo(
    () => props._marks ?? buildWorkspaceInspectorTreeMarks(props.modified, props.kinds),
    [props._marks, props.kinds, props.modified],
  );
  const chain = useMemo(
    () => props._chain
      ? [...props._chain, normalizeWorkspaceInspectorTreePath(props.path)]
      : [normalizeWorkspaceInspectorTreePath(props.path)],
    [props._chain, props.path],
  );

  useEffect(() => {
    if (
      level !== 0
      || !props.autoExpandFilteredDirectories
      || !filter
      || autoExpandedRef.current
    ) {
      return;
    }

    autoExpandedRef.current = true;
    for (const dir of filter.dirs) {
      if (props.expandedByPath[dir]) {
        continue;
      }
      props.onToggleDirectory(dir);
    }
  }, [
    filter,
    level,
    props.autoExpandFilteredDirectories,
    props.expandedByPath,
    props.onToggleDirectory,
  ]);

  const nodes = useMemo(() => buildWorkspaceInspectorVisibleNodes({
    path: props.path,
    nodesByDir: props.nodesByDir,
    filter,
  }), [filter, props.nodesByDir, props.path]);
  const rootLoading = level === 0 && props.loadingByPath[props.path] && nodes.length === 0;

  if (rootLoading) {
    return <WorkspaceInspectorTreeLoading level={level} loadingLabel={props.loadingLabel} />;
  }

  if (level === 0 && nodes.length === 0) {
    return <div className="chat-inspector-tree-empty">{props.empty}</div>;
  }

  return (
    <div className="chat-inspector-tree" data-component="filetree">
      {nodes.map((node) => {
        const kind = resolveWorkspaceInspectorVisibleKind(node, props.kinds, marks);
        const selected = props.activePath === node.path;

        if (node.type === "directory") {
          const expanded = props.expandedByPath[node.path] === true;
          const loading = props.loadingByPath[node.path] === true;
          const hasLoadedChildren = props.nodesByDir[node.path] !== undefined;

          return (
            <WorkspaceInspectorTreeDirectory
              key={node.path}
              node={node}
              level={level}
              expanded={expanded}
              loading={loading}
              selected={selected}
              kind={kind}
              onToggle={() => props.onToggleDirectory(node.path)}
            >
              {loading && !hasLoadedChildren ? (
                <WorkspaceInspectorTreeLoading
                  level={level + 1}
                  loadingLabel={props.loadingLabel}
                />
              ) : !chain.includes(normalizeWorkspaceInspectorTreePath(node.path)) ? (
                <WorkspaceInspectorTree
                  language={props.language}
                  workspaceId={props.workspaceId}
                  path={node.path}
                  nodesByDir={props.nodesByDir}
                  expandedByPath={props.expandedByPath}
                  loadingByPath={props.loadingByPath}
                  loadingLabel={props.loadingLabel}
                  activePath={props.activePath}
                  level={level + 1}
                  allowed={props.allowed}
                  modified={props.modified}
                  kinds={props.kinds}
                  fileChanges={props.fileChanges}
                  isGitRepo={props.isGitRepo}
                  autoExpandFilteredDirectories={props.autoExpandFilteredDirectories}
                  onToggleDirectory={props.onToggleDirectory}
                  onSelectFile={props.onSelectFile}
                  onOpenFile={props.onOpenFile}
                  onRefreshGitState={props.onRefreshGitState}
                  _filter={filter}
                  _marks={marks}
                  _chain={chain}
                />
              ) : (
                <div className="chat-inspector-tree-loop">...</div>
              )}
            </WorkspaceInspectorTreeDirectory>
          );
        }

        return (
          <WorkspaceInspectorTreeFile
            key={node.path}
            language={props.language}
            workspaceId={props.workspaceId}
            node={node}
            level={level}
            selected={selected}
            kind={kind}
            gitChange={props.fileChanges?.get(node.path)}
            isGitRepo={props.isGitRepo}
            onSelect={() => props.onSelectFile(node.path)}
            onOpen={() => props.onOpenFile?.(node.path)}
            onRefreshGitState={props.onRefreshGitState}
          />
        );
      })}
    </div>
  );
}
