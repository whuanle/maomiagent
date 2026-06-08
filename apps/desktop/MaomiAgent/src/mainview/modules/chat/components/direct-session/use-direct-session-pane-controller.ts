import { useCallback, useMemo } from "react";

import type { ConversationMessageEntry } from "#maomiagent/kernel/src/host/application";

import type { ChatSelectedSessionView } from "../../types";
import type {
  DirectConversationSessionPaneProps,
  DirectSessionPaneController,
  DirectSessionTone,
} from "./types";
import { createDiscardWorkspaceChangesHandler } from "./direct-session-discard-workspace-changes";
import {
  resolveComposerTokenBudgetUsage,
  resolveContextCompressionStatus,
} from "./direct-session-context-budget";
import { readProjectedConversationSessionPreviewWindow } from "./direct-session-session-detail-projection";
import { resolveManagedSessionIndicator } from "../managed-session-status";
import { hasManagedTakeoverChildSession } from "../../hooks/managed-takeover";

function extractPathLeaf(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    return "";
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMessageWorkspaceId(message: ConversationMessageEntry): string | undefined {
  const workspace = isRecord(message.metadata?.workspace)
    ? message.metadata.workspace as Record<string, unknown>
    : undefined;

  return normalizeOptionalText(message.metadata?.executionWorkspaceId)
    ?? normalizeOptionalText(message.metadata?.workspaceId)
    ?? normalizeOptionalText(workspace?.executionWorkspaceId)
    ?? normalizeOptionalText(workspace?.workspaceId);
}

function readRunPreviewWorkspaceId(run: ChatSelectedSessionView["detail"] extends infer Detail
  ? Detail extends { runs: infer Runs }
    ? Runs extends readonly (infer Item)[]
      ? Item
      : never
    : never
  : never,
): string | undefined {
  const runtimeHost = isRecord(run?.metadata?.workspaceRuntime)
    ? run.metadata.workspaceRuntime as Record<string, unknown>
    : undefined;

  return normalizeOptionalText(runtimeHost?.executionWorkspaceId)
    ?? normalizeOptionalText(runtimeHost?.workspaceId);
}

function resolveSessionStatusTone(
  status: ChatSelectedSessionView["status"] | undefined,
): DirectSessionTone {
  if (status === "active") {
    return "running";
  }

  if (status === "failed") {
    return "error";
  }

  if (status === "archived") {
    return "warning";
  }

  return "success";
}

export function useDirectSessionPaneController(
  props: DirectConversationSessionPaneProps,
): DirectSessionPaneController {
  const selectedWorkspaceId = props.selectedWorkspace?.workspaceId?.trim() || "";
  const detail = props.selectedSession?.detail;
  const messagePreviewWorkspaceIdByRunId = useMemo(
    () => new Map(
      (detail?.runs ?? []).flatMap((run) => {
        const workspaceId = readRunPreviewWorkspaceId(run);
        return workspaceId ? [[run.id, workspaceId] as const] : [];
      }),
    ),
    [detail?.runs],
  );
  const resolveThreadMessageWorkspaceId = useCallback((message: ConversationMessageEntry) => {
    const messageRunId = message.runId as Parameters<typeof messagePreviewWorkspaceIdByRunId.get>[0] | undefined;
    return (messageRunId ? messagePreviewWorkspaceIdByRunId.get(messageRunId) : undefined)
      ?? readMessageWorkspaceId(message)
      ?? (selectedWorkspaceId || undefined);
  }, [messagePreviewWorkspaceIdByRunId, selectedWorkspaceId]);
  const discardWorkspaceChanges = useMemo(
    () => createDiscardWorkspaceChangesHandler(selectedWorkspaceId),
    [selectedWorkspaceId],
  );

  return useMemo(() => {
    const isEn = props.language === "en-US";
    const session = props.selectedSession;
    const pendingInteractions = detail?.pendingInteractions ?? [];
    const composerDisabled = !props.selectedWorkspace || !session || session.status === "archived";
    const hasAttachments = props.composerAttachments.length > 0;
    const sendDisabled = composerDisabled
      || props.sendingMessage
      || (!props.draftMessage.trim() && !hasAttachments)
      || (props.modelsBridgeAvailable && props.composerModelOptions.length === 0);
    const sessionTitle = session?.title || session?.sessionId || props.copy.emptySessionTitle;
    const selectedModel = props.composerModelOptions.find((item) => item.value === props.selectedComposerModelValue);
    const tokenBudgetUsage = resolveComposerTokenBudgetUsage({
      detail,
      selectedModel,
      language: props.language,
    });
    const contextCompressionStatus = resolveContextCompressionStatus({
      detail,
      language: props.language,
    });
    const managedIndicator = resolveManagedSessionIndicator(
      session?.status ?? "idle",
      detail?.metadata ?? session?.metadata,
      props.language,
      {
        suppressAwaitingConfirmation: Boolean(session && hasManagedTakeoverChildSession({
          sourceSession: session,
          sessions: props.sessionSummaries,
          metadata: detail?.metadata,
        })),
      },
    );

    return {
      session,
      header: {
        ariaLabel: isEn ? "Session status" : "会话状态",
        title: sessionTitle,
        titleHint: sessionTitle,
        editable: Boolean(session?.sessionId) && props.allowRenameSession !== false,
        savingTitle: props.renamingSessionId === session?.sessionId,
        renamePlaceholder: isEn ? "Conversation title" : "会话标题",
        renameActionLabel: isEn ? "Rename conversation" : "重命名会话",
        onRename: session?.sessionId && props.allowRenameSession !== false
          ? (title) => props.onRenameSession(session.sessionId, title)
          : undefined,
        statusLabel: session
          ? managedIndicator?.label ?? props.copy.statusLabel(session.status)
          : props.copy.statusLabel("idle"),
        statusTone: managedIndicator?.statusTone ?? resolveSessionStatusTone(session?.status),
      },
      thread: {
        sessionId: session?.sessionId,
        paneWorkspaceId: selectedWorkspaceId || undefined,
        hasDetail: Boolean(detail),
        loading: props.loadingSessionDetail,
        detailLoading: props.loadingSessionDetail,
        loadingLabel: isEn ? "Loading conversation" : "正在加载对话",
        messages: detail?.messages ?? [],
        checkpoints: detail?.checkpoints ?? [],
        previewWindow: detail ? readProjectedConversationSessionPreviewWindow(detail) : undefined,
        latestMessageId: detail?.messages[detail.messages.length - 1]?.messageId,
        sending: props.sendingMessage,
        language: props.language,
        workspaceAvatarSettings: props.workspaceAvatarSettings,
        onOpenCodePreview: props.onOpenCodePreview,
        onOpenWorkspaceFilePreview: props.onOpenWorkspaceFilePreview,
        resolveMessageWorkspaceId: resolveThreadMessageWorkspaceId,
        onDiscardWorkspaceChanges: discardWorkspaceChanges,
        onLoadFullSessionDetail: props.onLoadFullSessionDetail,
        onCollapseFullSessionDetail: props.onCollapseFullSessionDetail,
      },
      interactionDock: {
        language: props.language,
        workspaceId: selectedWorkspaceId || undefined,
        title: isEn ? "Pending interactions" : "待处理交互",
        interactions: pendingInteractions,
        replyingInteractionId: props.replyingInteractionId,
        onAnswerInteraction: props.onAnswerInteraction,
        onApproveInteraction: props.onApproveInteraction,
        onRejectInteraction: props.onRejectInteraction,
      },
      composer: {
        language: props.language,
        disabled: composerDisabled,
        sending: props.sendingMessage,
        stopping: props.stoppingMessage,
        sendDisabled,
        draft: props.draftMessage,
        placeholder: props.copy.composerPlaceholder,
        attachLabel: isEn ? "Attach files" : "添加附件",
        modelPlaceholder: props.copy.composerModelPlaceholder,
        agentPlaceholder: props.copy.composerAgentPlaceholder,
        sendLabel: props.copy.sendLabel,
        selectedModelValue: props.selectedComposerModelValue,
        selectedAgentId: props.selectedComposerAgentId,
        composerMode: props.composerMode,
        showAttachmentButton: props.composerPresentation?.showAttachmentButton,
        showModeSwitch: props.composerPresentation?.showModeSwitch,
        showModelSelect: props.composerPresentation?.showModelSelect,
        showAgentSelect: props.composerPresentation?.showAgentSelect,
        disableAgentSelect: props.composerPresentation?.disableAgentSelect,
        tokenBudgetUsage,
        contextCompressionStatus,
        modelOptions: props.composerModelOptions,
        modelSelectOptions: props.composerModelSelectOptions,
        agentOptions: props.composerAgentOptions,
        slashCommands: props.slashCommands,
        attachments: props.composerAttachments,
        onDraftChange: props.onDraftMessageChange,
        onAttachFiles: props.onComposerAttachFiles,
        onRemoveAttachment: props.onComposerRemoveAttachment,
        onModelChange: props.onComposerModelChange,
        onAgentChange: props.onComposerAgentChange,
        onModeChange: props.onComposerModeChange,
        onSubmit: props.onSendMessage,
        onStop: props.onStopMessage,
      },
    };
  }, [discardWorkspaceChanges, props]);
}

export default useDirectSessionPaneController;
