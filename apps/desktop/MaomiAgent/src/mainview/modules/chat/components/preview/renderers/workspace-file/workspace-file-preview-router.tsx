import { Empty, Spin } from "antd";

import { WorkspaceFilePreviewPanel } from "../../../code-preview/workspace-file-preview-panel";
import { useWorkspaceFilePreviewState } from "./workspace-file-preview-state";

type Props = {
  conversationWorkspaceId: string;
  workspaceId: string;
  path: string;
};

export function WorkspaceFilePreviewRouter(props: Props) {
  const preview = useWorkspaceFilePreviewState({
    conversationWorkspaceId: props.conversationWorkspaceId,
    workspaceId: props.workspaceId,
    path: props.path,
  });

  if (preview.loading) {
    return (
      <div className="chat-inspector-pane-loading">
        <Spin size="small" />
      </div>
    );
  }

  if (preview.error || !preview.result) {
    return (
      <div className="chat-inspector-pane-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={preview.error || "无法读取文件内容"} />
      </div>
    );
  }

  return <WorkspaceFilePreviewPanel result={preview.result} />;
}