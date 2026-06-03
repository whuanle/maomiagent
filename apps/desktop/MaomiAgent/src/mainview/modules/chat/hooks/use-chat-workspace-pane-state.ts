import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type {
  DesktopConversationAttachmentInput,
  DesktopConversationAttachmentKind,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetail,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationSessionItem,
} from "../../../../shared/desktop-conversation";
import { DEFAULT_DESKTOP_PRIMARY_AGENT_ID } from "../../../../shared/conversation/managed-execution";
import { resolveDesktopConversationExecutionStrategy } from "../../../../shared/conversation/managed-execution";
import { listDesktopAgents } from "../../../lib/desktop-agents";
import {
  answerDesktopConversationInteraction,
  DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT,
  DESKTOP_CONVERSATION_INVALIDATED_EVENT,
  DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
  createDesktopConversationSession,
  getDesktopConversationSessionDetail,
  hideDesktopConversationSession,
  listDesktopConversationSessions,
  renameDesktopConversationSession,
  rejectDesktopConversationInteraction,
  sendDesktopConversationMessage,
  stopDesktopConversationMessage,
} from "../../../lib/desktop-conversation";
import {
  DESKTOP_MODELS_INVALIDATED_EVENT,
  getDesktopModelRuntimeSelectionSnapshot,
} from "../../../lib/desktop-models";
import {
  buildDesktopRuntimeModelOptionGroups,
  buildDesktopRuntimeModelOptions,
  resolveDesktopRuntimeSelectedValue,
} from "../../models/services/runtime-selection";
import {
  MANAGED_TAKEOVER_KICKOFF_TEXT,
  resolveManagedTakeoverLaunchPlan,
} from "./managed-takeover";
import {
  resolveNextSessionId,
  resolvePreferredSessionIdForRuntimeReload,
} from "./session-selection";
import {
  projectConversationSessionDetail,
  resolveSessionDetailProjectionMode,
} from "../components/direct-session/direct-session-session-detail-projection";
import {
  useConversationWorkspaceSettings,
  waitForConversationWorkspaceSettingsSaves,
} from "../components/conversation-workspace-settings-storage";
import {
  mergeDesktopConversationRuntimeEvents,
  shouldDeferRuntimeEventsWhileStopping,
} from "./desktop-conversation-runtime-events";
import type {
  ChatActionErrorType,
  ChatComposerAttachment,
  ChatComposerAgentOption,
  ChatComposerModelOption,
  ChatComposerSelectOptionGroup,
  ChatSessionFilter,
} from "../types";

type ChatComposerMode = "agent" | "plan";

type UseChatWorkspacePaneStateInput = {
  active: boolean;
  workspaceId: string;
  bridgeAvailable: boolean;
  modelsBridgeAvailable: boolean;
  agentsBridgeAvailable: boolean;
  onError: (action: ChatActionErrorType, error: unknown) => void;
};

function compareSessions(left: DesktopConversationSessionItem, right: DesktopConversationSessionItem) {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || left.sessionId.localeCompare(right.sessionId, "en", { sensitivity: "base" });
}

function filterVisibleSessions(
  items: DesktopConversationSessionItem[],
  statusFilter: ChatSessionFilter,
) {
  if (statusFilter !== "all") {
    return items;
  }

  // Hidden sessions are archived on the backend; keep them out of the default rail view.
  return items.filter((item) => item.status !== "archived");
}

function resolveSessionUpdatedAt(detail: DesktopConversationSessionDetail) {
  const latestRun = detail.runs.at(-1);
  return latestRun ? new Date(latestRun.updatedAt).toISOString() : detail.updatedAt;
}

function buildSessionItemFromDetail(
  detail: DesktopConversationSessionDetail,
  current?: DesktopConversationSessionItem,
): DesktopConversationSessionItem {
  return {
    sessionId: detail.sessionId,
    workspaceId: detail.workspaceId,
    title: detail.title,
    status: detail.status,
    parentSessionId: detail.parentSessionId,
    archivedAt: detail.archivedAt,
    lastRunId: detail.runs.at(-1)?.id ?? current?.lastRunId ?? detail.lastRunId,
    createdAt: detail.createdAt,
    updatedAt: resolveSessionUpdatedAt(detail),
    metadata: detail.metadata ? { ...detail.metadata } : undefined,
  };
}

function mergeSessionSummary(
  items: DesktopConversationSessionItem[],
  detail: DesktopConversationSessionDetail,
) {
  const index = items.findIndex((item) => item.sessionId === detail.sessionId);
  if (index < 0) {
    return items;
  }

  const nextItems = [...items];
  nextItems[index] = buildSessionItemFromDetail(detail, nextItems[index]);
  nextItems.sort(compareSessions);
  return nextItems;
}

