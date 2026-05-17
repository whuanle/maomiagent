import { Empty } from "antd";

import { ConversationCodePreviewPanel } from "../code-preview/conversation-code-preview-panel";
import { WorkspaceFilePreviewRouter } from "./renderers/workspace-file/workspace-file-preview-router";
import type { ChatAttachedTabState } from "../../types";

type Props = {
  preview: ChatAttachedTabState;
};

export function ConversationPreviewRouter(props: Props) {
  if (props.preview.source.kind === "workspace-file") {
    const conversationWorkspaceId = props.preview.workspaceId?.trim() || undefined;
    const targetWorkspaceId = props.preview.source.targetWorkspaceId?.trim()
      || conversationWorkspaceId;

    if (!targetWorkspaceId) {
      return (
        <div className="chat-module-panel-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前预览缺少工作区上下文" />
        </div>
      );
    }

    return (
      <WorkspaceFilePreviewRouter
        conversationWorkspaceId={conversationWorkspaceId ?? targetWorkspaceId}
        workspaceId={targetWorkspaceId}
        path={props.preview.source.path}
      />
    );
  }

  return (
    <ConversationCodePreviewPanel
      title={props.preview.title}
      code={props.preview.source.code}
      infoString={props.preview.source.infoString}
      uiLanguage={props.preview.source.language}
    />
  );
}