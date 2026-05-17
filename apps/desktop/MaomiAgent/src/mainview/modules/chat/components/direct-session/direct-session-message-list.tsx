import { memo, useEffect, useMemo, useRef } from "react";

import type { ConversationMessageEntry } from "#maomiagent/kernel/src/host/application";

import { DirectSessionMessage } from "./direct-session-message";
import {
  groupDirectSessionMessagesForDisplay,
  type DirectSessionDisplayMessageGroup,
} from "./direct-session-message-list-grouping";
import { buildDirectSessionRenderItems } from "./direct-session-message-list-items";
import type { DirectSessionThreadViewModel } from "./types";

type Props = DirectSessionThreadViewModel;

function buildOptimisticAssistantGroup(
  messages: readonly ConversationMessageEntry[],
  latestMessageId?: string,
): DirectSessionDisplayMessageGroup {
  const lastMessage = messages[messages.length - 1];
  const messageId = `assistant-pending:${latestMessageId ?? lastMessage?.messageId ?? "draft"}`;
  const createdAt = (lastMessage?.createdAt ?? 0) + 1;
  const sessionId = lastMessage?.sessionId ?? "pending-session";

  const placeholderMessage: ConversationMessageEntry = {
    messageId,
    sessionId,
    runId: lastMessage?.runId,
    turnId: lastMessage?.turnId,
    role: "assistant",
    createdAt,
    parts: [],
  };

  return {
    key: messageId,
    message: placeholderMessage,
    previewSourceMessage: placeholderMessage,
    containsLatestMessage: true,
    streamingPartIds: [],
    messageIds: [messageId],
  };
}

function DirectSessionMessageListInner(props: Props) {
  const isEn = props.language === "en-US";
  const previousDisplayGroupsRef = useRef<DirectSessionDisplayMessageGroup[]>([]);
  const displayGroups = useMemo(() => groupDirectSessionMessagesForDisplay(props.messages, props.latestMessageId, {
    preserveBoundaryMessageIds: props.checkpoints.map((checkpoint) => checkpoint.summaryMessageId),
    previousGroups: previousDisplayGroupsRef.current,
  }), [props.checkpoints, props.latestMessageId, props.messages]);

  useEffect(() => {
    previousDisplayGroupsRef.current = displayGroups;
  }, [displayGroups]);

  const groupsToRender = useMemo(() => {
    const lastDisplayGroup = displayGroups[displayGroups.length - 1];
    const shouldShowOptimisticAssistant = props.sending
      && (!lastDisplayGroup || lastDisplayGroup.message.role !== "assistant");

    return shouldShowOptimisticAssistant
      ? [...displayGroups, buildOptimisticAssistantGroup(props.messages, props.latestMessageId)]
      : displayGroups;
  }, [displayGroups, props.latestMessageId, props.messages, props.sending]);
  const renderItems = useMemo(() => buildDirectSessionRenderItems({
    groups: groupsToRender,
    checkpoints: props.checkpoints,
    language: props.language,
  }), [groupsToRender, props.checkpoints, props.language]);

  if (renderItems.length > 0) {
    const optimisticAssistantKey = props.sending && groupsToRender.length > displayGroups.length
      ? groupsToRender[groupsToRender.length - 1]?.key
      : undefined;
    const previewWindowCard = props.previewWindow ? (
      <div
        className="chat-direct-checkpoint-card chat-direct-preview-window-card"
        title={isEn ? "Earlier activity is folded until expanded." : "较早步骤已折叠，展开后可查看完整过程。"}
      >
        <div className="chat-direct-preview-window-main">
          <div className="chat-direct-checkpoint-label">
            {isEn ? "Earlier steps hidden" : "较早步骤已收起"}
          </div>
          <div className="chat-direct-checkpoint-detail">
            {isEn
              ? `${props.previewWindow.hiddenMessageCount} earlier message${props.previewWindow.hiddenMessageCount === 1 ? "" : "s"} hidden`
              : `已收起 ${props.previewWindow.hiddenMessageCount} 条较早消息`}
          </div>
        </div>
        {props.sessionId && props.onLoadFullSessionDetail ? (
          <button
            type="button"
            className="chat-direct-preview-window-action"
            onClick={() => {
              void props.onLoadFullSessionDetail?.(props.sessionId);
            }}
            disabled={props.detailLoading}
          >
            {isEn ? "Show full history" : "展开全部"}
          </button>
        ) : null}
      </div>
    ) : null;

    return (
      <>
        <div className="chat-direct-thread">
          {previewWindowCard}
          {renderItems.map((item) => item.kind === "message"
            ? (
              <DirectSessionMessage
                key={item.key}
                message={item.group.message}
                paneWorkspaceId={props.paneWorkspaceId}
                previewWorkspaceId={props.resolveMessageWorkspaceId?.(item.group.previewSourceMessage)}
                language={props.language}
                isStreaming={props.sending && (optimisticAssistantKey
                  ? item.group.key === optimisticAssistantKey
                  : item.group.containsLatestMessage && item.group.message.role === "assistant")}
                streamingPartIds={item.group.streamingPartIds.length > 0 ? item.group.streamingPartIds : undefined}
                detailLoading={props.loading}
                onOpenCodePreview={props.onOpenCodePreview}
                onOpenWorkspaceFilePreview={props.onOpenWorkspaceFilePreview}
                onDiscardWorkspaceChanges={props.onDiscardWorkspaceChanges}
                onLoadFullSessionDetail={props.onLoadFullSessionDetail}
                onCollapseFullSessionDetail={props.onCollapseFullSessionDetail}
              />
            )
            : (
              <div
                key={item.key}
                className="chat-direct-checkpoint-card"
                title={item.title}
              >
                <div className="chat-direct-checkpoint-label">{item.label}</div>
                {item.detail ? (
                  <div className="chat-direct-checkpoint-detail">{item.detail}</div>
                ) : null}
              </div>
            ))}
        </div>
        <div className="chat-direct-thread-anchor" aria-hidden="true" />
      </>
    );
  }

  if (props.loading && !props.hasDetail) {
    return (
      <div className="chat-direct-empty-state is-loading">
        <div className="chat-direct-empty-eyebrow">{props.loadingLabel}</div>
      </div>
    );
  }

  return <div className="chat-direct-empty-state" aria-hidden="true" />;
}

export const DirectSessionMessageList = memo(DirectSessionMessageListInner);
DirectSessionMessageList.displayName = "DirectSessionMessageList";

export default DirectSessionMessageList;