function buildComposerAttachmentInputs(attachments: ChatComposerAttachment[]): DesktopConversationAttachmentInput[] {
  return attachments.map((attachment) => ({
    attachmentId: attachment.id,
    kind: attachment.kind,
    fileName: attachment.name,
    dataBase64: attachment.dataBase64,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(typeof attachment.sizeBytes === "number" ? { sizeBytes: attachment.sizeBytes } : {}),
  }));
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readComposerModeMetadata(metadata: Record<string, unknown> | undefined): ChatComposerMode | undefined {
  const value = metadata?.composerMode;
  return value === "agent" || value === "plan" ? value : undefined;
}

function resolveNextComposerAgentId(
  options: ChatComposerAgentOption[],
  currentValue: string | undefined,
) {
  if (currentValue && options.some((item) => item.value === currentValue)) {
    return currentValue;
  }

  if (options.some((item) => item.value === DEFAULT_DESKTOP_PRIMARY_AGENT_ID)) {
    return DEFAULT_DESKTOP_PRIMARY_AGENT_ID;
  }

  return options[0]?.value;
}

const SESSION_DETAIL_SEND_POLL_INTERVAL_MS = 180;
const SESSION_DETAIL_FALLBACK_GRACE_MS = 450;
const SESSION_DETAIL_FALLBACK_SILENCE_WINDOW_MS = 600;

function delay(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function resolveNextComposerModelValue(
  options: ChatComposerModelOption[],
  currentValue: string | undefined,
  preferredValue?: string,
  fallbackValue?: string,
) {
  if (currentValue && options.some((item) => item.value === currentValue)) {
    return currentValue;
  }

  if (preferredValue && options.some((item) => item.value === preferredValue)) {
    return preferredValue;
  }

  if (fallbackValue && options.some((item) => item.value === fallbackValue)) {
    return fallbackValue;
  }

  return options[0]?.value;
}

const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

function resolveComposerAttachmentExtension(name: string) {
  const normalizedName = name.trim().toLowerCase();
  const extension = normalizedName.match(/\.([^.]+)$/)?.[1] ?? "";
  return extension;
}

function resolveComposerAttachmentName(file: File) {
  const normalizedName = file.name.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType.startsWith("image/")) {
    const subtype = normalizedType.slice("image/".length).split(/[+;]/, 1)[0] || "png";
    return `image.${subtype}`;
  }

  if (normalizedType) {
    const subtype = normalizedType.split("/", 2)[1]?.split(/[+;]/, 1)[0] ?? "bin";
    return `attachment.${subtype}`;
  }

  return "attachment";
}

function buildComposerAttachmentId(file: File, resolvedName: string) {
  return `${resolvedName}:${file.size}:${file.lastModified}`;
}

function canPreviewComposerAttachment(file: File, resolvedName: string) {
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType.startsWith("image/")) {
    return true;
  }

  return IMAGE_ATTACHMENT_EXTENSIONS.has(resolveComposerAttachmentExtension(resolvedName));
}

function createComposerAttachmentPreviewUrl(file: File, resolvedName: string) {
  if (!canPreviewComposerAttachment(file, resolvedName)) {
    return undefined;
  }

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return undefined;
  }

  try {
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
}

