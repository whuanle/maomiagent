import { Empty } from "antd";

import { ConversationCodePreviewPanel } from "../code-preview/conversation-code-preview-panel";
import { FeishuDocPreviewRouter } from "./renderers/feishu-doc/feishu-doc-preview-router";
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

  if (props.preview.source.kind === "feishu-doc") {
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
      <FeishuDocPreviewRouter
        conversationWorkspaceId={conversationWorkspaceId ?? targetWorkspaceId}
        workspaceId={targetWorkspaceId}
        docId={props.preview.source.docId}
        title={props.preview.title}
        path={props.preview.source.path}
        fallbackPath={props.preview.source.fallbackPath}
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
