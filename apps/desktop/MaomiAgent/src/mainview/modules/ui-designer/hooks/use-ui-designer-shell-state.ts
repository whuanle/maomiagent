import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DesktopConversationAttachmentInput,
  DesktopConversationAttachmentKind,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
} from "../../../../shared/desktop-conversation";
import {
  UI_DESIGNER_AGENT_ID,
  UI_DESIGNER_CONTEXT_METADATA_KEY,
} from "../../../../shared/conversation/managed-execution";
import type { DesktopUiDesignerState } from "../../../../shared/desktop-ui-designer";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import {
  answerDesktopConversationInteraction,
  createDesktopConversationClient,
  DESKTOP_CONVERSATION_BRIDGE_READY_EVENT,
  DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT,
  DESKTOP_CONVERSATION_INVALIDATED_EVENT,
  DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
  hasDesktopConversationBridge,
  rejectDesktopConversationInteraction,
} from "../../../lib/desktop-conversation";
import {
  DESKTOP_MODELS_BRIDGE_READY_EVENT,
  getDesktopModelRuntimeSelectionSnapshot,
  hasDesktopModelsBridge,
} from "../../../lib/desktop-models";
import {
  DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT,
  getDesktopUiDesignerState,
  hasDesktopUiDesignerBridge,
  saveDesktopUiDesignerDesignPackage,
} from "../../../lib/desktop-ui-designer";
import {
  DESKTOP_WORKSPACE_BRIDGE_READY_EVENT,
  getDesktopWorkspaceFileContent,
  hasDesktopWorkspaceBridge,
} from "../../../lib/desktop-workspace";
import {
  readWorkspaceExperienceState,
  updateWorkspaceExperienceState,
} from "../../../components/workspace-experience-state/workspace-experience-state";
import {
  applyStopRequested,
  applyStopRpcResolved,
  applyStopTimedOut,
  clearExecutionOverlay,
  recordRuntimeEventActivity,
  resolveSessionExecutionView,
  shouldWaitForStopConfirmation,
  type SessionExecutionOverlayState,
} from "../../../components/workspace-experience-state/session-execution-overlay";
import { getNormalWorkspaces } from "../../../services/workspace-query-service";
import {
  useConversationWorkspaceSettings,
  waitForConversationWorkspaceSettingsSaves,
} from "../../chat/components/conversation-workspace-settings-storage";
import {
  mergeDesktopConversationRuntimeEvents,
} from "../../chat/hooks/desktop-conversation-runtime-events";
import type {
  ChatComposerAttachment,
  ChatComposerModelOption,
  ChatComposerSelectOptionGroup,
} from "../../chat/types";
import {
  buildDesktopRuntimeModelOptionGroups,
  buildDesktopRuntimeModelOptions,
  resolveDesktopRuntimeSelectedValue,
} from "../../models/services/runtime-selection";
import {
  buildProjectScopeDraft,
  normalizeProjectScopeFormValues,
  parseProjectScopeJson,
  stringifyProjectScope,
} from "../services/project-scope-flow";
import { buildUiDesignerStageDraft } from "../services/stage-draft";
import { buildProjectScopeInteractionRequest } from "../services/project-scope-interaction";
import {
  buildUiDesignerStageInteractionId,
  buildUiDesignerStageInteractionRequest,
} from "../services/stage-interaction";
import { normalizeStageResult } from "../services/stage-result-normalizer";
import {
  requestStageResult,
  requestStageSchema,
} from "../services/stage-schema-service";
import type { UiDesignerStageKey } from "../services/stage-view-model-resolver";
import { resolveStageViewModels } from "../services/stage-view-model-resolver";

type UiDesignerDesignFiles = {
  designSpecMarkdown: string;
  stackJson: string;
  scopeJson: string;
  themeJson: string;
  patternsJson: string;
  layoutsJson: string;
  pagesJson: string;
  sourcesMarkdown: string;
};

type UiDesignerContextFile = {
  path: string;
  content: string;
};

type UiDesignerContextPayload = {
  agentId: typeof UI_DESIGNER_AGENT_ID;
  surface: "ui-designer";
  workspaceId?: string;
  workspaceName?: string;
  workspaceDirectoryPath?: string;
  designPackagePath?: string;
  designRoot?: string;
  hasDesignSpec?: boolean;
  shouldSendKickoff?: boolean;
  lockReason?: string;
  readiness?: DesktopUiDesignerState["readiness"];
  preview?: DesktopUiDesignerState["preview"];
  focusBlock?: string;
  files: UiDesignerContextFile[];
};

type UseUiDesignerShellStateInput = {
  active: boolean;
};

type UiDesignerPendingInteraction = DesktopConversationSessionDetail["pendingInteractions"][number];

type LocalProjectScopeInteractionState = {
  sessionId: string;
  interaction: UiDesignerPendingInteraction;
};

type LocalStageInteractionState = {
  sessionId: string;
  stageKey: Parameters<typeof requestStageSchema>[0]["stageKey"];
  interaction: UiDesignerPendingInteraction;
};

const SESSION_DETAIL_SEND_POLL_INTERVAL_MS = 180;
const SESSION_DETAIL_FALLBACK_GRACE_MS = 450;
const SESSION_DETAIL_FALLBACK_SILENCE_WINDOW_MS = 600;
const STOP_CONFIRMATION_TIMEOUT_MS = 12_000;
const UI_DESIGNER_PROJECT_SCOPE_INTERACTION_ID = "ui-designer:project-scope";
function compareWorkspaces(left: DesktopWorkspaceItem, right: DesktopWorkspaceItem) {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
}

function compareSessions(left: DesktopConversationSessionItem, right: DesktopConversationSessionItem) {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || left.sessionId.localeCompare(right.sessionId, "en", { sensitivity: "base" });
}