function resolveComposerAttachmentKind(
  file: Pick<File, "type">,
  resolvedName: string,
): DesktopConversationAttachmentKind {
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType.startsWith("image/")) {
    return "image";
  }

  if (normalizedType.startsWith("audio/")) {
    return "audio";
  }

  if (normalizedType.startsWith("video/")) {
    return "video";
  }

  return IMAGE_ATTACHMENT_EXTENSIONS.has(resolveComposerAttachmentExtension(resolvedName))
    ? "image"
    : "file";
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable in the current runtime."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error(`Failed to read attachment: ${file.name || "attachment"}`));
    };
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Unexpected attachment payload for ${file.name || "attachment"}`));
        return;
      }

      const separatorIndex = reader.result.indexOf(",");
      resolve(separatorIndex >= 0 ? reader.result.slice(separatorIndex + 1) : reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function revokeComposerAttachmentPreviewUrl(attachment: Pick<ChatComposerAttachment, "previewUrl"> | undefined) {
  const previewUrl = attachment?.previewUrl?.trim();
  if (!previewUrl || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
    return;
  }

  URL.revokeObjectURL(previewUrl);
}

async function normalizeComposerAttachment(file: File): Promise<ChatComposerAttachment> {
  const resolvedName = resolveComposerAttachmentName(file);
  const previewUrl = createComposerAttachmentPreviewUrl(file, resolvedName);
  try {
    const dataBase64 = await readFileAsBase64(file);
    return {
      id: buildComposerAttachmentId(file, resolvedName),
      kind: resolveComposerAttachmentKind(file, resolvedName),
      name: resolvedName,
      dataBase64,
      ...(typeof file.size === "number" && Number.isFinite(file.size) ? { sizeBytes: Math.max(0, file.size) } : {}),
      ...(file.type ? { mimeType: file.type } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    };
  } catch (error) {
    if (previewUrl) {
      revokeComposerAttachmentPreviewUrl({ previewUrl });
    }
    throw error;
  }
}

export function useChatWorkspacePaneState(input: UseChatWorkspacePaneStateInput) {
  const {
    active,
    workspaceId,
    bridgeAvailable,
    modelsBridgeAvailable,
    agentsBridgeAvailable,
    onError,
  } = input;
  const { settings: workspaceSettings, saveSettings: saveWorkspaceSettings } = useConversationWorkspaceSettings(
    workspaceId,
  );
  const [sessions, setSessions] = useState<DesktopConversationSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [sessionDetailsById, setSessionDetailsById] = useState<Record<string, DesktopConversationSessionDetail>>({});
  const [expandedSessionDetailSessionId, setExpandedSessionDetailSessionId] = useState<string>();
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [archivingSessionId, setArchivingSessionId] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(null);
  const [replyingInteractionId, setReplyingInteractionId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChatSessionFilter>("all");
  const [draftMessage, setDraftMessage] = useState("");
  const [composerMode, setComposerMode] = useState<ChatComposerMode>("agent");
  const [composerAttachments, setComposerAttachments] = useState<ChatComposerAttachment[]>([]);
  const composerAttachmentsRef = useRef<ChatComposerAttachment[]>([]);
  const [composerModelOptions, setComposerModelOptions] = useState<ChatComposerModelOption[]>([]);
  const [composerModelSelectOptions, setComposerModelSelectOptions] = useState<ChatComposerSelectOptionGroup[]>([]);
  const [selectedComposerModelValue, setSelectedComposerModelValueState] = useState<string>();
  const [composerAgentOptions, setComposerAgentOptions] = useState<ChatComposerAgentOption[]>([]);
  const [selectedComposerAgentId, setSelectedComposerAgentId] = useState<string>();
  const deferredSearchText = useDeferredValue(searchText);
  const runtimeEventActivityBySessionIdRef = useRef<Record<string, number>>({});
  const managedTakeoverAttemptKeysRef = useRef<Record<string, true>>({});
  const sessionDetailsByIdRef = useRef<Record<string, DesktopConversationSessionDetail>>({});
  const stoppingSessionIdRef = useRef<string | null>(null);
  const selectedSessionIdRef = useRef<string | undefined>(undefined);
  const expandedSessionDetailSessionIdRef = useRef<string | undefined>(undefined);

  const selectedSession = useMemo(
    () => sessions.find((item) => item.sessionId === selectedSessionId),
    [selectedSessionId, sessions],
  );
  const selectedSessionDetail = selectedSessionId ? sessionDetailsById[selectedSessionId] : undefined;
  const stoppingMessage = Boolean(selectedSessionId && stoppingSessionId === selectedSessionId);
  const selectedSessionComposerMode = readComposerModeMetadata(selectedSessionDetail?.metadata);
  const selectedSessionSummaryChannelId = normalizeOptionalText(selectedSession?.metadata?.selectedChannelId);
  const selectedSessionSummaryModelId = normalizeOptionalText(selectedSession?.metadata?.selectedModelId);
  const selectedSessionDetailChannelId = normalizeOptionalText(selectedSessionDetail?.metadata?.selectedChannelId);
  const selectedSessionDetailModelId = normalizeOptionalText(selectedSessionDetail?.metadata?.selectedModelId);

  useEffect(() => {
    stoppingSessionIdRef.current = stoppingSessionId;
  }, [stoppingSessionId]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    expandedSessionDetailSessionIdRef.current = expandedSessionDetailSessionId;
  }, [expandedSessionDetailSessionId]);

  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  const updateSessionDetailsById = useCallback((
    updater: Parameters<typeof setSessionDetailsById>[0],
  ) => {
    if (typeof updater === "function") {
      const compute = updater as (current: Record<string, DesktopConversationSessionDetail>) => Record<string, DesktopConversationSessionDetail>;
      sessionDetailsByIdRef.current = compute(sessionDetailsByIdRef.current);
      setSessionDetailsById((current) => {
        const next = compute(current);
        sessionDetailsByIdRef.current = next;
        return next;
      });
      return;
    }

    sessionDetailsByIdRef.current = updater;
    setSessionDetailsById(updater);
  }, []);

  useEffect(() => () => {
    composerAttachmentsRef.current.forEach((attachment) => revokeComposerAttachmentPreviewUrl(attachment));
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setComposerMode("agent");
      return;
    }

    setComposerMode(selectedSessionComposerMode ?? "agent");
  }, [selectedSessionComposerMode, selectedSessionId]);

  useEffect(() => {
    if (
      expandedSessionDetailSessionIdRef.current
      && expandedSessionDetailSessionIdRef.current !== selectedSessionId
    ) {
      expandedSessionDetailSessionIdRef.current = undefined;
      setExpandedSessionDetailSessionId(undefined);
    }

    updateSessionDetailsById((current) => {
      let changed = false;
      const nextDetails: Record<string, DesktopConversationSessionDetail> = {};

      for (const [sessionId, detail] of Object.entries(current)) {
        const projectionMode = resolveSessionDetailProjectionMode({
          detailSessionId: sessionId,
          selectedSessionId,
          expandedSessionDetailSessionId: expandedSessionDetailSessionIdRef.current,
        });
        const projectedDetail = projectConversationSessionDetail(detail, projectionMode);
        nextDetails[sessionId] = projectedDetail;
        if (projectedDetail !== detail) {
          changed = true;
        }
      }

      return changed ? nextDetails : current;
    });
  }, [selectedSessionId, updateSessionDetailsById]);

  const clearExpandedSessionDetailState = useCallback(() => {
    expandedSessionDetailSessionIdRef.current = undefined;
    setExpandedSessionDetailSessionId(undefined);
  }, []);

  const clearComposerAttachments = useCallback(() => {
    setComposerAttachments((current) => {
      current.forEach((attachment) => revokeComposerAttachmentPreviewUrl(attachment));
      return [];
    });
  }, []);

  const applySessionDetail = useCallback((
    detail: DesktopConversationSessionDetail,
    options?: {
      clearSendingForSessionId?: string;
      clearStoppingForSessionId?: string;
    },
  ) => {
    const projectionMode = resolveSessionDetailProjectionMode({
      detailSessionId: detail.sessionId,
      selectedSessionId: selectedSessionIdRef.current,
      expandedSessionDetailSessionId: expandedSessionDetailSessionIdRef.current,
    });
    const projectedDetail = projectConversationSessionDetail(detail, projectionMode);

    setSessions((current) => mergeSessionSummary(current, projectedDetail));
    updateSessionDetailsById((current) => current[detail.sessionId] === projectedDetail
      ? current
      : {
          ...current,
          [detail.sessionId]: projectedDetail,
        });

    if (
      options?.clearSendingForSessionId
      && detail.sessionId === options.clearSendingForSessionId
      && detail.status !== "active"
    ) {
      setSendingMessage(false);
    }

    if (
      options?.clearStoppingForSessionId
      && detail.sessionId === options.clearStoppingForSessionId
      && detail.status !== "active"
    ) {
      setStoppingSessionId((current) => current === options.clearStoppingForSessionId ? null : current);
    }
  }, [updateSessionDetailsById]);

  const startSessionDetailFallbackPolling = useCallback((
    sessionId: string,
    applyDetail: (detail: DesktopConversationSessionDetail) => void,
  ) => {
    if (!sessionId) {
      return () => undefined;
    }

    let stopped = false;

    void (async () => {
      const startedAt = Date.now();

      while (!stopped) {
        const now = Date.now();
        const lastRuntimeEventAt = runtimeEventActivityBySessionIdRef.current[sessionId] ?? 0;
        const withinGracePeriod = now - startedAt < SESSION_DETAIL_FALLBACK_GRACE_MS;
        const recentRuntimeActivity = lastRuntimeEventAt > 0
          && now - lastRuntimeEventAt < SESSION_DETAIL_FALLBACK_SILENCE_WINDOW_MS;
        const stopRequested = stoppingSessionIdRef.current === sessionId;
        if (withinGracePeriod || recentRuntimeActivity || stopRequested) {
          await delay(SESSION_DETAIL_SEND_POLL_INTERVAL_MS);
          continue;
        }

        try {
          const detail = await getDesktopConversationSessionDetail(sessionId);
          if (detail) {
            applyDetail(detail);
            if (detail.status !== "active") {
              break;
            }
          }
        } catch {
          // Ignore transient polling failures and let the mutation response decide.
        }

        if (stopped) {
          break;
        }

        await delay(SESSION_DETAIL_SEND_POLL_INTERVAL_MS);
      }
    })();

    return () => {
      stopped = true;
    };
  }, []);

  const reloadSessionDetail = useCallback(async (sessionId = selectedSessionId) => {
    if (!bridgeAvailable || !sessionId) {
      return null;
    }

    setLoadingSessionDetail(true);
    try {
      const detail = await getDesktopConversationSessionDetail(sessionId);
      if (detail) {
        applySessionDetail(detail);
      }
      return detail ?? null;
    } catch (error) {
      onError("loadSessionDetail", error);
      return null;
    } finally {
      setLoadingSessionDetail(false);
    }
  }, [applySessionDetail, bridgeAvailable, onError, selectedSessionId]);

  const loadFullSessionDetail = useCallback(async (sessionId = selectedSessionId) => {
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedSessionId) {
      return;
    }

    if (
      expandedSessionDetailSessionIdRef.current === normalizedSessionId
      && !loadingSessionDetail
    ) {
      return;
    }

    expandedSessionDetailSessionIdRef.current = normalizedSessionId;
    setExpandedSessionDetailSessionId(normalizedSessionId);
    await reloadSessionDetail(normalizedSessionId);
  }, [loadingSessionDetail, reloadSessionDetail, selectedSessionId]);

  const collapseFullSessionDetail = useCallback((sessionId = selectedSessionId) => {
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedSessionId) {
      return;
    }

    if (expandedSessionDetailSessionIdRef.current !== normalizedSessionId) {
      return;
    }

    clearExpandedSessionDetailState();

    updateSessionDetailsById((current) => {
      const detail = current[normalizedSessionId];
      if (!detail) {
        return current;
      }

      const projectedDetail = projectConversationSessionDetail(detail, resolveSessionDetailProjectionMode({
        detailSessionId: normalizedSessionId,
        selectedSessionId: selectedSessionIdRef.current,
        expandedSessionDetailSessionId: undefined,
      }));

      if (projectedDetail === detail) {
        return current;
      }

      return {
        ...current,
        [normalizedSessionId]: projectedDetail,
      };
    });
  }, [clearExpandedSessionDetailState, selectedSessionId, updateSessionDetailsById]);

  const reloadComposerModels = useCallback(async (detail?: DesktopConversationSessionDetail) => {
    if (!modelsBridgeAvailable) {
      setComposerModelOptions([]);
      setComposerModelSelectOptions([]);
      setSelectedComposerModelValueState(undefined);
      return;
    }

    try {
      const resolvedDetailChannelId = selectedSessionId && detail?.sessionId === selectedSessionId
        ? normalizeOptionalText(detail.metadata?.selectedChannelId)
        : undefined;
      const resolvedDetailModelId = selectedSessionId && detail?.sessionId === selectedSessionId
        ? normalizeOptionalText(detail.metadata?.selectedModelId)
        : undefined;
      const storedSelectedChannelId = normalizeOptionalText(workspaceSettings.selectedChannelId);
      const storedSelectedModelId = normalizeOptionalText(workspaceSettings.selectedModelId);
      const selectedChannelId = resolvedDetailChannelId
        ?? selectedSessionDetailChannelId
        ?? selectedSessionSummaryChannelId
        ?? (storedSelectedChannelId && storedSelectedModelId ? storedSelectedChannelId : undefined);
      const selectedModelId = resolvedDetailModelId
        ?? selectedSessionDetailModelId
        ?? selectedSessionSummaryModelId
        ?? (storedSelectedChannelId && storedSelectedModelId ? storedSelectedModelId : undefined);
      let response;
      try {
        response = await getDesktopModelRuntimeSelectionSnapshot({
          workspaceId,
          selectedChannelId,
          selectedModelId,
        });
      } catch (error) {
        if (!selectedChannelId && !selectedModelId) {
          throw error;
        }

        response = await getDesktopModelRuntimeSelectionSnapshot({
          workspaceId,
        });
      }
      const runtimeOptions = buildDesktopRuntimeModelOptions({
        snapshot: response.item,
        selectedChannelId,
        selectedModelId,
      });
      const options = runtimeOptions.map((item) => ({
        value: item.value,
        label: item.label,
        channelId: item.channelId,
        modelId: item.modelId,
        providerType: item.providerType,
        contextWindow: item.contextWindow,
        maxOutputTokens: item.maxOutputTokens,
        disabled: item.disabled,
        searchText: item.searchText,
      } satisfies ChatComposerModelOption));
      const selectOptions = buildDesktopRuntimeModelOptionGroups(runtimeOptions);
      const resolvedValue = resolveDesktopRuntimeSelectedValue({
        snapshot: response.item,
        selectedChannelId: response.item.resolvedSelection.channelId,
        selectedModelId: response.item.resolvedSelection.modelId,
      });
      const defaultValue = resolveDesktopRuntimeSelectedValue({
        snapshot: response.item,
        selectedChannelId: response.item.defaultSelection.channelId,
        selectedModelId: response.item.defaultSelection.modelId,
      });

      setComposerModelOptions(options);
      setComposerModelSelectOptions(selectOptions);
      setSelectedComposerModelValueState((currentValue) => resolveNextComposerModelValue(
        options,
        currentValue,
        resolvedValue,
        defaultValue,
      ));
    } catch {
      setComposerModelOptions([]);
      setComposerModelSelectOptions([]);
      setSelectedComposerModelValueState(undefined);
    }
  }, [
    modelsBridgeAvailable,
    selectedSessionId,
    selectedSessionDetailChannelId,
    selectedSessionDetailModelId,
    selectedSessionSummaryChannelId,
    selectedSessionSummaryModelId,
    workspaceSettings.selectedChannelId,
    workspaceSettings.selectedModelId,
    workspaceId,
  ]);

  const reloadComposerAgents = useCallback(async (_detail?: DesktopConversationSessionDetail) => {
    if (!agentsBridgeAvailable) {
      setComposerAgentOptions([]);
      setSelectedComposerAgentId(undefined);
      return;
    }

    try {
      const response = await listDesktopAgents({
        enabled: true,
        includeRuntimeAgents: true,
      });
      const options = response.items
        .filter((item) => !item.hidden && item.mode !== "subagent")
        .map((item) => ({
          value: item.agentId,
          label: item.name,
          description: item.description,
        } satisfies ChatComposerAgentOption));

      setComposerAgentOptions(options);
      setSelectedComposerAgentId((currentValue) => resolveNextComposerAgentId(
        options,
        currentValue,
      ));
    } catch {
      setComposerAgentOptions([]);
      setSelectedComposerAgentId(undefined);
    }
  }, [agentsBridgeAvailable]);

  const reloadSessions = useCallback(async (preferredSessionId?: string) => {
    if (!bridgeAvailable) {
      setSessions([]);
      setSelectedSessionId(undefined);
      return;
    }

    setLoadingSessions(true);
    try {
      const response = await listDesktopConversationSessions({
        workspaceId,
        q: deferredSearchText.trim() || undefined,
        status: statusFilter,
        limit: 100,
        offset: 0,
      });
      const visibleItems = filterVisibleSessions(response.items, statusFilter);
      setSessions(visibleItems);
      setSelectedSessionId((currentSessionId) => resolveNextSessionId(
        visibleItems,
        currentSessionId,
        preferredSessionId,
      ));
    } catch (error) {
      onError("loadSessions", error);
    } finally {
      setLoadingSessions(false);
    }
  }, [bridgeAvailable, deferredSearchText, onError, statusFilter, workspaceId]);

  useEffect(() => {
    if (bridgeAvailable) {
      return;
    }

    setSessions([]);
    setSelectedSessionId(undefined);
    updateSessionDetailsById({});
    clearExpandedSessionDetailState();
    setDraftMessage("");
    clearComposerAttachments();
  }, [bridgeAvailable, clearComposerAttachments, clearExpandedSessionDetailState, updateSessionDetailsById]);

  useEffect(() => {
    if (modelsBridgeAvailable) {
      return;
    }

    setComposerModelOptions([]);
    setComposerModelSelectOptions([]);
    setSelectedComposerModelValueState(undefined);
  }, [modelsBridgeAvailable]);

  const setSelectedComposerModelValue = useCallback((value: string | undefined) => {
    const restorePersistedWorkspaceSelection = () => {
      const persistedValue = composerModelOptions.find((item) =>
        item.channelId === workspaceSettings.selectedChannelId
        && item.modelId === workspaceSettings.selectedModelId)
        ?.value;
      setSelectedComposerModelValueState((current) => current === persistedValue ? current : persistedValue);
    };

    setSelectedComposerModelValueState((current) => current === value ? current : value);

    const selectedModel = composerModelOptions.find((item) => item.value === value);
    if (!selectedModel) {
      if (workspaceSettings.selectedChannelId || workspaceSettings.selectedModelId) {
        void saveWorkspaceSettings({
          selectedChannelId: undefined,
          selectedModelId: undefined,
        }, {
          syncExistingSessions: false,
        }).catch((error) => {
          restorePersistedWorkspaceSelection();
          onError("saveWorkspaceSettings", error);
        });
      }
      return;
    }

    if (
      workspaceSettings.selectedChannelId === selectedModel.channelId
      && workspaceSettings.selectedModelId === selectedModel.modelId
    ) {
      return;
    }

    void saveWorkspaceSettings({
      selectedChannelId: selectedModel.channelId,
      selectedModelId: selectedModel.modelId,
    }, {
      syncExistingSessions: false,
    }).catch((error) => {
      restorePersistedWorkspaceSelection();
      onError("saveWorkspaceSettings", error);
    });
  }, [
    composerModelOptions,
    onError,
    saveWorkspaceSettings,
    workspaceSettings.selectedChannelId,
    workspaceSettings.selectedModelId,
  ]);

  useEffect(() => {
    if (agentsBridgeAvailable) {
      return;
    }

    setComposerAgentOptions([]);
    setSelectedComposerAgentId(undefined);
  }, [agentsBridgeAvailable]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    void reloadSessions();
  }, [active, bridgeAvailable, reloadSessions]);

  useEffect(() => {
    if (!active || !bridgeAvailable || !selectedSessionId) {
      return;
    }

    void reloadSessionDetail(selectedSessionId);
  }, [active, bridgeAvailable, reloadSessionDetail, selectedSessionId]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void reloadComposerModels();
  }, [active, reloadComposerModels]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void reloadComposerAgents();
  }, [active, reloadComposerAgents]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    const handleConversationInvalidated = () => {
      clearExpandedSessionDetailState();
      void reloadSessions();
      void reloadSessionDetail();
    };

    window.addEventListener(DESKTOP_CONVERSATION_INVALIDATED_EVENT, handleConversationInvalidated);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_INVALIDATED_EVENT, handleConversationInvalidated);
    };
  }, [active, bridgeAvailable, clearExpandedSessionDetailState, reloadSessionDetail, reloadSessions]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    const handleConversationDetailUpdated = (event: Event) => {
      const detailUpdate = (event as CustomEvent<DesktopConversationSessionDetailUpdateEvent | undefined>).detail;
      if (!detailUpdate) {
        return;
      }

      if (
        detailUpdate.detail.workspaceId !== workspaceId
        && detailUpdate.detail.sessionId !== selectedSessionId
      ) {
        return;
      }

      applySessionDetail(detailUpdate.detail, {
        clearSendingForSessionId: detailUpdate.detail.sessionId === selectedSessionId
          ? detailUpdate.detail.sessionId
          : undefined,
        clearStoppingForSessionId: detailUpdate.detail.sessionId === selectedSessionId
          ? detailUpdate.detail.sessionId
          : undefined,
      });
      setLoadingSessionDetail(false);
      if (detailUpdate.detail.sessionId === selectedSessionId) {
        setSendingMessage(detailUpdate.detail.status === "active");
        if (detailUpdate.detail.status !== "active") {
          setStoppingSessionId((current) => current === detailUpdate.detail.sessionId ? null : current);
        }
      }
    };

    window.addEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    };
  }, [active, applySessionDetail, bridgeAvailable, selectedSessionId, workspaceId]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    const handleConversationRuntimeEventsUpdated = (event: Event) => {
      const runtimeUpdate = (event as CustomEvent<DesktopConversationRuntimeEventsUpdateEvent | undefined>).detail;
      if (!runtimeUpdate) {
        return;
      }

      runtimeEventActivityBySessionIdRef.current[runtimeUpdate.sessionId] = Date.now();

      const matchesWorkspace = runtimeUpdate.workspaceId === workspaceId;
      const matchesSelectedSession = runtimeUpdate.sessionId === selectedSessionId;
      if (!matchesWorkspace && !matchesSelectedSession) {
        return;
      }

      if (shouldDeferRuntimeEventsWhileStopping({
        update: runtimeUpdate,
        stoppingSessionId: stoppingSessionIdRef.current,
      })) {
        return;
      }

      if (matchesSelectedSession) {
        const currentDetail = sessionDetailsByIdRef.current[runtimeUpdate.sessionId];
        if (currentDetail) {
          const merged = mergeDesktopConversationRuntimeEvents(currentDetail, runtimeUpdate.events);
          if (!merged.requiresReload) {
            setLoadingSessionDetail(false);
            applySessionDetail(merged.detail, {
              clearSendingForSessionId: runtimeUpdate.sessionId,
              clearStoppingForSessionId: runtimeUpdate.sessionId,
            });
            setSendingMessage(merged.detail.status === "active" && stoppingSessionIdRef.current !== runtimeUpdate.sessionId);
            return;
          }
        }

        if (stoppingSessionIdRef.current !== runtimeUpdate.sessionId) {
          setSendingMessage(true);
        }
        void reloadSessionDetail(runtimeUpdate.sessionId);
        return;
      }

      void reloadSessions(resolvePreferredSessionIdForRuntimeReload({
        currentSessionId: selectedSessionId,
        runtimeSessionId: runtimeUpdate.sessionId,
      }));
    };

    window.addEventListener(
      DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
      handleConversationRuntimeEventsUpdated,
    );
    return () => {
      window.removeEventListener(
        DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
        handleConversationRuntimeEventsUpdated,
      );
    };
  }, [active, applySessionDetail, bridgeAvailable, reloadSessionDetail, reloadSessions, selectedSessionId, workspaceId]);

  useEffect(() => {
    setSendingMessage(false);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!active || !modelsBridgeAvailable) {
      return;
    }

    const handleModelsInvalidated = () => {
      void reloadComposerModels();
    };

    window.addEventListener(DESKTOP_MODELS_INVALIDATED_EVENT, handleModelsInvalidated);
    return () => {
      window.removeEventListener(DESKTOP_MODELS_INVALIDATED_EVENT, handleModelsInvalidated);
    };
  }, [active, modelsBridgeAvailable, reloadComposerModels]);

  const refreshAll = useCallback(async () => {
    await reloadSessions();
    await reloadSessionDetail();
    await reloadComposerAgents();
    await reloadComposerModels();
  }, [reloadComposerAgents, reloadComposerModels, reloadSessionDetail, reloadSessions]);

  const activateSession = useCallback((sessionId: string) => {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      return;
    }

    setSelectedSessionId((currentSessionId) => currentSessionId === normalizedSessionId
      ? currentSessionId
      : normalizedSessionId);
    clearComposerAttachments();
    void reloadSessionDetail(normalizedSessionId);

    if (!sessions.some((item) => item.sessionId === normalizedSessionId)) {
      void reloadSessions(normalizedSessionId);
    }
  }, [clearComposerAttachments, reloadSessionDetail, reloadSessions, sessions]);

  const createSession = useCallback(async () => {
    setCreatingSession(true);
    try {
      await waitForConversationWorkspaceSettingsSaves(workspaceId);
      const response = await createDesktopConversationSession({
        workspaceId,
        selectedAgentId: selectedComposerAgentId,
      });
      await reloadSessions(response.item.sessionId);
      await reloadSessionDetail(response.item.sessionId);
      await reloadComposerAgents();
      return response.item;
    } catch (error) {
      onError("createSession", error);
      return null;
    } finally {
      setCreatingSession(false);
    }
  }, [onError, reloadComposerAgents, reloadSessionDetail, reloadSessions, selectedComposerAgentId, workspaceId]);

  const launchManagedTakeover = useCallback(async (
    sourceSession: DesktopConversationSessionItem,
    detail: DesktopConversationSessionDetail,
  ) => {
    const launchPlan = resolveManagedTakeoverLaunchPlan({
      sourceSession,
      sessions,
      metadata: detail.metadata,
    });
    if (!launchPlan) {
      return;
    }

    if (launchPlan.existingSessionId) {
      activateSession(launchPlan.existingSessionId);
      return;
    }

    const attemptKey = `${sourceSession.sessionId}:${launchPlan.rootTaskId}:${launchPlan.executionAgentId}`;
    if (managedTakeoverAttemptKeysRef.current[attemptKey]) {
      return;
    }
    managedTakeoverAttemptKeysRef.current[attemptKey] = true;

    try {
      const created = await createDesktopConversationSession({
        workspaceId,
        title: sourceSession.title ? `Managed execution - ${sourceSession.title}` : "Managed execution",
        parentSessionId: sourceSession.sessionId,
        selectedAgentId: launchPlan.executionAgentId,
        metadata: {
          managedExecution: true,
          rootTask: false,
          rootTaskId: launchPlan.rootTaskId,
          linkedRootTaskId: launchPlan.rootTaskId,
          managedExecutionStage: "running",
          runMode: "hosted_autopilot",
          executionMode: "background",
          executionAgentId: launchPlan.executionAgentId,
          preferredExecutionAgentId: launchPlan.executionAgentId,
          takeoverSourceSessionId: sourceSession.sessionId,
        },
      });

      const targetSessionId = created.item.sessionId;
      setSelectedSessionId(targetSessionId);
      await reloadSessions(targetSessionId);
      setSendingMessage(true);

      const stopPolling = startSessionDetailFallbackPolling(targetSessionId, (nextDetail) => {
        applySessionDetail(nextDetail, {
          clearSendingForSessionId: targetSessionId,
        });
      });

      const selectedModel = composerModelOptions.find((item) => item.value === selectedComposerModelValue);

      try {
        const response = await sendDesktopConversationMessage({
          sessionId: targetSessionId,
          text: MANAGED_TAKEOVER_KICKOFF_TEXT,
          workspaceId,
          selectedAgentId: launchPlan.executionAgentId,
          ...(selectedModel
            ? {
                selectedChannelId: selectedModel.channelId,
                selectedModelId: selectedModel.modelId,
              }
            : {}),
        });

        stopPolling();
        applySessionDetail(response.detail, {
          clearSendingForSessionId: targetSessionId,
        });
        await reloadSessions(response.detail.sessionId);
        await reloadSessionDetail(response.detail.sessionId);
        await reloadComposerAgents(response.detail);
        await reloadComposerModels(response.detail);
      } catch (error) {
        stopPolling();
        setSendingMessage(false);
        onError("sendMessage", error);
      }
    } catch (error) {
      onError("createSession", error);
    }
  }, [activateSession, applySessionDetail, composerModelOptions, onError, reloadComposerAgents, reloadComposerModels, reloadSessionDetail, reloadSessions, selectedComposerModelValue, sessions, startSessionDetailFallbackPolling, workspaceId]);

  useEffect(() => {
    if (!active || !bridgeAvailable || !selectedSession || !selectedSessionDetail) {
      return;
    }

    void launchManagedTakeover(selectedSession, selectedSessionDetail);
  }, [active, bridgeAvailable, launchManagedTakeover, selectedSession, selectedSessionDetail]);

  const hideSession = useCallback(async (sessionId: string) => {
    const targetSession = sessions.find((item) => item.sessionId === sessionId);
    if (targetSession?.status === "active") {
      return false;
    }

    setArchivingSessionId(sessionId);
    try {
      const response = await hideDesktopConversationSession(sessionId);
      if (response.hidden) {
        const nextVisibleSessions = sessions.filter((item) => item.sessionId !== sessionId);
        setSessions(nextVisibleSessions);
        updateSessionDetailsById((current) => {
          const next = { ...current };
          delete next[sessionId];
          return next;
        });
        setSelectedSessionId((currentSessionId) => {
          if (currentSessionId !== sessionId) {
            return currentSessionId;
          }

          return resolveNextSessionId(nextVisibleSessions, undefined);
        });
      }
      return response.hidden;
    } catch (error) {
      onError("hideSession", error);
      return false;
    } finally {
      setArchivingSessionId((currentSessionId) =>
        currentSessionId === sessionId ? null : currentSessionId,
      );
    }
  }, [onError, sessions, updateSessionDetailsById]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const normalizedSessionId = sessionId.trim();
    const normalizedTitle = title.trim();
    if (!normalizedSessionId || !normalizedTitle) {
      return null;
    }

    setRenamingSessionId(normalizedSessionId);
    try {
      const response = await renameDesktopConversationSession({
        sessionId: normalizedSessionId,
        title: normalizedTitle,
      });
      setSessions((current) => current
        .map((item) => item.sessionId === normalizedSessionId ? response.item : item)
        .sort(compareSessions));
      updateSessionDetailsById((current) => current[normalizedSessionId]
        ? {
            ...current,
            [normalizedSessionId]: {
              ...current[normalizedSessionId],
              title: response.item.title,
              updatedAt: response.item.updatedAt,
              metadata: response.item.metadata ?? current[normalizedSessionId].metadata,
            },
          }
        : current);
      return response.item;
    } catch (error) {
      onError("renameSession", error);
      return null;
    } finally {
      setRenamingSessionId((current) => current === normalizedSessionId ? null : current);
    }
  }, [onError, updateSessionDetailsById]);

  const sendMessage = useCallback(async () => {
    if (!selectedSessionId || sendingMessage) {
      return false;
    }

    const text = draftMessage.trim();
    const attachments = buildComposerAttachmentInputs(composerAttachments);

    if (!text && attachments.length === 0) {
      return false;
    }

    const executionStrategy = resolveDesktopConversationExecutionStrategy({
      text,
      attachmentCount: attachments.length,
      selectedAgentId: selectedComposerAgentId,
      composerMode,
      metadata: selectedSessionDetail?.metadata,
    });
    const effectiveSelectedAgentId = executionStrategy.selectedAgentId ?? selectedComposerAgentId;

    const selectedModel = composerModelOptions.find((item) => item.value === selectedComposerModelValue);

    setSendingMessage(true);
    setDraftMessage("");
    clearComposerAttachments();

    const targetSessionId = selectedSessionId;
    const stopPolling = startSessionDetailFallbackPolling(targetSessionId, (detail) => {
      applySessionDetail(detail, {
        clearSendingForSessionId: targetSessionId,
      });
    });

    const messagePromise = sendDesktopConversationMessage({
      sessionId: selectedSessionId,
      ...(text ? { text } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
      workspaceId,
      selectedAgentId: effectiveSelectedAgentId,
      composerMode,
      ...(selectedModel
        ? {
            selectedChannelId: selectedModel.channelId,
            selectedModelId: selectedModel.modelId,
          }
        : {}),
    });

    void messagePromise.then(async (response) => {
      stopPolling();
      applySessionDetail(response.detail, {
        clearSendingForSessionId: targetSessionId,
      });
      await reloadSessions(response.detail.sessionId);
      await reloadComposerAgents(response.detail);
      await reloadComposerModels(response.detail);
    }).catch((error) => {
      stopPolling();
      setSendingMessage(false);
      onError("sendMessage", error);
    });

    return true;
  }, [applySessionDetail, clearComposerAttachments, composerAttachments, composerMode, composerModelOptions, draftMessage, onError, reloadComposerAgents, reloadComposerModels, reloadSessions, selectedComposerAgentId, selectedComposerModelValue, selectedSessionDetail?.metadata, selectedSessionId, sendingMessage, startSessionDetailFallbackPolling, workspaceId]);

  const stopMessage = useCallback(async () => {
    if (!selectedSessionId || !sendingMessage || stoppingSessionId === selectedSessionId) {
      return false;
    }

    setStoppingSessionId(selectedSessionId);

    try {
      const response = await stopDesktopConversationMessage({
        sessionId: selectedSessionId,
      });
      applySessionDetail(response.detail, {
        clearSendingForSessionId: selectedSessionId,
        clearStoppingForSessionId: selectedSessionId,
      });
      await reloadSessions(response.detail.sessionId);
      await reloadComposerAgents(response.detail);
      await reloadComposerModels(response.detail);
      setSendingMessage(response.detail.status === "active");
      setStoppingSessionId(null);
      return response.stopped;
    } catch (error) {
      setStoppingSessionId(null);
      onError("sendMessage", error);
      return false;
    }
  }, [applySessionDetail, onError, reloadComposerAgents, reloadComposerModels, reloadSessions, selectedSessionId, sendingMessage, stoppingSessionId]);

  const attachComposerFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void (async () => {
      const results = await Promise.allSettled(files.map((file) => normalizeComposerAttachment(file)));
      const normalized: ChatComposerAttachment[] = [];
      let firstError: unknown;

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.name.trim()) {
            normalized.push(result.value);
          } else {
            revokeComposerAttachmentPreviewUrl(result.value);
          }
          continue;
        }

        if (firstError === undefined) {
          firstError = result.reason;
        }
      }

      if (firstError !== undefined) {
        onError("attachFiles", firstError);
      }

      if (normalized.length === 0) {
        return;
      }

      setComposerAttachments((current) => {
        const nextById = new Map(current.map((item) => [item.id, item]));
        for (const item of normalized) {
          if (nextById.has(item.id)) {
            revokeComposerAttachmentPreviewUrl(item);
            continue;
          }

          nextById.set(item.id, item);
        }
        return [...nextById.values()];
      });
    })();
  }, [onError]);

  const removeComposerAttachment = useCallback((attachmentId: string) => {
    const normalizedId = attachmentId.trim();
    if (!normalizedId) {
      return;
    }

    setComposerAttachments((current) => {
      const target = current.find((item) => item.id === normalizedId);
      revokeComposerAttachmentPreviewUrl(target);
      return current.filter((item) => item.id !== normalizedId);
    });
  }, []);

  const answerInteraction = useCallback(async (
    interactionId: string,
    interactionResponse: unknown,
  ) => {
    setReplyingInteractionId(interactionId);
    const stopPolling = selectedSessionId
      ? startSessionDetailFallbackPolling(selectedSessionId, applySessionDetail)
      : undefined;

    try {
      const response = await answerDesktopConversationInteraction({
        sessionId: selectedSessionId,
        interactionId,
        response: interactionResponse,
      });
      stopPolling?.();
      applySessionDetail(response.detail);
      await reloadSessions(response.detail.sessionId);
      await reloadComposerAgents(response.detail);
      await reloadComposerModels(response.detail);
      return true;
    } catch (error) {
      stopPolling?.();
      onError("replyInteraction", error);
      return false;
    } finally {
      setReplyingInteractionId((current) => current === interactionId ? null : current);
    }
  }, [applySessionDetail, onError, reloadComposerAgents, reloadComposerModels, reloadSessions, selectedSessionId, startSessionDetailFallbackPolling]);

  const rejectInteraction = useCallback(async (interactionId: string) => {
    setReplyingInteractionId(interactionId);
    const stopPolling = selectedSessionId
      ? startSessionDetailFallbackPolling(selectedSessionId, applySessionDetail)
      : undefined;

    try {
      const response = await rejectDesktopConversationInteraction({
        sessionId: selectedSessionId,
        interactionId,
      });
      stopPolling?.();
      applySessionDetail(response.detail);
      await reloadSessions(response.detail.sessionId);
      await reloadComposerAgents(response.detail);
      await reloadComposerModels(response.detail);
      return true;
    } catch (error) {
      stopPolling?.();
      onError("replyInteraction", error);
      return false;
    } finally {
      setReplyingInteractionId((current) => current === interactionId ? null : current);
    }
  }, [applySessionDetail, onError, reloadComposerAgents, reloadComposerModels, reloadSessions, selectedSessionId, startSessionDetailFallbackPolling]);

  return {
    bridgeAvailable,
    modelsBridgeAvailable,
    agentsBridgeAvailable,
    workspaceId,
    workspaceSettings,
    sessions,
    sessionDetailsById,
    selectedSessionId,
    selectedSession,
    selectedSessionDetail,
    loadingSessions,
    loadingSessionDetail,
    creatingSession,
    renamingSessionId,
    archivingSessionId,
    sendingMessage,
    stoppingMessage,
    replyingInteractionId,
    searchText,
    statusFilter,
    draftMessage,
    composerMode,
    composerAttachments,
    composerModelOptions,
    composerModelSelectOptions,
    selectedComposerModelValue,
    composerAgentOptions,
    selectedComposerAgentId,
    setSearchText,
    setStatusFilter,
    setDraftMessage,
    setComposerMode,
    setSelectedSessionId,
    setSelectedComposerModelValue,
    setSelectedComposerAgentId,
    attachComposerFiles,
    removeComposerAttachment,
    refreshAll,
    activateSession,
    createSession,
    renameSession,
    hideSession,
    sendMessage,
    stopMessage,
    answerInteraction,
    rejectInteraction,
    loadFullSessionDetail,
    collapseFullSessionDetail,
  };
}

export type UseChatWorkspacePaneStateResult = ReturnType<typeof useChatWorkspacePaneState>;
