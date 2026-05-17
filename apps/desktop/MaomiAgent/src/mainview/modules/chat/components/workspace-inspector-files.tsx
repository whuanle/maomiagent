import { Empty } from "antd";
import { useMemo } from "react";

import type { DesktopWorkspaceFileTreeNode } from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import type { InspectorChangeStatusMap } from "./workspace-inspector-state-model";
import type { WorkspaceInspectorCopy } from "./workspace-inspector-copy";
import { buildWorkspaceInspectorTreeKinds } from "./workspace-inspector-tree-kinds";
import { WorkspaceInspectorTree } from "./workspace-inspector-tree";

type Props = {
  language: LanguageCode;
  workspaceId?: string;
  copy: WorkspaceInspectorCopy;
  nodesByDir: Record<string, DesktopWorkspaceFileTreeNode[]>;
  expandedByPath: Record<string, boolean>;
  loadingByPath: Record<string, boolean>;
  error: string | null;
  selectedFilePath: string;
  changeStatusMap: InspectorChangeStatusMap;
  changedPaths: string[];
  isGitRepo?: boolean;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onOpenFilePreview: (path: string) => void;
  onRefreshGitState?: () => void | Promise<void>;
};

export function WorkspaceInspectorFiles(props: Props) {
  const kinds = useMemo(
    () => buildWorkspaceInspectorTreeKinds(props.changeStatusMap),
    [props.changeStatusMap],
  );

  return (
    <section className="chat-inspector-pane">
      <div className="chat-inspector-pane-body">
        {props.error ? (
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
            modified={props.changedPaths}
            kinds={kinds}
            fileChanges={props.changeStatusMap.fileChanges}
            isGitRepo={props.isGitRepo}
            onToggleDirectory={props.onToggleDirectory}
            onSelectFile={props.onSelectFile}
            onOpenFile={props.onOpenFilePreview}
            onRefreshGitState={props.onRefreshGitState}
            empty={(
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={props.copy.noFiles}
              />
            )}
          />
        )}
      </div>
    </section>
  );
}