function resolveNextWorkspaceId(
  items: DesktopWorkspaceItem[],
  currentWorkspaceId: string | undefined,
) {
  if (items.length === 0) {
    return undefined;
  }

  if (currentWorkspaceId && items.some((item) => item.workspaceId === currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  return items[0]?.workspaceId;
}

function resolveNextSessionId(
  items: DesktopConversationSessionItem[],
  currentSessionId: string | undefined,
) {
  if (items.length === 0) {
    return undefined;
  }

  if (currentSessionId && items.some((item) => item.sessionId === currentSessionId)) {
    return currentSessionId;
  }

  return items[0]?.sessionId;
}

function resolveActiveSessionId(
  items: DesktopConversationSessionItem[],
  currentSessionId: string | undefined,
) {
  const activeItems = items.filter((item) => item.status !== "archived");
  return resolveNextSessionId(activeItems, currentSessionId);
}

function readUiDesignerScene() {
  return readWorkspaceExperienceState().uiDesigner;
}

function updateUiDesignerScene(input: {
  workspaceId?: string;
  selectedSessionId?: string;
}) {
  updateWorkspaceExperienceState((current) => ({
    ...current,
    uiDesigner: {
      ...current.uiDesigner,
      workspaceId: input.workspaceId,
      selectedSessionId: input.selectedSessionId,
    },
  }));
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUiDesignerSession(item: DesktopConversationSessionItem) {
  const metadata = isRecord(item.metadata) ? item.metadata : undefined;
  return metadata?.surface === "ui-designer" || metadata?.moduleId === "ui-designer";
}

function buildSessionSummaryFromDetail(
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
    updatedAt: detail.updatedAt,
    metadata: detail.metadata ? { ...detail.metadata } : undefined,
  };
}

function parseJsonObject(text: string) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const DEFAULT_DESIGN_FILES: UiDesignerDesignFiles = {
  designSpecMarkdown: "",
  stackJson: "{}",
  scopeJson: "{}",
  themeJson: "{}",
  patternsJson: "{}",
  layoutsJson: "{}",
  pagesJson: "{}",
  sourcesMarkdown: "",
};

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

const UI_DESIGNER_DESIGN_FILE_PATHS = {
  designSpecMarkdown: "design/design-spec.md",
  stackJson: "design/stack.json",
  scopeJson: "design/scope.json",
  themeJson: "design/theme.json",
  patternsJson: "design/patterns.json",
  layoutsJson: "design/layouts.json",
  pagesJson: "design/pages.json",
  sourcesMarkdown: "design/sources.md",
} as const;

const UI_DESIGNER_CONTEXT_FILE_CHAR_LIMIT = 5000;

const UI_DESIGNER_CONTEXT_FILE_LABELS: Record<keyof UiDesignerDesignFiles, string> = {
  designSpecMarkdown: UI_DESIGNER_DESIGN_FILE_PATHS.designSpecMarkdown,
  stackJson: UI_DESIGNER_DESIGN_FILE_PATHS.stackJson,
  scopeJson: UI_DESIGNER_DESIGN_FILE_PATHS.scopeJson,
  themeJson: UI_DESIGNER_DESIGN_FILE_PATHS.themeJson,
  patternsJson: UI_DESIGNER_DESIGN_FILE_PATHS.patternsJson,
  layoutsJson: UI_DESIGNER_DESIGN_FILE_PATHS.layoutsJson,
  pagesJson: UI_DESIGNER_DESIGN_FILE_PATHS.pagesJson,
  sourcesMarkdown: UI_DESIGNER_DESIGN_FILE_PATHS.sourcesMarkdown,
};

function buildUiDesignerSessionMetadata() {
  return {
    surface: "ui-designer",
    moduleId: "ui-designer",
    conversationSettings: {
      managedExecutionEnabled: false,
      thinkingEnabled: false,
    },
  } satisfies Record<string, unknown>;
}

function buildUiDesignerSendMetadata(context?: UiDesignerContextPayload) {
  return {
    conversationSettings: {
      thinkingEnabled: false,
    },
    ...(context ? { [UI_DESIGNER_CONTEXT_METADATA_KEY]: context } : {}),
  } satisfies Record<string, unknown>;
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

function truncateUiDesignerContextText(value: string) {
  const normalized = value.trim();
  if (normalized.length <= UI_DESIGNER_CONTEXT_FILE_CHAR_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, UI_DESIGNER_CONTEXT_FILE_CHAR_LIMIT)}\n...[truncated]`;
}

function buildUiDesignerContext(input: {
  workspaceId?: string;
  selectedWorkspace?: DesktopWorkspaceItem;
  designerState: DesktopUiDesignerState | null;
  designFiles: UiDesignerDesignFiles;
  focusBlock?: string;
}): UiDesignerContextPayload {
  const files = Object.entries(UI_DESIGNER_CONTEXT_FILE_LABELS).flatMap(([key, path]) => {
    const content = truncateUiDesignerContextText(input.designFiles[key as keyof UiDesignerDesignFiles] ?? "");
    return content ? [{ path, content }] : [];
  });

  return {
    agentId: UI_DESIGNER_AGENT_ID,
    surface: "ui-designer",
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.selectedWorkspace?.name ? { workspaceName: input.selectedWorkspace.name } : {}),
    ...(input.selectedWorkspace?.directoryPath ? { workspaceDirectoryPath: input.selectedWorkspace.directoryPath } : {}),
    ...(input.designerState?.designPackagePath ? { designPackagePath: input.designerState.designPackagePath } : {}),
    ...(input.designerState?.designRoot ? { designRoot: input.designerState.designRoot } : {}),
    ...(input.designerState ? { hasDesignSpec: input.designerState.hasDesignSpec } : {}),
    ...(input.designerState ? { shouldSendKickoff: input.designerState.shouldSendKickoff } : {}),
    ...(input.designerState?.lockReason ? { lockReason: input.designerState.lockReason } : {}),
    ...(input.designerState?.readiness ? { readiness: input.designerState.readiness } : {}),
    ...(input.designerState?.preview ? { preview: input.designerState.preview } : {}),
    ...(input.focusBlock ? { focusBlock: input.focusBlock } : {}),
    files,
  };
}

function resolveResetKickoffPrompt(state: DesktopUiDesignerState | null) {
  const normalized = state?.kickoffPrompt?.trim();
  if (normalized) {
    return normalized;
  }

  return "继续基于当前设计包工作，请从未完成阶段继续推进。";
}

function resolveComposerAttachmentExtension(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return normalizedName.match(/\.([^.]+)$/)?.[1] ?? "";
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

export function useUiDesignerShellState(input: UseUiDesignerShellStateInput) {
  const { active } = input;
  const conversationClient = useMemo(() => createDesktopConversationClient({
    createSession: {
      selectedAgentId: UI_DESIGNER_AGENT_ID,
      metadata: buildUiDesignerSessionMetadata(),
    },
    sendMessage: {
      selectedAgentId: UI_DESIGNER_AGENT_ID,
      metadata: buildUiDesignerSendMetadata(),
    },
  }), []);
  const [bridgeAvailable, setBridgeAvailable] = useState(
    () => hasDesktopWorkspaceBridge()
      && hasDesktopConversationBridge()
      && hasDesktopUiDesignerBridge(),
  );
  const [modelsBridgeAvailable, setModelsBridgeAvailable] = useState(
    () => hasDesktopModelsBridge(),
  );
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingDesignerState, setLoadingDesignerState] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [resettingConversation, setResettingConversation] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [executionOverlays, setExecutionOverlays] = useState<SessionExecutionOverlayState>({});
  const [replyingInteractionId, setReplyingInteractionId] = useState<string | null>(null);
  const initialSceneRef = useRef(readUiDesignerScene());
  const [workspaces, setWorkspaces] = useState<DesktopWorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(
    () => initialSceneRef.current.workspaceId,
  );
  const [designerState, setDesignerState] = useState<DesktopUiDesignerState | null>(null);
  const [sessions, setSessions] = useState<DesktopConversationSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(
    () => initialSceneRef.current.selectedSessionId,
  );
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<DesktopConversationSessionDetail | null>(null);
  const [designFiles, setDesignFiles] = useState<UiDesignerDesignFiles>(DEFAULT_DESIGN_FILES);
  const [draftMessage, setDraftMessage] = useState("");
  const [composerFocusBlock, setComposerFocusBlock] = useState<UiDesignerStageKey | undefined>(undefined);
  const [composerAttachments, setComposerAttachments] = useState<ChatComposerAttachment[]>([]);
  const composerAttachmentsRef = useRef<ChatComposerAttachment[]>([]);
  const runtimeEventActivityBySessionIdRef = useRef<Record<string, number>>({});
  const executionOverlaysRef = useRef<SessionExecutionOverlayState>({});
  const selectedSessionIdRef = useRef<string | undefined>(undefined);
  const selectedSessionDetailRef = useRef<DesktopConversationSessionDetail | null>(null);
  const [composerModelOptions, setComposerModelOptions] = useState<ChatComposerModelOption[]>([]);
  const [composerModelSelectOptions, setComposerModelSelectOptions] = useState<ChatComposerSelectOptionGroup[]>([]);
  const [selectedComposerModelValue, setSelectedComposerModelValueState] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localProjectScopeInteraction, setLocalProjectScopeInteraction] = useState<LocalProjectScopeInteractionState | null>(null);
  const [localStageInteraction, setLocalStageInteraction] = useState<LocalStageInteractionState | null>(null);
  const [suggestedStageKey, setSuggestedStageKey] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((item) => item.workspaceId === workspaceId),
    [workspaceId, workspaces],
  );
  const selectedSession = useMemo(
    () => sessions.find((item) => item.sessionId === selectedSessionId),
    [selectedSessionId, sessions],
  );
  const {
    settings: workspaceSettings,
    saveSettings: saveWorkspaceSettings,
  } = useConversationWorkspaceSettings(workspaceId);
  const persistedUiDesignerSessionId = selectedSession?.workspaceId === workspaceId
    ? selectedSession?.sessionId
    : undefined;

  useEffect(() => {
    setLocalProjectScopeInteraction((current) => {
      if (!current) {
        return current;
      }

      if (selectedSessionId && current.sessionId !== selectedSessionId) {
        return null;
      }

      return current;
    });
    setLocalStageInteraction((current) => {
      if (!current) {
        return current;
      }

      if (selectedSessionId && current.sessionId !== selectedSessionId) {
        return null;
      }

      return current;
    });
  }, [selectedSessionId, workspaceId]);

  useEffect(() => {
    updateUiDesignerScene({
      workspaceId,
      selectedSessionId: persistedUiDesignerSessionId ?? selectedSessionId,
    });
  }, [persistedUiDesignerSessionId, selectedSessionId, workspaceId]);

  const stack = useMemo(() => parseJsonObject(designFiles.stackJson), [designFiles.stackJson]);
  const scope = useMemo(() => parseJsonObject(designFiles.scopeJson), [designFiles.scopeJson]);
  const theme = useMemo(() => parseJsonObject(designFiles.themeJson), [designFiles.themeJson]);
  const patterns = useMemo(() => parseJsonObject(designFiles.patternsJson), [designFiles.patternsJson]);
  const layouts = useMemo(() => parseJsonObject(designFiles.layoutsJson), [designFiles.layoutsJson]);
  const pages = useMemo(() => parseJsonObject(designFiles.pagesJson), [designFiles.pagesJson]);
  const sourcesMarkdown = designFiles.sourcesMarkdown;
  const stageViewModels = useMemo(() => resolveStageViewModels({
    scope,
    stack,
    theme,
    patterns,
    layouts,
    pages,
    designSpecMarkdown: designFiles.designSpecMarkdown,
    sourcesMarkdown,
  }), [
    designFiles.designSpecMarkdown,
    layouts,
    pages,
    patterns,
    scope,
    sourcesMarkdown,
    stack,
    theme,
  ]);
  const selectedSessionDetailForView = selectedSessionDetail;
  const activeLocalInteraction = useMemo(() => {
    if (localProjectScopeInteraction) {
      return localProjectScopeInteraction.interaction;
    }

    if (localStageInteraction) {
      return localStageInteraction.interaction;
    }

    return null;
  }, [localProjectScopeInteraction, localStageInteraction]);
  const activeLocalInteractionId = activeLocalInteraction?.interactionId;
  const activeLocalInteractionRequest = activeLocalInteraction?.request.kind === "form"
    ? activeLocalInteraction.request
    : null;
  const pendingStageKey = useMemo(() => {
    if (localProjectScopeInteraction) {
      return "projectScope" as const;
    }

    const activeLocalStageInteraction = localStageInteraction;
    if (activeLocalStageInteraction) {
      return activeLocalStageInteraction.stageKey;
    }

    return undefined;
  }, [localProjectScopeInteraction, localStageInteraction]);
  const selectedSessionSummaryChannelId = typeof selectedSession?.metadata?.selectedChannelId === "string"
    && selectedSession.metadata.selectedChannelId.trim()
    ? selectedSession.metadata.selectedChannelId.trim()
    : undefined;
  const selectedSessionSummaryModelId = typeof selectedSession?.metadata?.selectedModelId === "string"
    && selectedSession.metadata.selectedModelId.trim()
    ? selectedSession.metadata.selectedModelId.trim()
    : undefined;
  const selectedSessionDetailChannelId = typeof selectedSessionDetail?.metadata?.selectedChannelId === "string"
    && selectedSessionDetail.metadata.selectedChannelId.trim()
    ? selectedSessionDetail.metadata.selectedChannelId.trim()
    : undefined;
  const selectedSessionDetailModelId = typeof selectedSessionDetail?.metadata?.selectedModelId === "string"
    && selectedSessionDetail.metadata.selectedModelId.trim()
    ? selectedSessionDetail.metadata.selectedModelId.trim()
    : undefined;
  const selectedExecutionView = useMemo(() => resolveSessionExecutionView({
    detailStatus: selectedSessionDetail?.status ?? selectedSession?.status,
    overlay: selectedSessionId ? executionOverlays[selectedSessionId] : undefined,
  }), [executionOverlays, selectedSession, selectedSessionDetail, selectedSessionId]);

  const canSwitchWorkspace = !designerState?.lockReason
    && !creatingSession
    && !resettingConversation
    && !sendingMessage
    && designerState?.preview.status !== "starting";
  const canResetConversation = Boolean(workspaceId)
    && Boolean(selectedSessionId)
    && !designerState?.lockReason
    && !creatingSession
    && !resettingConversation
    && !sendingMessage
    && designerState?.preview.status !== "starting";

  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(() => {
    executionOverlaysRef.current = executionOverlays;
  }, [executionOverlays]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    selectedSessionDetailRef.current = selectedSessionDetail;
  }, [selectedSessionDetail]);

  useEffect(() => () => {
    composerAttachmentsRef.current.forEach((attachment) => revokeComposerAttachmentPreviewUrl(attachment));
  }, []);

  useEffect(() => {
    const timeoutHandles = Object.values(executionOverlays).flatMap((overlay) => {
      if (overlay.phase !== "waiting_stop_confirm" || !overlay.stopRequestedAt) {
        return [];
      }

      const requestedAt = new Date(overlay.stopRequestedAt).getTime();
      if (Number.isNaN(requestedAt)) {
        return [];
      }

      const remainingMs = STOP_CONFIRMATION_TIMEOUT_MS - (Date.now() - requestedAt);
      if (remainingMs <= 0) {
        setExecutionOverlays((current) => applyStopTimedOut(
          current,
          overlay.sessionId,
          "stop confirmation timed out",
        ));
        return [];
      }

      const timeoutId = window.setTimeout(() => {
        setExecutionOverlays((current) => applyStopTimedOut(
          current,
          overlay.sessionId,
          "stop confirmation timed out",
        ));
      }, remainingMs);

      return [timeoutId];
    });

    return () => {
      timeoutHandles.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [executionOverlays]);

  const clearComposerAttachments = useCallback(() => {
    setComposerAttachments((current) => {
      current.forEach((attachment) => revokeComposerAttachmentPreviewUrl(attachment));
      return [];
    });
  }, []);

  const applySessionDetail = useCallback((detail: DesktopConversationSessionDetail) => {
    setSelectedSessionDetail((current) => current?.sessionId === detail.sessionId || detail.sessionId === selectedSessionIdRef.current
      ? detail
      : current);
    setSessions((current) => {
      const existing = current.find((item) => item.sessionId === detail.sessionId);
      const nextSummary = buildSessionSummaryFromDetail(detail, existing);
      const nextItems = current.some((item) => item.sessionId === detail.sessionId)
        ? current.map((item) => item.sessionId === detail.sessionId ? nextSummary : item)
        : [nextSummary, ...current];
      return [...nextItems].sort(compareSessions);
    });
  }, []);

  const reloadWorkspaces = useCallback(async () => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingWorkspaces(true);
    setErrorMessage(null);
    try {
      const persistedScene = readUiDesignerScene();
      const nextItems = (await getNormalWorkspaces({ limit: 200, offset: 0 })).sort(compareWorkspaces);
      setWorkspaces(nextItems);
      setWorkspaceId((current) => resolveNextWorkspaceId(nextItems, current ?? persistedScene.workspaceId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [active, bridgeAvailable]);

  const reloadDesignFiles = useCallback(async (nextWorkspaceId: string) => {
    const result = await Promise.all([
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.designSpecMarkdown),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.stackJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.scopeJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.themeJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.patternsJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.layoutsJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.pagesJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.sourcesMarkdown),
    ]);

    const nextFiles = {
      designSpecMarkdown: result[0].content,
      stackJson: result[1].content,
      scopeJson: result[2].content,
      themeJson: result[3].content,
      patternsJson: result[4].content,
      layoutsJson: result[5].content,
      pagesJson: result[6].content,
      sourcesMarkdown: result[7].content,
    };

    setDesignFiles(nextFiles);
  }, []);

  const reloadDesignerState = useCallback(async (nextWorkspaceId: string) => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingDesignerState(true);
    setErrorMessage(null);
    try {
      const nextState = await getDesktopUiDesignerState({ workspaceId: nextWorkspaceId });
      setDesignerState(nextState);
      await reloadDesignFiles(nextWorkspaceId);
    } catch (error) {
      setDesignerState(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDesignerState(false);
    }
  }, [active, bridgeAvailable, reloadDesignFiles]);

  const reloadSessions = useCallback(async (
    nextWorkspaceId: string,
    preferredSessionId?: string,
  ) => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingSessions(true);
    setErrorMessage(null);
    try {
      const persistedScene = readUiDesignerScene();
      const response = await conversationClient.listSessions({
        workspaceId: nextWorkspaceId,
        status: "all",
        limit: 200,
        offset: 0,
      });
      const nextItems = response.items
        .filter(isUiDesignerSession)
        .sort(compareSessions);
      setSessions(nextItems);
      setSelectedSessionId((current) =>
        resolveActiveSessionId(nextItems, preferredSessionId ?? current ?? persistedScene.selectedSessionId));
    } catch (error) {
      setSessions([]);
      setSelectedSessionId(undefined);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSessions(false);
    }
  }, [active, bridgeAvailable]);

  const reloadSelectedSessionDetail = useCallback(async (nextSessionId: string) => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingSessionDetail(true);
    setErrorMessage(null);
    try {
      setSelectedSessionDetail(await conversationClient.getSessionDetail(nextSessionId));
    } catch (error) {
      setSelectedSessionDetail(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSessionDetail(false);
    }
  }, [active, bridgeAvailable]);

  const startSessionDetailFallbackPolling = useCallback((
    sessionId: string,
    onDetail: (detail: DesktopConversationSessionDetail) => void,
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
        const stopRequested = shouldWaitForStopConfirmation(executionOverlaysRef.current[sessionId]);
        if (withinGracePeriod || recentRuntimeActivity || stopRequested) {
          await delay(SESSION_DETAIL_SEND_POLL_INTERVAL_MS);
          continue;
        }

        try {
          const detail = await conversationClient.getSessionDetail(sessionId);
          if (detail) {
            onDetail(detail);
            if (detail.status !== "active") {
              break;
            }
          }
        } catch {
          // Ignore transient polling failures; runtime events or the final mutation response will recover state.
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
  }, [conversationClient]);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeAvailable(
        hasDesktopWorkspaceBridge()
        && hasDesktopConversationBridge()
        && hasDesktopUiDesignerBridge(),
      );
      setModelsBridgeAvailable(hasDesktopModelsBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeState);
    window.addEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, syncBridgeState);
    window.addEventListener(DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT, syncBridgeState);
    window.addEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, syncBridgeState);
    return () => {
      window.removeEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeState);
      window.removeEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, syncBridgeState);
      window.removeEventListener(DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT, syncBridgeState);
      window.removeEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, syncBridgeState);
    };
  }, []);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    void reloadWorkspaces();
  }, [active, bridgeAvailable, reloadWorkspaces]);

  useEffect(() => {
    if (!active || !workspaceId || !bridgeAvailable) {
      setDesignerState(null);
      setSessions([]);
      setSelectedSessionId(undefined);
      setSelectedSessionDetail(null);
      setSendingMessage(false);
      setExecutionOverlays({});
      return;
    }

    void reloadDesignerState(workspaceId);
    void reloadSessions(workspaceId);
  }, [active, bridgeAvailable, reloadDesignerState, reloadSessions, workspaceId]);

  useEffect(() => {
    if (!active || !selectedSessionId || !bridgeAvailable) {
      setSelectedSessionDetail(null);
      return;
    }

    void reloadSelectedSessionDetail(selectedSessionId);
  }, [active, bridgeAvailable, reloadSelectedSessionDetail, selectedSessionId]);

  const createSession = useCallback(async (input?: {
    kickoffMessage?: string;
    prefillDraft?: string;
    prefillFocusBlock?: UiDesignerStageKey;
  }) => {
    if (!workspaceId) {
      return null;
    }

    setCreatingSession(true);
    setErrorMessage(null);
    try {
      await waitForConversationWorkspaceSettingsSaves(workspaceId);
      const context = buildUiDesignerContext({
        workspaceId,
        selectedWorkspace,
        designerState,
        designFiles,
      });
      const response = await conversationClient.createSession({
        workspaceId,
        title: "UI 设计方案",
        metadata: {
          [UI_DESIGNER_CONTEXT_METADATA_KEY]: context,
        },
      });
      await reloadSessions(workspaceId, response.item.sessionId);
      setSelectedSessionId(response.item.sessionId);
      await reloadSelectedSessionDetail(response.item.sessionId);
      clearComposerAttachments();

      const kickoffMessage = input?.kickoffMessage?.trim();
      if (kickoffMessage) {
        await conversationClient.sendMessage({
          workspaceId,
          sessionId: response.item.sessionId,
          text: kickoffMessage,
          metadata: buildUiDesignerSendMetadata(context),
        });
        await reloadSelectedSessionDetail(response.item.sessionId);
        await reloadSessions(workspaceId, response.item.sessionId);
        return response.item;
      }

      setDraftMessage(input?.prefillDraft?.trim() ?? "");
      setComposerFocusBlock(input?.prefillFocusBlock);
      return response.item;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setCreatingSession(false);
    }
  }, [
    clearComposerAttachments,
    conversationClient,
    designFiles,
    designerState,
    reloadSelectedSessionDetail,
    reloadSessions,
    selectedWorkspace,
    workspaceId,
  ]);

  const reloadComposerModels = useCallback(async (detail?: DesktopConversationSessionDetail | null) => {
    if (!modelsBridgeAvailable || !workspaceId) {
      setComposerModelOptions([]);
      setComposerModelSelectOptions([]);
      setSelectedComposerModelValueState(undefined);
      return;
    }

    try {
      const resolvedDetailChannelId = detail?.workspaceId === workspaceId
        ? (typeof detail.metadata?.selectedChannelId === "string" && detail.metadata.selectedChannelId.trim()
          ? detail.metadata.selectedChannelId.trim()
          : undefined)
        : undefined;
      const resolvedDetailModelId = detail?.workspaceId === workspaceId
        ? (typeof detail.metadata?.selectedModelId === "string" && detail.metadata.selectedModelId.trim()
          ? detail.metadata.selectedModelId.trim()
          : undefined)
        : undefined;
      const storedSelectedChannelId = workspaceSettings.selectedChannelId?.trim() || undefined;
      const storedSelectedModelId = workspaceSettings.selectedModelId?.trim() || undefined;
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
      const nextOptions = runtimeOptions.map((item) => ({
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
      const nextSelectOptions = buildDesktopRuntimeModelOptionGroups(runtimeOptions);
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

      setComposerModelOptions(nextOptions);
      setComposerModelSelectOptions(nextSelectOptions);
      setSelectedComposerModelValueState((currentValue) => {
        if (currentValue && nextOptions.some((item) => item.value === currentValue)) {
          return currentValue;
        }
        if (resolvedValue && nextOptions.some((item) => item.value === resolvedValue)) {
          return resolvedValue;
        }
        if (defaultValue && nextOptions.some((item) => item.value === defaultValue)) {
          return defaultValue;
        }
        return nextOptions[0]?.value;
      });
    } catch {
      setComposerModelOptions([]);
      setComposerModelSelectOptions([]);
      setSelectedComposerModelValueState(undefined);
    }
  }, [
    modelsBridgeAvailable,
    selectedSessionDetailChannelId,
    selectedSessionDetailModelId,
    selectedSessionSummaryChannelId,
    selectedSessionSummaryModelId,
    workspaceId,
    workspaceSettings.selectedChannelId,
    workspaceSettings.selectedModelId,
  ]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void reloadComposerModels(selectedSessionDetail);
  }, [active, reloadComposerModels, selectedSessionDetail]);

  useEffect(() => {
    if (modelsBridgeAvailable) {
      return;
    }

    setComposerModelOptions([]);
    setComposerModelSelectOptions([]);
    setSelectedComposerModelValueState(undefined);
  }, [modelsBridgeAvailable]);

  useEffect(() => {
    if (!active || !workspaceId) {
      return;
    }

    const handleSessionInvalidated = () => {
      void reloadSessions(workspaceId, selectedSessionId);
      if (selectedSessionId) {
        void reloadSelectedSessionDetail(selectedSessionId);
      }
    };

    window.addEventListener(DESKTOP_CONVERSATION_INVALIDATED_EVENT, handleSessionInvalidated);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_INVALIDATED_EVENT, handleSessionInvalidated);
    };
  }, [active, reloadSelectedSessionDetail, reloadSessions, selectedSessionId, workspaceId]);

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
        && detailUpdate.detail.sessionId !== selectedSessionIdRef.current
      ) {
        return;
      }

      applySessionDetail(detailUpdate.detail);
      setLoadingSessionDetail(false);
      if (detailUpdate.detail.sessionId === selectedSessionIdRef.current) {
        setSendingMessage(detailUpdate.detail.status === "active");
        if (detailUpdate.detail.status !== "active") {
          setExecutionOverlays((current) => clearExecutionOverlay(current, detailUpdate.detail.sessionId));
          void reloadDesignerState(detailUpdate.detail.workspaceId);
        }
      }
    };

    window.addEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    };
  }, [active, applySessionDetail, bridgeAvailable, reloadDesignerState, workspaceId]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    if (!workspaceId) {
      return;
    }

    const handleConversationRuntimeEventsUpdated = (event: Event) => {
      const runtimeUpdate = (event as CustomEvent<DesktopConversationRuntimeEventsUpdateEvent | undefined>).detail;
      if (!runtimeUpdate) {
        return;
      }

      runtimeEventActivityBySessionIdRef.current[runtimeUpdate.sessionId] = Date.now();
      setExecutionOverlays((current) => recordRuntimeEventActivity(
        current,
        runtimeUpdate.sessionId,
        new Date().toISOString(),
      ));

      const matchesWorkspace = runtimeUpdate.workspaceId === workspaceId;
      const matchesSelectedSession = runtimeUpdate.sessionId === selectedSessionIdRef.current;
      if (!matchesWorkspace && !matchesSelectedSession) {
        return;
      }

      if (matchesSelectedSession) {
        const currentDetail = selectedSessionDetailRef.current;
        if (currentDetail) {
          const merged = mergeDesktopConversationRuntimeEvents(currentDetail, runtimeUpdate.events);
          if (!merged.requiresReload) {
            applySessionDetail(merged.detail);
            setLoadingSessionDetail(false);
            setSendingMessage(merged.detail.status === "active");
            if (merged.detail.status !== "active") {
              setExecutionOverlays((current) => clearExecutionOverlay(current, runtimeUpdate.sessionId));
              void reloadDesignerState(merged.detail.workspaceId);
            }
            return;
          }
        }

        if (!shouldWaitForStopConfirmation(executionOverlaysRef.current[runtimeUpdate.sessionId])) {
          setSendingMessage(true);
        }
        void reloadSelectedSessionDetail(runtimeUpdate.sessionId);
        return;
      }

      void reloadSessions(workspaceId, selectedSessionIdRef.current);
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
  }, [active, applySessionDetail, bridgeAvailable, reloadDesignerState, reloadSelectedSessionDetail, reloadSessions, workspaceId]);

  useEffect(() => {
    if (!active || !workspaceId || !designerState || loadingSessions || creatingSession || selectedSessionId) {
      return;
    }

    if (sessions.some((item) => item.status !== "archived")) {
      return;
    }

    void createSession({
      prefillDraft: "",
    });
  }, [
    active,
    createSession,
    creatingSession,
    designerState,
    loadingSessions,
    selectedSessionId,
    sessions,
    workspaceId,
  ]);

  const selectWorkspace = useCallback((nextWorkspaceId: string) => {
    if (!nextWorkspaceId) {
      return;
    }

    if (!canSwitchWorkspace && nextWorkspaceId !== workspaceId) {
      return;
    }

    setWorkspaceId(nextWorkspaceId);
  }, [canSwitchWorkspace, workspaceId]);

  const selectSession = useCallback((nextSessionId: string) => {
    if (!nextSessionId) {
      return;
    }

    setSelectedSessionId(nextSessionId);
  }, []);

  const resetConversation = useCallback(async () => {
    if (!workspaceId || !selectedSessionId || resettingConversation) {
      return;
    }

    const sessionToHide = selectedSessionId;
    setResettingConversation(true);
    setErrorMessage(null);
    setSelectedSessionDetail(null);
    setSelectedSessionId(undefined);
    clearComposerAttachments();
    try {
      const created = await createSession({
        prefillDraft: "",
      });
      if (created) {
        void conversationClient.hideSession(sessionToHide)
          .then(() => reloadSessions(workspaceId, created.sessionId))
          .catch((error) => {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          });
      } else {
        setSelectedSessionId(sessionToHide);
        await reloadSessions(workspaceId, sessionToHide);
      }
    } catch (error) {
      setSelectedSessionId(sessionToHide);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setResettingConversation(false);
    }
  }, [clearComposerAttachments, conversationClient, createSession, designerState, reloadSessions, resettingConversation, selectedSessionId, workspaceId]);

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
        setErrorMessage(firstError instanceof Error ? firstError.message : String(firstError));
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
  }, []);

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

  const sendUiDesignerConversationMessage = useCallback(async (input: {
    sessionId: string;
    text?: string;
    attachments?: DesktopConversationAttachmentInput[];
    focusBlock?: string;
    clearComposer?: boolean;
  }) => {
    if (!workspaceId || sendingMessage) {
      return false;
    }

    const text = input.text?.trim() ?? "";
    const attachments = input.attachments ?? [];
    if (!text && attachments.length === 0) {
      return false;
    }

    const selectedModel = composerModelOptions.find((item) => item.value === selectedComposerModelValue);
    const context = buildUiDesignerContext({
      workspaceId,
      selectedWorkspace,
      designerState,
      designFiles,
      ...(input.focusBlock ? { focusBlock: input.focusBlock } : {}),
    });

    setSendingMessage(true);
    setErrorMessage(null);
    try {
      await waitForConversationWorkspaceSettingsSaves(workspaceId);
      if (input.clearComposer) {
        setDraftMessage("");
        setComposerFocusBlock(undefined);
        clearComposerAttachments();
      }
      const targetSessionId = input.sessionId;
      const stopPolling = startSessionDetailFallbackPolling(targetSessionId, (detail) => {
        applySessionDetail(detail);
        setSendingMessage(detail.status === "active");
        if (detail.status !== "active") {
          void reloadDesignerState(workspaceId);
        }
      });

      const messagePromise = conversationClient.sendMessage({
        workspaceId,
        sessionId: input.sessionId,
        ...(text ? { text } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        metadata: buildUiDesignerSendMetadata(context),
        ...(selectedModel
          ? {
              selectedChannelId: selectedModel.channelId,
              selectedModelId: selectedModel.modelId,
            }
          : {}),
      });

      void messagePromise.then((response) => {
        stopPolling();
        applySessionDetail(response.detail);
        void reloadSessions(workspaceId, response.detail.sessionId);
        void reloadDesignerState(workspaceId);
      }).catch((error) => {
        stopPolling();
        setSendingMessage(false);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setSendingMessage(false);
      return false;
    } finally {
      // Runtime events and the final detail update now control the visible sending state.
    }
    return true;
  }, [
    applySessionDetail,
    clearComposerAttachments,
    composerModelOptions,
    conversationClient,
    designFiles,
    designerState,
    reloadDesignerState,
    reloadSessions,
    selectedComposerModelValue,
    selectedWorkspace,
    sendingMessage,
    startSessionDetailFallbackPolling,
    workspaceId,
  ]);

  const sendMessage = useCallback(async () => {
    if (!selectedSessionId) {
      return;
    }

    await sendUiDesignerConversationMessage({
      sessionId: selectedSessionId,
      text: draftMessage,
      attachments: buildComposerAttachmentInputs(composerAttachments),
      ...(composerFocusBlock ? { focusBlock: composerFocusBlock } : {}),
      clearComposer: true,
    });
  }, [
    composerAttachments,
    composerFocusBlock,
    draftMessage,
    selectedSessionId,
    sendUiDesignerConversationMessage,
  ]);

  const stopMessage = useCallback(async () => {
    if (!selectedSessionId || !sendingMessage || selectedExecutionView.isStopping) {
      return;
    }

    setExecutionOverlays((current) => applyStopRequested(current, selectedSessionId, new Date().toISOString()));
    setErrorMessage(null);
    try {
      const response = await conversationClient.stopMessage({
        sessionId: selectedSessionId,
      });
      applySessionDetail(response.detail);
      setExecutionOverlays((current) => applyStopRpcResolved(current, selectedSessionId, {
        stopped: response.stopped,
        detailStatus: response.detail.status,
        at: new Date().toISOString(),
      }));
      await reloadSessions(response.detail.workspaceId, response.detail.sessionId);
      await reloadDesignerState(response.detail.workspaceId);
      setSendingMessage(response.detail.status === "active");
    } catch (error) {
      setExecutionOverlays((current) => applyStopTimedOut(
        current,
        selectedSessionId,
        error instanceof Error ? error.message : String(error),
      ));
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    applySessionDetail,
    conversationClient,
    reloadDesignerState,
    reloadSessions,
    selectedExecutionView.isStopping,
    selectedSessionId,
    sendingMessage,
  ]);

  const resolveCurrentStageModelSelection = useCallback(() => {
    const selectedModel = composerModelOptions.find((item) => item.value === selectedComposerModelValue);
    return {
      selectedChannelId: selectedModel?.channelId,
      selectedModelId: selectedModel?.modelId,
    };
  }, [composerModelOptions, selectedComposerModelValue]);

  const submitLocalProjectScopeInteraction = useCallback(async (response: unknown) => {
    const activeSessionId = localProjectScopeInteraction?.sessionId ?? selectedSessionId;
    if (!workspaceId || !activeSessionId || !isRecord(response) || response.kind !== "form") {
      return false;
    }

    const normalized = normalizeProjectScopeFormValues(
      isRecord(response.values) ? response.values : {},
    );
    setReplyingInteractionId(UI_DESIGNER_PROJECT_SCOPE_INTERACTION_ID);
    setErrorMessage(null);
    try {
      const saved = await saveDesktopUiDesignerDesignPackage({
        workspaceId,
        files: {
          scopeJson: stringifyProjectScope(normalized),
        },
      });
      setDesignerState(saved.state);
      await reloadDesignFiles(workspaceId);
      setLocalProjectScopeInteraction(null);
      await sendUiDesignerConversationMessage({
        sessionId: activeSessionId,
        text: buildProjectScopeDraft(normalized),
        focusBlock: "projectScope",
      });
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setReplyingInteractionId((current) => current === UI_DESIGNER_PROJECT_SCOPE_INTERACTION_ID ? null : current);
    }
  }, [
    localProjectScopeInteraction,
    reloadDesignFiles,
    selectedSessionId,
    sendUiDesignerConversationMessage,
    workspaceId,
  ]);

  const submitLocalStageInteraction = useCallback(async (response: unknown) => {
    const activeInteraction = localStageInteraction;
    if (!workspaceId || !activeInteraction || !isRecord(response) || response.kind !== "form") {
      return false;
    }

    const interactionId = activeInteraction.interaction.interactionId;
    setReplyingInteractionId(interactionId);
    setErrorMessage(null);

    try {
      const stageResult = await requestStageResult({
        stageKey: activeInteraction.stageKey,
        values: isRecord(response.values) ? response.values : {},
        context: buildUiDesignerContext({
          workspaceId,
          selectedWorkspace,
          designerState,
          designFiles,
          focusBlock: activeInteraction.stageKey,
        }),
        ...resolveCurrentStageModelSelection(),
      });
      const normalized = normalizeStageResult(stageResult);

      if (Object.keys(normalized.files).length > 0) {
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: normalized.files,
        });
        setDesignerState(saved.state);
        await reloadDesignFiles(workspaceId);
      }

      setLocalStageInteraction(null);
      if (normalized.nextSuggestedStage) {
        setSuggestedStageKey(normalized.nextSuggestedStage);
      }
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setReplyingInteractionId((current) => current === interactionId ? null : current);
    }
  }, [
    designFiles,
    designerState,
    localStageInteraction,
    reloadDesignFiles,
    resolveCurrentStageModelSelection,
    selectedWorkspace,
    workspaceId,
  ]);

  const answerInteraction = useCallback(async (interactionId: string, response: unknown) => {
    const normalizedInteractionId = interactionId.trim();
    if (!normalizedInteractionId) {
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_PROJECT_SCOPE_INTERACTION_ID) {
      await submitLocalProjectScopeInteraction(response);
      return;
    }

    if (normalizedInteractionId.startsWith("ui-designer:stage:")) {
      await submitLocalStageInteraction(response);
      return;
    }

    if (!selectedSessionId) {
      return;
    }

    setReplyingInteractionId(normalizedInteractionId);
    setErrorMessage(null);
    const stopPolling = startSessionDetailFallbackPolling(selectedSessionId, (detail) => {
      applySessionDetail(detail);
      setSendingMessage(detail.status === "active");
      if (detail.status !== "active") {
        void reloadDesignerState(detail.workspaceId);
      }
    });

    try {
      const result = await answerDesktopConversationInteraction({
        sessionId: selectedSessionId,
        interactionId: normalizedInteractionId,
        response,
      });
      stopPolling();
      applySessionDetail(result.detail);
      await reloadSessions(result.detail.workspaceId, result.detail.sessionId);
      await reloadComposerModels(result.detail);
      await reloadDesignerState(result.detail.workspaceId);
    } catch (error) {
      stopPolling();
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
    }
  }, [
    applySessionDetail,
    reloadComposerModels,
    reloadDesignFiles,
    reloadDesignerState,
    reloadSessions,
    selectedSessionId,
    startSessionDetailFallbackPolling,
    submitLocalProjectScopeInteraction,
    submitLocalStageInteraction,
  ]);

  const rejectInteraction = useCallback(async (interactionId: string) => {
    const normalizedInteractionId = interactionId.trim();
    if (!normalizedInteractionId) {
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_PROJECT_SCOPE_INTERACTION_ID) {
      setLocalProjectScopeInteraction(null);
      return;
    }

    if (normalizedInteractionId.startsWith("ui-designer:stage:")) {
      setLocalStageInteraction(null);
      return;
    }

    if (!selectedSessionId) {
      return;
    }

    setReplyingInteractionId(normalizedInteractionId);
    setErrorMessage(null);
    const stopPolling = startSessionDetailFallbackPolling(selectedSessionId, (detail) => {
      applySessionDetail(detail);
      setSendingMessage(detail.status === "active");
      if (detail.status !== "active") {
        void reloadDesignerState(detail.workspaceId);
      }
    });

    try {
      const result = await rejectDesktopConversationInteraction({
        sessionId: selectedSessionId,
        interactionId: normalizedInteractionId,
      });
      stopPolling();
      applySessionDetail(result.detail);
      await reloadSessions(result.detail.workspaceId, result.detail.sessionId);
      await reloadComposerModels(result.detail);
      await reloadDesignerState(result.detail.workspaceId);
    } catch (error) {
      stopPolling();
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
    }
  }, [
    applySessionDetail,
    reloadComposerModels,
    reloadDesignerState,
    reloadSessions,
    selectedSessionId,
    startSessionDetailFallbackPolling,
  ]);

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
          setErrorMessage(error instanceof Error ? error.message : String(error));
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
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });
  }, [
    composerModelOptions,
    saveWorkspaceSettings,
    workspaceSettings.selectedChannelId,
    workspaceSettings.selectedModelId,
  ]);

  const openProjectScopeInteraction = useCallback(async () => {
    if (localProjectScopeInteraction?.sessionId === selectedSessionId) {
      return;
    }

    const currentScope = parseProjectScopeJson(designFiles.scopeJson);
    let sessionId = selectedSessionId;
    if (!sessionId) {
      const created = await createSession({
        prefillDraft: "",
      });
      sessionId = created?.sessionId;
    }

    if (!sessionId) {
      return;
    }

    const now = Date.now();
    setLocalProjectScopeInteraction({
      sessionId,
      interaction: {
        interactionId: UI_DESIGNER_PROJECT_SCOPE_INTERACTION_ID,
        sessionId,
        runId: selectedSessionDetail?.lastRunId ?? selectedSession?.lastRunId ?? "ui-designer-project-scope",
        kind: "form",
        status: "pending",
        request: buildProjectScopeInteractionRequest(currentScope),
        createdAt: now,
        updatedAt: now,
        metadata: {
          moduleId: "ui-designer",
          surface: "ui-designer",
          focusBlock: "projectScope",
        },
      },
    });
  }, [createSession, designFiles.scopeJson, localProjectScopeInteraction, selectedSession, selectedSessionDetail, selectedSessionId]);

  const clearSuggestedStageKey = useCallback(() => {
    setSuggestedStageKey(null);
  }, []);

  const openStageDialog = useCallback(async (stageKey: string) => {
    const normalizedStageKey = stageKey as UiDesignerStageKey;
    const stage = stageViewModels.find((item) => item.stageKey === normalizedStageKey);
    if (!stage) {
      return;
    }

    const stageDraft = normalizedStageKey === "projectScope"
      ? buildProjectScopeDraft(normalizeProjectScopeFormValues(scope))
      : buildUiDesignerStageDraft(stage);

    if (!selectedSessionId) {
      await createSession({
        prefillDraft: stageDraft,
        prefillFocusBlock: normalizedStageKey,
      });
      return;
    }

    setDraftMessage(stageDraft);
    setComposerFocusBlock(normalizedStageKey);
  }, [
    createSession,
    scope,
    selectedSessionId,
    stageViewModels,
  ]);

  return {
    bridgeAvailable,
    canResetConversation,
    canSwitchWorkspace,
    composerAttachments,
    composerModelOptions,
    composerModelSelectOptions,
    creatingSession,
    designFiles,
    designerState,
    draftMessage,
    errorMessage,
    activeLocalInteractionId,
    activeLocalInteractionRequest,
    loadingDesignerState,
    loadingSessionDetail,
    loadingSessions,
    loadingWorkspaces,
    modelsBridgeAvailable,
    layouts,
    patterns,
    pendingStageKey,
    pages,
    resettingConversation,
    replyingInteractionId,
    scope,
    selectedSession,
    selectedComposerModelValue,
    selectedSessionDetail: selectedSessionDetailForView,
    selectedWorkspace,
    sessions,
    sendingMessage,
    stageViewModels,
    suggestedStageKey,
    stoppingMessage: selectedExecutionView.isStopping,
    sourcesMarkdown,
    stack,
    theme,
    workspaceSettings,
    workspaceId,
    workspaces,
    createSession,
    reloadDesignerState,
    reloadSessions,
    reloadWorkspaces,
    selectWorkspace,
    attachComposerFiles,
    clearSuggestedStageKey,
    openStageDialog,
    removeComposerAttachment,
    resetConversation,
    answerInteraction,
    rejectInteraction,
    sendMessage,
    stopMessage,
    setDraftMessage,
    setSelectedComposerModelValue,
  };
}

export type UiDesignerShellState = ReturnType<typeof useUiDesignerShellState>;
