import { Empty, Spin } from "antd";
import { useMemo } from "react";

import type {
  DesktopGitChangesResult,
} from "../../../../shared/desktop-git";
import type { DesktopWorkspaceFileTreeNode } from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import type {
  InspectorChangeStatusMap,
} from "./workspace-inspector-state-model";
import type { WorkspaceInspectorCopy } from "./workspace-inspector-copy";
import { WorkspaceInspectorTree } from "./workspace-inspector-tree";
import { buildWorkspaceInspectorTreeKinds } from "./workspace-inspector-tree-kinds";

type Props = {
  language: LanguageCode;
  workspaceId?: string;
  copy: WorkspaceInspectorCopy;
  changes: DesktopGitChangesResult | null;
  nodesByDir: Record<string, DesktopWorkspaceFileTreeNode[]>;
  expandedByPath: Record<string, boolean>;
  loadingByPath: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  selectedFilePath: string;
  changeStatusMap: InspectorChangeStatusMap;
  isGitRepo?: boolean;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onOpenFilePreview: (path: string) => void;
  onRefreshGitState?: () => void | Promise<void>;
};

export function WorkspaceInspectorChanges(props: Props) {
  const rootLoading =
    props.loading
    || props.loadingByPath[""] === true
    || (!props.error && props.changes === null);
  const changedPaths = useMemo(
    () => props.changes?.items.map((item) => item.path) ?? [],
    [props.changes?.items],
  );
  const kinds = useMemo(
    () => buildWorkspaceInspectorTreeKinds(props.changeStatusMap),
    [props.changeStatusMap],
  );

  const emptyDescription = props.changes && !props.changes.isGitRepo
    ? props.copy.notGitRepo
    : props.copy.noChanges;

  return (
    <section className="chat-inspector-pane">
      <div className="chat-inspector-pane-body">
        {rootLoading ? (
          <div className="chat-inspector-pane-loading">
            <Spin size="small" />
          </div>
        ) : props.error ? (
          <div className="chat-inspector-pane-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.error} />
          </div>
        ) : (
          <WorkspaceInspectorTree
            language={props.language}
            workspaceId={props.workspaceId}
            path=""
            nodesByDir={props.nodesByDir}
            expandedByPath={props.expandedByPath}
            loadingByPath={props.loadingByPath}
            loadingLabel={props.copy.loading}
            activePath={props.selectedFilePath}
            allowed={changedPaths}
            modified={changedPaths}
            kinds={kinds}
            fileChanges={props.changeStatusMap.fileChanges}
            isGitRepo={props.isGitRepo}
            autoExpandFilteredDirectories
            onToggleDirectory={props.onToggleDirectory}
            onSelectFile={props.onSelectFile}
            onOpenFile={props.onOpenFilePreview}
            onRefreshGitState={props.onRefreshGitState}
            empty={(
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={emptyDescription}
              />
            )}
          />
        )}
      </div>
    </section>
  );
}
