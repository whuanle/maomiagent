import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopWechatPort,
} from "../../index";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import type {
  DesktopConversationAttachmentInput,
  DesktopConversationCommandPort,
  DesktopConversationSessionDetail,
} from "../../../conversation";
import type { DesktopModelsQueryPort } from "../../../models";
import type {
  WechatAccountStatusInput,
  WechatConversationMediaSendInput,
  WechatConversationMediaSendResult,
  WechatConversationRuntimeContextView,
  WechatConversationTextSendInput,
  WechatConversationTextSendResult,
  WechatConfigInput,
  WechatLoginSessionView,
  WechatMediaAssetView,
  WechatQrLoginPollInput,
  WechatQrLoginPollResult,
  WechatQrLoginStartInput,
  WechatQrLoginStartResult,
  WechatStateView,
} from "../../../../../shared/desktop-wechat";
import { FULLY_MANAGED_AGENT_ID } from "../../../../../shared/conversation/managed-execution";
import {
  fetchWechatBotQrCode,
  fetchWechatQrLoginStatus,
  getWechatUpdates,
  sendWechatMediaFile,
  sendWechatTextMessage,
  type WechatInboundMessage,
  verifyWechatConfigEndpoint,
} from "./wechat-api-client";
import { saveWechatInboundMediaItem } from "./wechat-media";

type WechatConversationBindingRecord = WechatStateView["bindings"][number] & {
  runtimeSessionVersion?: string;
};

type WechatModuleStorage = {
  version: string;
  updatedAt: string;
  config: {
    baseUrl: string;
    cdnBaseUrl: string;
    routeTag?: string;
    selectedWorkspaceId?: string;
    executionWorkspaceMode?: "home" | "default-linked" | "auto";
    defaultExecutionWorkspaceId?: string;
    allowWorkspaceSwitch?: boolean;
    workspaceSwitchScope?: "all" | "restricted";
    allowedExecutionWorkspaceIds?: string[];
    selectedChannelId?: string;
    selectedModelId?: string;
    debugAccountIds?: string[];
  };
  accounts: Array<{
    accountId: string;
    userId?: string;
    token?: string;
    enabled: boolean;
    baseUrl?: string;
    savedAt?: string;
    updatedAt: string;
    lastInboundAt?: string;
    lastOutboundAt?: string;
    lastError?: string;
    pausedUntil?: string;
  }>;
  bindings: WechatConversationBindingRecord[];
  processedMessages: WechatStateView["processedMessages"];
  loginSessions: Array<{
    sessionKey: string;
    accountId?: string;
    qrcode: string;
    qrcodeUrl?: string;
    status: WechatLoginSessionView["status"];
    message: string;
    startedAt: string;
    expiresAt: string;
    updatedAt: string;
  }>;
};

const DEFAULT_WECHAT_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_WECHAT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const WECHAT_LOGIN_TTL_MS = 5 * 60 * 1000;
const WECHAT_MESSAGE_RETENTION = 400;
const WECHAT_TEXT_CHUNK_SIZE = 3200;
const WECHAT_RUNTIME_SESSION_VERSION = "wechat-capabilities-v1";

type WechatMonitorHandle = {
  abortController: AbortController;
  promise: Promise<void>;
};

type QueuedWechatMessage = {
  accountId: string;
  peerId: string;
  conversationKey: string;
  messageId: string;
  text: string;
  createdAt: string;
  contextToken?: string;
};

type WechatRuntimeModelSelection = {
  selectedChannelId?: string;
  selectedModelId?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function compactPreview(value: string, limit = 160): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function splitReplyText(input: string): string[] {
  const text = input.trim();
  if (!text) {
    return [];
  }

  if (text.length <= WECHAT_TEXT_CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  let current = "";
  const blocks = text.split(/\n{2,}/);

  for (const block of blocks) {
    const normalized = block.trim();
    if (!normalized) {
      continue;
    }

    const candidate = current ? `${current}\n\n${normalized}` : normalized;
    if (candidate.length <= WECHAT_TEXT_CHUNK_SIZE) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (normalized.length <= WECHAT_TEXT_CHUNK_SIZE) {
      current = normalized;
      continue;
    }

    for (let start = 0; start < normalized.length; start += WECHAT_TEXT_CHUNK_SIZE) {
      chunks.push(normalized.slice(start, start + WECHAT_TEXT_CHUNK_SIZE));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function isMessageItemMedia(item: NonNullable<WechatInboundMessage["item_list"]>[number]): boolean {
  return item.type === 2 || item.type === 3 || item.type === 4 || item.type === 5;
}

function buildMessageItemSummary(
  item: NonNullable<WechatInboundMessage["item_list"]>[number],
  depth = 0,
): string | undefined {
  if (depth > 3) {
    return undefined;
  }

  const quotedTitle = trimText(item.ref_msg?.title);
  const quotedItem = item.ref_msg?.message_item;
  const quotedSummary = quotedItem
    ? buildMessageItemSummary(quotedItem, depth + 1)
    : undefined;
  const quotedProjection = quotedTitle || quotedSummary
    ? `\n[引用] ${quotedTitle ?? ""}${quotedSummary ? `\n${quotedSummary}` : ""}`.trim()
    : "";

  if (item.type === 1) {
    const text = trimText(item.text_item?.text);
    return text ? `${text}${quotedProjection}` : undefined;
  }

  if (item.type === 2) {
    return `[收到图片消息]${quotedProjection}`;
  }

  if (item.type === 3) {
    const voiceText = trimText(item.voice_item?.text);
    const voiceSummary = voiceText ? `[收到语音消息] ${voiceText}` : "[收到语音消息]";
    return `${voiceSummary}${quotedProjection}`;
  }

  if (item.type === 4) {
    return `[收到文件消息]${quotedProjection}`;
  }

  if (item.type === 5) {
    return `[收到视频消息]${quotedProjection}`;
  }

  if (quotedItem && isMessageItemMedia(quotedItem)) {
    return `[引用媒体消息]${quotedProjection}`;
  }

  return undefined;
}

function buildInboundMessageText(message: WechatInboundMessage): string | undefined {
  const parts = (message.item_list ?? [])
    .map((item) => buildMessageItemSummary(item))
    .filter((item): item is string => Boolean(item));

  if (parts.length === 0) {
    return undefined;
  }

  return compactPreview(parts.join("\n"), 1200);
}

function isProgressCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "/progress"
    || normalized === "/状态"
    || normalized === "/进度";
}

function parseEchoCommand(text: string): string | undefined {
  const normalized = text.trim();
  if (!normalized.toLowerCase().startsWith("/echo")) {
    return undefined;
  }

  return normalized.slice(5).trim();
}

function parseDebugCommand(text: string): "toggle" | "on" | "off" | undefined {
  const normalized = text.trim().toLowerCase();
  if (normalized === "/toggle-debug") {
    return "toggle";
  }
  if (normalized === "/debug-on") {
    return "on";
  }
  if (normalized === "/debug-off") {
    return "off";
  }
  return undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => trimText(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeWechatBindingRecord(value: unknown): WechatConversationBindingRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const key = trimText(record.key);
  const accountId = trimText(record.accountId);
  const peerId = trimText(record.peerId);
  const workspaceId = trimText(record.workspaceId);
  const sessionId = trimText(record.sessionId);
  const createdAt = trimText(record.createdAt);
  const updatedAt = trimText(record.updatedAt);
  if (!key || !accountId || !peerId || !workspaceId || !sessionId || !createdAt || !updatedAt) {
    return undefined;
  }

  return {
    key,
    accountId,
    peerId,
    homeWorkspaceId: trimText(record.homeWorkspaceId),
    workspaceId,
    sessionId,
    createdAt,
    updatedAt,
    lastMessageId: trimText(record.lastMessageId),
    lastInboundPreview: trimText(record.lastInboundPreview),
    lastContextToken: trimText(record.lastContextToken),
    runtimeSessionVersion: trimText(record.runtimeSessionVersion),
  };
}

function toWechatBindingView(item: WechatConversationBindingRecord): WechatStateView["bindings"][number] {
  return {
    key: item.key,
    accountId: item.accountId,
    peerId: item.peerId,
    homeWorkspaceId: item.homeWorkspaceId,
    workspaceId: item.workspaceId,
    sessionId: item.sessionId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastMessageId: item.lastMessageId,
    lastInboundPreview: item.lastInboundPreview,
    lastContextToken: item.lastContextToken,
  };
}

function buildWechatConversationSettings(): Record<string, unknown> {
  return {
    capabilityPreferences: {
      "mcp.runtime": true,
      "skills.runtime": true,
      "wechat.runtime": true,
    },
  };
}

function isCurrentWechatRuntimeSession(binding: WechatConversationBindingRecord): boolean {
  return binding.runtimeSessionVersion === WECHAT_RUNTIME_SESSION_VERSION;
}

function toConversationAttachmentKind(kind: WechatMediaAssetView["kind"]): DesktopConversationAttachmentInput["kind"] {
  switch (kind) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "voice":
      return "audio";
    default:
      return "file";
  }
}

function createEmptyStorage(): WechatModuleStorage {
  return {
    version: "1.0",
    updatedAt: nowIso(),
    config: {
      baseUrl: DEFAULT_WECHAT_BASE_URL,
      cdnBaseUrl: DEFAULT_WECHAT_CDN_BASE_URL,
      executionWorkspaceMode: "home",
      workspaceSwitchScope: "all",
      allowWorkspaceSwitch: false,
      allowedExecutionWorkspaceIds: [],
      debugAccountIds: [],
    },
    accounts: [],
    bindings: [],
    processedMessages: [],
    loginSessions: [],
  };
}

function normalizeStorage(raw: unknown): WechatModuleStorage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyStorage();
  }

  const input = raw as Record<string, unknown>;
  const base = createEmptyStorage();
  const configRaw = input.config && typeof input.config === "object" && !Array.isArray(input.config)
    ? input.config as Record<string, unknown>
    : {};

  const storage: WechatModuleStorage = {
    version: trimText(input.version) ?? base.version,
    updatedAt: trimText(input.updatedAt) ?? base.updatedAt,
    config: {
      baseUrl: trimText(configRaw.baseUrl) ?? DEFAULT_WECHAT_BASE_URL,
      cdnBaseUrl: trimText(configRaw.cdnBaseUrl) ?? DEFAULT_WECHAT_CDN_BASE_URL,
      routeTag: trimText(configRaw.routeTag),
      selectedWorkspaceId: trimText(configRaw.selectedWorkspaceId),
      executionWorkspaceMode:
        configRaw.executionWorkspaceMode === "home"
        || configRaw.executionWorkspaceMode === "default-linked"
        || configRaw.executionWorkspaceMode === "auto"
          ? configRaw.executionWorkspaceMode
          : "home",
      defaultExecutionWorkspaceId: trimText(configRaw.defaultExecutionWorkspaceId),
      allowWorkspaceSwitch: configRaw.allowWorkspaceSwitch === true,
      workspaceSwitchScope:
        configRaw.workspaceSwitchScope === "restricted"
          ? "restricted"
          : "all",
      allowedExecutionWorkspaceIds: normalizeStringList(configRaw.allowedExecutionWorkspaceIds),
      selectedChannelId: trimText(configRaw.selectedChannelId),
      selectedModelId: trimText(configRaw.selectedModelId),
      debugAccountIds: normalizeStringList(configRaw.debugAccountIds),
    },
    accounts: Array.isArray(input.accounts)
      ? input.accounts
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .map((item) => ({
            accountId: trimText(item.accountId) ?? "",
            userId: trimText(item.userId),
            token: trimText(item.token),
            enabled: item.enabled !== false,
            baseUrl: trimText(item.baseUrl),
            savedAt: trimText(item.savedAt),
            updatedAt: trimText(item.updatedAt) ?? nowIso(),
            lastInboundAt: trimText(item.lastInboundAt),
            lastOutboundAt: trimText(item.lastOutboundAt),
            lastError: trimText(item.lastError),
            pausedUntil: trimText(item.pausedUntil),
          }))
          .filter((item) => item.accountId.length > 0)
      : [],
    bindings: Array.isArray(input.bindings)
      ? input.bindings
          .map((item) => normalizeWechatBindingRecord(item))
          .filter((item): item is WechatConversationBindingRecord => Boolean(item))
      : [],
    processedMessages: Array.isArray(input.processedMessages)
      ? input.processedMessages as WechatStateView["processedMessages"]
      : [],
    loginSessions: Array.isArray(input.loginSessions)
      ? input.loginSessions
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .map((item) => ({
            sessionKey: trimText(item.sessionKey) ?? "",
            accountId: trimText(item.accountId),
            qrcode: trimText(item.qrcode) ?? "",
            qrcodeUrl: trimText(item.qrcodeUrl),
            status: mapLoginStatus(trimText(item.status)),
            message: trimText(item.message) ?? "",
            startedAt: trimText(item.startedAt) ?? nowIso(),
            expiresAt: trimText(item.expiresAt) ?? nowIso(),
            updatedAt: trimText(item.updatedAt) ?? nowIso(),
          }))
          .filter((item) => item.sessionKey.length > 0 && item.qrcode.length > 0)
      : [],
  };

  return storage;
}

function buildWechatCatalog(): WechatStateView["catalog"] {
  return {
    alignment: "openclaw-weixin",
    transportMode: "long-poll",
    mediaWorkspaceRelativeDir: ".maomi/wechat-media",
    descriptors: [
      {
        kind: "qr_login",
        status: "available",
        title: "QR Login",
        description: "Supports QR-code login and account credential persistence.",
        surfaces: ["runtime", "channel-monitor"],
      },
      {
        kind: "long_poll_updates",
        status: "available",
        title: "Long Poll Updates",
        description: "Receives inbound WeChat messages through getupdates long polling.",
        surfaces: ["runtime", "channel-monitor"],
      },
      {
        kind: "formal_workspace_home",
        status: "available",
        title: "Formal Workspace Home",
        description: "Maps each WeChat conversation into a stable home workspace so memory and long-running work stay isolated per user.",
        surfaces: ["runtime", "mcp", "conversation-context"],
      },
      {
        kind: "message_item_text_send",
        status: "available",
        title: "Text Send",
        description: "Sends text replies to WeChat and auto-splits long responses safely.",
        surfaces: ["runtime"],
      },
      {
        kind: "message_item_image_send",
        status: "available",
        title: "Image Send",
        description: "Uploads and sends image media items through WeChat CDN.",
        surfaces: ["runtime", "mcp"],
      },
      {
        kind: "message_item_video_send",
        status: "available",
        title: "Video Send",
        description: "Uploads and sends video media items through WeChat CDN.",
        surfaces: ["runtime", "mcp"],
      },
      {
        kind: "message_item_file_send",
        status: "available",
        title: "File Send",
        description: "Uploads and sends generic file media items through WeChat CDN.",
        surfaces: ["runtime", "mcp"],
      },
      {
        kind: "context_token_continuation",
        status: "available",
        title: "Context Token Continuation",
        description: "Persists and reuses context_token to keep replies within the same thread.",
        surfaces: ["runtime", "channel-monitor"],
      },
      {
        kind: "slash_command_handling",
        status: "available",
        title: "Slash Command Handling",
        description: "Handles /progress, /echo and debug toggle commands before entering AI conversation flow.",
        surfaces: ["runtime", "channel-monitor"],
      },
      {
        kind: "session_progress_snapshot",
        status: "available",
        title: "Session Progress Snapshot",
        description: "Exposes running-session and queue progress for the current WeChat home workspace through runtime context and MCP tools.",
        surfaces: ["runtime", "mcp", "conversation-context"],
      },
      {
        kind: "inbound_media_materialization",
        status: "available",
        title: "Inbound Media Materialization",
        description: "Downloads, decrypts, and saves inbound image, voice, file, and video items into the workspace.",
        surfaces: ["runtime", "conversation-context"],
      },
      {
        kind: "voice_transcode",
        status: "partial",
        title: "Voice Transcode",
        description: "Attempts SILK-to-WAV conversion and falls back to raw SILK when decoder is unavailable.",
        surfaces: ["runtime", "conversation-context", "gap"],
        notes: [
          "Still does not provide transcript parity with openclaw.",
          "Runtime falls back to raw SILK when silk-wasm is unavailable or decode fails.",
        ],
      },
      {
        kind: "media_cdn_download",
        status: "available",
        title: "Media CDN Download",
        description: "Resolves encrypted CDN download parameters and decrypts inbound media in desktop runtime.",
        surfaces: ["runtime"],
      },
      {
        kind: "media_cdn_upload",
        status: "available",
        title: "Media CDN Upload",
        description: "Negotiates upload parameters and uploads encrypted media to WeChat CDN.",
        surfaces: ["runtime", "mcp"],
      },
      {
        kind: "media_asset_index",
        status: "available",
        title: "Media Asset Index",
        description: "Builds recent media index per conversation for tools and MCP context consumption.",
        surfaces: ["runtime", "mcp", "conversation-context"],
      },
      {
        kind: "quoted_message_projection",
        status: "available",
        title: "Quoted Message Projection",
        description: "Projects quoted text/media references into inbound prompt text.",
        surfaces: ["runtime", "conversation-context"],
      },
      {
        kind: "quoted_media_fallback",
        status: "available",
        title: "Quoted Media Fallback",
        description: "Falls back to quoted media markers when primary item list has no direct text payload.",
        surfaces: ["runtime", "conversation-context"],
      },
      {
        kind: "debug_timing_trace",
        status: "available",
        title: "Debug Timing Trace",
        description: "Supports per-account debug timing trace via in-channel debug commands.",
        surfaces: ["runtime", "channel-monitor"],
      },
      {
        kind: "delivery_error_notice",
        status: "partial",
        title: "Delivery Error Notice",
        description: "Runtime logs and stores failures, but channel-facing outbound fallback/error notices are still less explicit than openclaw.",
        surfaces: ["runtime", "gap"],
      },
      {
        kind: "vision_analysis",
        status: "partial",
        title: "Vision Analysis",
        description: "Saved WeChat images can be analyzed through a vision-capable model selected at runtime.",
        surfaces: ["mcp"],
        notes: [
          "Requires at least one enabled multimodal model.",
          "Inbound media is now bridged into the main chat pipeline as conversation attachments.",
        ],
      },
      {
        kind: "multimodal_message_input",
        status: "available",
        title: "Native Multimodal Input",
        description: "Inbound WeChat image, voice, video, and file media are promoted to first-class conversation attachments for the main conversation pipeline.",
        surfaces: ["runtime", "conversation-context"],
      },
    ],
  };
}

function mapLoginStatus(status: string | undefined): WechatLoginSessionView["status"] {
  if (status === "wait" || status === "pending") {
    return "wait";
  }
  if (status === "scaned" || status === "scanned") {
    return "scanned";
  }
  if (status === "confirmed") {
    return "confirmed";
  }
  if (status === "expired") {
    return "expired";
  }
  return "failed";
}

function inferAccountConnectionStatus(input: {
  enabled: boolean;
  token?: string;
  lastError?: string;
  pausedUntil?: string;
}): WechatStateView["accounts"][number]["connectionStatus"] {
  if (!input.enabled) {
    return "offline";
  }

  if (trimText(input.pausedUntil)) {
    return "paused";
  }

  if (trimText(input.lastError)) {
    return "error";
  }

  if (trimText(input.token)) {
    return "connected";
  }

  return "connecting";
}

export class DesktopWechatService implements DesktopWechatPort {
  private storagePath: string;
  private storage: WechatModuleStorage = createEmptyStorage();
  private loadPromise: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly monitors = new Map<string, WechatMonitorHandle>();
  private readonly updatesBufferByAccount = new Map<string, string>();
  private readonly conversationQueues = new Map<string, Promise<void>>();
  private readonly conversationPendingCounts = new Map<string, number>();

  constructor(
    private readonly configuration: DesktopConfigurationPort,
    private readonly logger: RuntimeLogger,
    private readonly conversationCommand: DesktopConversationCommandPort,
    private readonly workspaceQuery: Pick<DesktopWorkspaceQueryPort, "list">,
    private readonly modelsQuery: Pick<DesktopModelsQueryPort, "getRuntimeSelectionSnapshot">,
  ) {
    this.storagePath = configuration.getString("wechat.state.path")
      ?? join(homedir(), ".maomiagent", "desktop", "data", "wechat-state.json");
    this.loadPromise = this.loadStorage().then(() => this.syncMonitors());
  }

  private async normalizeStoredRuntimeModelSelection(
    options: {
      persist?: boolean;
    } = {},
  ): Promise<WechatRuntimeModelSelection> {
    const currentSelection: WechatRuntimeModelSelection = {
      selectedChannelId: trimText(this.storage.config.selectedChannelId),
      selectedModelId: trimText(this.storage.config.selectedModelId),
    };

    if (!currentSelection.selectedChannelId && !currentSelection.selectedModelId) {
      return currentSelection;
    }

    let snapshot;
    try {
      snapshot = await this.modelsQuery.getRuntimeSelectionSnapshot();
    } catch (error) {
      await this.logger.warn("desktop wechat failed to inspect runtime model fallback", {
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
      return currentSelection;
    }

    const availableModels = snapshot.models.filter((item) => item.effectiveEnabled);
    const exactMatch = currentSelection.selectedChannelId && currentSelection.selectedModelId
      ? availableModels.find((item) =>
          item.channelId === currentSelection.selectedChannelId
          && item.value === currentSelection.selectedModelId,
        )
      : undefined;

    const resolvedCurrentCandidate = exactMatch
      ?? (
        currentSelection.selectedChannelId && !currentSelection.selectedModelId
          ? availableModels.find((item) => item.channelId === currentSelection.selectedChannelId)
          : undefined
      )
      ?? (() => {
        if (!currentSelection.selectedModelId || currentSelection.selectedChannelId) {
          return undefined;
        }

        const matchedByModel = availableModels.filter((item) => item.value === currentSelection.selectedModelId);
        return matchedByModel.length === 1 ? matchedByModel[0] : undefined;
      })();

    const defaultCandidate = snapshot.defaultSelection.channelId && snapshot.defaultSelection.modelId
      ? availableModels.find((item) =>
          item.channelId === snapshot.defaultSelection.channelId
          && item.value === snapshot.defaultSelection.modelId,
        )
      : undefined;

    const fallbackCandidate = resolvedCurrentCandidate
      ?? (
        currentSelection.selectedChannelId
          ? availableModels.find((item) => item.channelId === currentSelection.selectedChannelId)
          : undefined
      )
      ?? defaultCandidate
      ?? availableModels[0];

    const nextSelection: WechatRuntimeModelSelection = {
      selectedChannelId: fallbackCandidate?.channelId,
      selectedModelId: fallbackCandidate?.value,
    };

    const changed = nextSelection.selectedChannelId !== currentSelection.selectedChannelId
      || nextSelection.selectedModelId !== currentSelection.selectedModelId;

    if (!changed) {
      return currentSelection;
    }

    this.storage.config.selectedChannelId = nextSelection.selectedChannelId;
    this.storage.config.selectedModelId = nextSelection.selectedModelId;
    this.storage.updatedAt = nowIso();

    await this.logger.warn("desktop wechat runtime model selection fell back to an available model", {
      attributes: {
        previousSelectedChannelId: currentSelection.selectedChannelId,
        previousSelectedModelId: currentSelection.selectedModelId,
        selectedChannelId: nextSelection.selectedChannelId,
        selectedModelId: nextSelection.selectedModelId,
      },
    });

    if (options.persist) {
      await this.persistStorage();
    }

    return nextSelection;
  }

  async getState(): Promise<WechatStateView> {
    await this.ensureLoaded();
    await this.normalizeStoredRuntimeModelSelection({ persist: true });
    return this.toWechatStateView();
  }

  async saveConfig(input: WechatConfigInput): Promise<WechatStateView> {
    await this.ensureLoaded();

    const nextBaseUrl = trimText(input.baseUrl) ?? this.storage.config.baseUrl;
    const nextRouteTag = trimText(input.routeTag) ?? undefined;

    await verifyWechatConfigEndpoint({
      baseUrl: nextBaseUrl,
      routeTag: nextRouteTag,
      timeoutMs: 8_000,
    });

    this.storage.config = {
      ...this.storage.config,
      baseUrl: nextBaseUrl,
      cdnBaseUrl: trimText(input.cdnBaseUrl) ?? this.storage.config.cdnBaseUrl,
      routeTag: nextRouteTag,
      selectedWorkspaceId: trimText(input.selectedWorkspaceId) ?? this.storage.config.selectedWorkspaceId,
      executionWorkspaceMode:
        input.executionWorkspaceMode === "home"
        || input.executionWorkspaceMode === "default-linked"
        || input.executionWorkspaceMode === "auto"
          ? input.executionWorkspaceMode
          : this.storage.config.executionWorkspaceMode,
      defaultExecutionWorkspaceId:
        trimText(input.defaultExecutionWorkspaceId) ?? this.storage.config.defaultExecutionWorkspaceId,
      allowWorkspaceSwitch: input.allowWorkspaceSwitch === true,
      workspaceSwitchScope:
        input.workspaceSwitchScope === "restricted"
          ? "restricted"
          : "all",
      allowedExecutionWorkspaceIds: normalizeStringList(input.allowedExecutionWorkspaceIds),
      selectedChannelId: trimText(input.selectedChannelId),
      selectedModelId: trimText(input.selectedModelId),
      debugAccountIds: normalizeStringList(input.debugAccountIds),
    };

    await this.normalizeStoredRuntimeModelSelection();
    this.storage.updatedAt = nowIso();
    await this.persistStorage();
    await this.syncMonitors();

    return this.toWechatStateView();
  }

  async startQrLogin(input: WechatQrLoginStartInput = {}): Promise<WechatQrLoginStartResult> {
    await this.ensureLoaded();

    const accountId = trimText(input.accountId);
    const latest = this.storage.loginSessions.find((item) =>
      item.status === "pending" || item.status === "wait" || item.status === "scanned",
    );

    if (latest && input.force !== true) {
      return {
        sessionKey: latest.sessionKey,
        message: "已存在待确认二维码，继续使用当前会话",
        item: this.toLoginSessionView(latest),
      };
    }

    const qr = await fetchWechatBotQrCode({
      baseUrl: this.storage.config.baseUrl,
      routeTag: this.storage.config.routeTag,
      botType: "3",
    });

    if (!trimText(qr.qrcode)) {
      throw new Error("微信服务未返回可用二维码");
    }

    const startedAt = nowIso();
    const expiresAt = new Date(Date.now() + WECHAT_LOGIN_TTL_MS).toISOString();
    const sessionKey = `wechat-login-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const loginSession = {
      sessionKey,
      accountId,
      qrcode: qr.qrcode!.trim(),
      qrcodeUrl: trimText(qr.qrcode_img_content),
      status: "wait" as const,
      message: "等待扫码",
      startedAt,
      expiresAt,
      updatedAt: startedAt,
    };

    this.storage.loginSessions = [loginSession, ...this.storage.loginSessions]
      .slice(0, 16);
    this.storage.updatedAt = nowIso();
    await this.persistStorage();

    return {
      sessionKey,
      message: "二维码已生成",
      item: this.toLoginSessionView(loginSession),
    };
  }

  async pollQrLogin(input: WechatQrLoginPollInput): Promise<WechatQrLoginPollResult> {
    await this.ensureLoaded();

    const sessionKey = trimText(input.sessionKey);
    if (!sessionKey) {
      throw new Error("sessionKey is required");
    }

    const loginSession = this.storage.loginSessions.find((item) => item.sessionKey === sessionKey);
    if (!loginSession) {
      throw new Error("登录会话不存在或已过期");
    }

    const status = await fetchWechatQrLoginStatus({
      baseUrl: this.storage.config.baseUrl,
      routeTag: this.storage.config.routeTag,
      qrcode: loginSession.qrcode,
      timeoutMs: 20_000,
    });

    const normalizedStatus = mapLoginStatus(status.status);
    loginSession.status = normalizedStatus;
    loginSession.updatedAt = nowIso();

    let connected = false;
    let connectedAccountId: string | undefined;

    if (normalizedStatus === "confirmed") {
      connected = true;
      connectedAccountId = trimText(status.ilink_user_id)
        ?? loginSession.accountId
        ?? `wechat-${Math.random().toString(36).slice(2, 10)}`;

      const existingIndex = this.storage.accounts.findIndex((item) => item.accountId === connectedAccountId);
      const now = nowIso();
      const account = {
        accountId: connectedAccountId,
        userId: trimText(status.ilink_user_id),
        token: trimText(status.bot_token),
        enabled: true,
        baseUrl: trimText(status.baseurl) ?? this.storage.config.baseUrl,
        savedAt: now,
        updatedAt: now,
        lastInboundAt: this.storage.accounts[existingIndex]?.lastInboundAt,
        lastOutboundAt: this.storage.accounts[existingIndex]?.lastOutboundAt,
        lastError: undefined,
        pausedUntil: undefined,
      };

      if (existingIndex >= 0) {
        this.storage.accounts[existingIndex] = account;
      } else {
        this.storage.accounts.unshift(account);
      }

      loginSession.message = "扫码确认成功";
    } else if (normalizedStatus === "scanned") {
      loginSession.message = "已扫码，等待确认";
    } else if (normalizedStatus === "expired") {
      loginSession.message = "二维码已过期";
    } else if (normalizedStatus === "wait") {
      loginSession.message = "等待扫码";
    } else {
      loginSession.message = "登录状态异常";
    }

    this.storage.updatedAt = nowIso();
    await this.persistStorage();
    await this.syncMonitors();

    return {
      connected,
      message: loginSession.message,
      accountId: connectedAccountId,
      item: this.toLoginSessionView(loginSession),
      state: this.toWechatStateView(),
    };
  }

  async setAccountStatus(accountId: string, input: WechatAccountStatusInput): Promise<WechatStateView> {
    await this.ensureLoaded();

    const normalizedAccountId = trimText(accountId);
    if (!normalizedAccountId) {
      throw new Error("accountId is required");
    }

    const account = this.storage.accounts.find((item) => item.accountId === normalizedAccountId);
    if (!account) {
      throw new Error(`微信账号不存在: ${normalizedAccountId}`);
    }

    account.enabled = input.enabled === true;
    account.updatedAt = nowIso();
    this.storage.updatedAt = nowIso();
    await this.persistStorage();
    await this.syncMonitors();

    return this.toWechatStateView();
  }

  async clearAccountConversations(accountId: string): Promise<WechatStateView> {
    await this.ensureLoaded();

    const normalizedAccountId = trimText(accountId);
    if (!normalizedAccountId) {
      throw new Error("accountId is required");
    }

    this.storage.bindings = this.storage.bindings.filter((item) => item.accountId !== normalizedAccountId);
    this.storage.processedMessages = this.storage.processedMessages.filter((item) => item.accountId !== normalizedAccountId);
    for (const [conversationKey] of this.conversationQueues.entries()) {
      if (conversationKey.startsWith(`${normalizedAccountId}:`)) {
        this.conversationQueues.delete(conversationKey);
        this.conversationPendingCounts.delete(conversationKey);
      }
    }
    this.storage.updatedAt = nowIso();
    await this.persistStorage();

    return this.toWechatStateView();
  }

  async removeAccount(accountId: string): Promise<WechatStateView> {
    await this.ensureLoaded();

    const normalizedAccountId = trimText(accountId);
    if (!normalizedAccountId) {
      throw new Error("accountId is required");
    }

    this.storage.accounts = this.storage.accounts.filter((item) => item.accountId !== normalizedAccountId);
    this.storage.bindings = this.storage.bindings.filter((item) => item.accountId !== normalizedAccountId);
    this.storage.processedMessages = this.storage.processedMessages.filter((item) => item.accountId !== normalizedAccountId);
    for (const [conversationKey] of this.conversationQueues.entries()) {
      if (conversationKey.startsWith(`${normalizedAccountId}:`)) {
        this.conversationQueues.delete(conversationKey);
        this.conversationPendingCounts.delete(conversationKey);
      }
    }
    this.updatesBufferByAccount.delete(normalizedAccountId);
    this.storage.updatedAt = nowIso();
    await this.persistStorage();
    await this.syncMonitors();

    return this.toWechatStateView();
  }

  async getConversationRuntimeContext(
    sessionId: string,
  ): Promise<WechatConversationRuntimeContextView | undefined> {
    await this.ensureLoaded();

    const binding = this.resolveConversationRuntimeBinding(sessionId);
    if (!binding) {
      return undefined;
    }

    const recentMessages = this.storage.processedMessages
      .filter((item) => item.accountId === binding.accountId && item.peerId === binding.peerId)
      .slice(0, 20)
      .map((item) => ({
        ...item,
        ...(item.mediaAssets ? { mediaAssets: item.mediaAssets.map((asset) => ({ ...asset })) } : {}),
      }));
    const pendingMessageCount = this.conversationPendingCounts.get(binding.key)
      ?? recentMessages.filter((item) => item.status === "pending").length;

    return {
      sessionId: binding.sessionId,
      workspaceId: binding.workspaceId,
      accountId: binding.accountId,
      peerId: binding.peerId,
      bindingKey: binding.key,
      homeWorkspaceId: binding.homeWorkspaceId,
      lastContextToken: binding.lastContextToken,
      pendingMessageCount,
      recentMessages,
    };
  }

  async sendConversationText(
    input: WechatConversationTextSendInput,
  ): Promise<WechatConversationTextSendResult> {
    await this.ensureLoaded();

    const text = trimText(input.text);
    if (!text) {
      throw new Error("text is required");
    }

    const { binding, account } = this.requireConversationRuntimeTarget(input.sessionId);
    const contextToken = trimText(input.contextToken) ?? binding.lastContextToken;
    const clientId = await this.sendTextChunks({
      account,
      peerId: binding.peerId,
      text,
      contextToken,
    });

    const updatedAt = nowIso();
    binding.updatedAt = updatedAt;
    if (contextToken) {
      binding.lastContextToken = contextToken;
    }
    account.lastOutboundAt = updatedAt;
    account.updatedAt = updatedAt;
    this.storage.updatedAt = updatedAt;
    await this.persistStorage();

    return {
      clientId,
      contextToken,
    };
  }

  async sendConversationMedia(
    input: WechatConversationMediaSendInput,
  ): Promise<WechatConversationMediaSendResult> {
    await this.ensureLoaded();

    const filePath = trimText(input.filePath);
    if (!filePath) {
      throw new Error("filePath is required");
    }

    const { binding, account } = this.requireConversationRuntimeTarget(input.sessionId);
    const contextToken = trimText(input.contextToken) ?? binding.lastContextToken;
    const token = trimText(account.token);
    if (!token) {
      throw new Error("账号 token 缺失，无法发送微信媒体");
    }

    const sent = await sendWechatMediaFile({
      filePath,
      toUserId: binding.peerId,
      contextToken,
      caption: trimText(input.caption),
      cdnBaseUrl: this.storage.config.cdnBaseUrl,
      opts: {
        baseUrl: trimText(account.baseUrl) ?? this.storage.config.baseUrl,
        routeTag: this.storage.config.routeTag,
        token,
      },
    });

    const updatedAt = nowIso();
    binding.updatedAt = updatedAt;
    if (contextToken) {
      binding.lastContextToken = contextToken;
    }
    account.lastOutboundAt = updatedAt;
    account.updatedAt = updatedAt;
    this.storage.updatedAt = updatedAt;
    await this.persistStorage();

    return {
      ...sent,
      contextToken,
    };
  }

  private async ensureLoaded(): Promise<void> {
    await this.loadPromise;
  }

  private resolveConversationRuntimeBinding(sessionId: string): WechatConversationBindingRecord | undefined {
    const normalizedSessionId = trimText(sessionId);
    if (!normalizedSessionId) {
      return undefined;
    }

    return this.storage.bindings.find((item) => item.sessionId === normalizedSessionId);
  }

  private requireConversationRuntimeTarget(sessionId: string) {
    const binding = this.resolveConversationRuntimeBinding(sessionId);
    if (!binding) {
      throw new Error(`微信会话绑定不存在: ${sessionId}`);
    }

    const account = this.storage.accounts.find((item) => item.accountId === binding.accountId);
    if (!account) {
      throw new Error(`微信账号不存在: ${binding.accountId}`);
    }

    return {
      binding,
      account,
    };
  }

  private async loadStorage(): Promise<void> {
    try {
      await fs.mkdir(dirname(this.storagePath), { recursive: true });
      const raw = await fs.readFile(this.storagePath, "utf-8").catch(() => "");
      this.storage = raw.trim().length > 0
        ? normalizeStorage(JSON.parse(raw))
        : createEmptyStorage();
    } catch (error) {
      this.storage = createEmptyStorage();
      await this.logger.warn("Desktop wechat storage load failed, fallback to empty", {
        context: {
          error: error instanceof Error ? error.message : String(error),
          path: this.storagePath,
        },
      });
    }
  }

  private async persistStorage(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(dirname(this.storagePath), { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(this.storage, null, 2), "utf-8");
    });
    await this.writeQueue;
  }

  private async syncMonitors(): Promise<void> {
    const runnableAccounts = new Set(
      this.storage.accounts
        .filter((item) => item.enabled && Boolean(trimText(item.token)))
        .map((item) => item.accountId),
    );

    for (const accountId of runnableAccounts) {
      if (this.monitors.has(accountId)) {
        continue;
      }

      const abortController = new AbortController();
      const promise = this.monitorAccount(accountId, abortController.signal).finally(() => {
        const current = this.monitors.get(accountId);
        if (current?.promise === promise) {
          this.monitors.delete(accountId);
        }
      });

      this.monitors.set(accountId, {
        abortController,
        promise,
      });
    }

    for (const [accountId, handle] of this.monitors.entries()) {
      if (runnableAccounts.has(accountId)) {
        continue;
      }

      handle.abortController.abort();
      this.monitors.delete(accountId);
    }
  }

  private async monitorAccount(accountId: string, abortSignal: AbortSignal): Promise<void> {
    while (!abortSignal.aborted) {
      const account = this.storage.accounts.find((item) => item.accountId === accountId);
      const token = trimText(account?.token);

      if (!account || !account.enabled || !token) {
        return;
      }

      try {
        const updates = await getWechatUpdates({
          baseUrl: trimText(account.baseUrl) ?? this.storage.config.baseUrl,
          routeTag: this.storage.config.routeTag,
          token,
          getUpdatesBuf: this.updatesBufferByAccount.get(accountId) ?? "",
          timeoutMs: 35_000,
        });

        const nextBuffer = trimText(updates.get_updates_buf);
        if (nextBuffer) {
          this.updatesBufferByAccount.set(accountId, nextBuffer);
        }

        const changed = await this.consumeInboundMessages(accountId, updates.msgs ?? []);
        if (changed) {
          this.storage.updatedAt = nowIso();
          await this.persistStorage();
        }

        account.lastError = undefined;
      } catch (error) {
        account.lastError = error instanceof Error ? error.message : String(error);
        account.updatedAt = nowIso();
        this.storage.updatedAt = nowIso();
        await this.persistStorage();
        await this.logger.warn("Desktop wechat account monitor request failed", {
          context: {
            accountId,
            error: account.lastError,
          },
        });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 3_000);
        });
      }
    }
  }

  private async consumeInboundMessages(
    accountId: string,
    messages: WechatInboundMessage[],
  ): Promise<boolean> {
    if (!messages.length) {
      return false;
    }

    let changed = false;
    const account = this.storage.accounts.find((item) => item.accountId === accountId);

    for (const message of messages) {
      if (message.message_type !== 1) {
        continue;
      }

      const peerId = trimText(message.from_user_id);
      if (!peerId) {
        continue;
      }

      const text = compactPreview(
        buildInboundMessageText(message) ?? "",
      ) ?? buildInboundMessageText(message);

      if (!text) {
        continue;
      }

      const messageId = String(message.message_id ?? message.seq ?? `${Date.now()}-${Math.random()}`);
      const conversationKey = `${accountId}:${peerId}`;
      const exists = this.storage.processedMessages.some((item) =>
        item.accountId === accountId
        && item.peerId === peerId
        && item.messageId === messageId,
      );

      if (exists) {
        continue;
      }

      const createdAt = Number.isFinite(message.create_time_ms)
        ? new Date(Number(message.create_time_ms)).toISOString()
        : nowIso();

      const processedAt = nowIso();
      const processedMessage: WechatStateView["processedMessages"][number] = {
        accountId,
        peerId,
        messageId,
        conversationKey,
        status: "pending",
        queryPreview: text,
        responsePreview: "处理中",
        createdAt,
        updatedAt: processedAt,
      };

      const mediaAssets = await this.tryMaterializeInboundMediaAssets({
        accountId,
        peerId,
        messageId,
        message,
      });
      if (mediaAssets.length > 0) {
        processedMessage.mediaAssets = mediaAssets;
      }

      this.storage.processedMessages.unshift(processedMessage);
      this.storage.processedMessages = this.storage.processedMessages.slice(0, WECHAT_MESSAGE_RETENTION);

      if (account) {
        account.lastInboundAt = createdAt;
        account.updatedAt = processedAt;
      }

      const contextToken = trimText(message.context_token);

      this.enqueueConversationMessage({
        accountId,
        peerId,
        conversationKey,
        messageId,
        text,
        createdAt,
        contextToken,
      });

      changed = true;
    }

    return changed;
  }

  private async tryMaterializeInboundMediaAssets(input: {
    accountId: string;
    peerId: string;
    messageId: string;
    message: WechatInboundMessage;
  }): Promise<NonNullable<WechatStateView["processedMessages"][number]["mediaAssets"]>> {
    const account = this.storage.accounts.find((item) => item.accountId === input.accountId);
    const cdnBaseUrl = this.storage.config.cdnBaseUrl;
    const destinationDir = join(
      dirname(this.storagePath),
      "wechat-media",
      input.accountId,
      input.peerId,
    );

    const mediaAssets: NonNullable<WechatStateView["processedMessages"][number]["mediaAssets"]> = [];
    if (!account) {
      return mediaAssets;
    }

    for (const item of input.message.item_list ?? []) {
      try {
        const saved = await saveWechatInboundMediaItem({
          messageId: input.messageId,
          item,
          cdnBaseUrl,
          destinationDir,
        });
        if (saved) {
          mediaAssets.push(saved);
        }
      } catch (error) {
        await this.logger.warn("Desktop wechat inbound media materialization failed", {
          context: {
            accountId: input.accountId,
            peerId: input.peerId,
            messageId: input.messageId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return mediaAssets;
  }

  private enqueueConversationMessage(message: QueuedWechatMessage): void {
    const currentPending = this.conversationPendingCounts.get(message.conversationKey) ?? 0;
    this.conversationPendingCounts.set(message.conversationKey, currentPending + 1);

    const previous = this.conversationQueues.get(message.conversationKey) ?? Promise.resolve();
    let next: Promise<void>;
    next = previous
      .then(async () => this.processQueuedMessage(message))
      .catch(async (error) => {
        await this.logger.warn("Desktop wechat queued message process failed", {
          context: {
            accountId: message.accountId,
            peerId: message.peerId,
            messageId: message.messageId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      })
      .finally(() => {
        const remaining = Math.max(
          0,
          (this.conversationPendingCounts.get(message.conversationKey) ?? 1) - 1,
        );

        if (remaining === 0) {
          this.conversationPendingCounts.delete(message.conversationKey);
          if (this.conversationQueues.get(message.conversationKey) === next) {
            this.conversationQueues.delete(message.conversationKey);
          }
          return;
        }

        this.conversationPendingCounts.set(message.conversationKey, remaining);
      });

    this.conversationQueues.set(message.conversationKey, next);
  }

  private async processQueuedMessage(message: QueuedWechatMessage): Promise<void> {
    const account = this.storage.accounts.find((item) => item.accountId === message.accountId);
    const processedMessage = this.storage.processedMessages.find((item) =>
      item.accountId === message.accountId && item.messageId === message.messageId,
    );
    if (!account || !processedMessage) {
      return;
    }

    const startedAtMs = Date.now();
    const debugEnabled = this.isDebugAccountEnabled(message.accountId);

    try {
      const commandHandled = await this.tryHandleInboundCommand({
        account,
        message,
        processedMessage,
      });
      if (commandHandled) {
        this.storage.updatedAt = nowIso();
        await this.persistStorage();
        return;
      }

      const binding = await this.resolveOrCreateBinding({
        accountId: message.accountId,
        peerId: message.peerId,
        conversationKey: message.conversationKey,
        messageId: message.messageId,
        inboundText: message.text,
        createdAt: message.createdAt,
        contextToken: message.contextToken,
      });
      const modelSelection = await this.normalizeStoredRuntimeModelSelection({ persist: true });

      const result = await this.conversationCommand.sendMessage({
        sessionId: binding.sessionId,
        workspaceId: binding.workspaceId,
        text: message.text,
        attachments: await this.buildConversationAttachments(processedMessage),
        selectedAgentId: FULLY_MANAGED_AGENT_ID,
        selectedChannelId: modelSelection.selectedChannelId,
        selectedModelId: modelSelection.selectedModelId,
      });

      let replyText = extractAssistantReplyText(result.detail)
        ?? "已收到消息，正在处理中";

      if (debugEnabled) {
        const elapsed = Date.now() - startedAtMs;
        const queueDepth = Math.max(
          0,
          (this.conversationPendingCounts.get(message.conversationKey) ?? 1) - 1,
        );
        replyText = `${replyText}\n\n[debug] elapsed=${elapsed}ms queue=${queueDepth}`;
      }

      const token = trimText(account.token);
      if (!token) {
        throw new Error("账号 token 缺失，无法回发微信消息");
      }

      await this.sendTextChunks({
        account,
        peerId: message.peerId,
        text: replyText,
        contextToken: message.contextToken ?? binding.lastContextToken,
      });

      account.lastOutboundAt = nowIso();
      account.updatedAt = nowIso();
      account.lastError = undefined;

      processedMessage.status = "completed";
      processedMessage.responsePreview = compactPreview(replyText) ?? "已完成";
      processedMessage.updatedAt = nowIso();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      processedMessage.status = "failed";
      processedMessage.responsePreview = compactPreview(reason) ?? "处理失败";
      processedMessage.updatedAt = nowIso();
      account.lastError = reason;
      account.updatedAt = nowIso();
      await this.logger.warn("Desktop wechat inbound conversation relay failed", {
        context: {
          accountId: message.accountId,
          peerId: message.peerId,
          messageId: message.messageId,
          error: reason,
        },
      });

      await this.trySendDeliveryErrorNotice({
        account,
        peerId: message.peerId,
        contextToken: message.contextToken,
        reason,
      });
    }

    this.storage.updatedAt = nowIso();
    await this.persistStorage();
  }

  private async tryHandleInboundCommand(input: {
    account: WechatModuleStorage["accounts"][number];
    message: QueuedWechatMessage;
    processedMessage: WechatStateView["processedMessages"][number];
  }): Promise<boolean> {
    const text = input.message.text.trim();
    if (!text.startsWith("/")) {
      return false;
    }

    const echoBody = parseEchoCommand(text);
    if (echoBody !== undefined) {
      const reply = echoBody || "(空消息)";
      await this.sendTextChunks({
        account: input.account,
        peerId: input.message.peerId,
        text: reply,
        contextToken: input.message.contextToken,
      });
      input.processedMessage.status = "ignored";
      input.processedMessage.responsePreview = compactPreview(reply) ?? "已处理";
      input.processedMessage.updatedAt = nowIso();
      return true;
    }

    const debugCommand = parseDebugCommand(text);
    if (debugCommand) {
      const nextEnabled = this.setDebugAccountEnabled(
        input.message.accountId,
        debugCommand === "toggle" ? undefined : debugCommand === "on",
      );
      const reply = nextEnabled
        ? "已开启调试时序跟踪（debug timing trace）。"
        : "已关闭调试时序跟踪。";
      await this.sendTextChunks({
        account: input.account,
        peerId: input.message.peerId,
        text: reply,
        contextToken: input.message.contextToken,
      });
      input.processedMessage.status = "ignored";
      input.processedMessage.responsePreview = compactPreview(reply) ?? "已处理";
      input.processedMessage.updatedAt = nowIso();
      this.storage.updatedAt = nowIso();
      await this.persistStorage();
      return true;
    }

    if (!isProgressCommand(text)) {
      return false;
    }

    const pending = Math.max(
      0,
      (this.conversationPendingCounts.get(input.message.conversationKey) ?? 1) - 1,
    );
    const reply = pending > 0
      ? `当前还有 ${pending} 条消息在排队处理中，请稍候。`
      : "当前没有排队消息。";
    await this.sendTextChunks({
      account: input.account,
      peerId: input.message.peerId,
      text: reply,
      contextToken: input.message.contextToken,
    });

    input.processedMessage.status = "ignored";
    input.processedMessage.responsePreview = compactPreview(reply) ?? "已处理";
    input.processedMessage.updatedAt = nowIso();
    return true;
  }

  private async buildConversationAttachments(
    processedMessage: WechatStateView["processedMessages"][number],
  ): Promise<DesktopConversationAttachmentInput[] | undefined> {
    const mediaAssets = processedMessage.mediaAssets ?? [];
    if (mediaAssets.length === 0) {
      return undefined;
    }

    const attachments: DesktopConversationAttachmentInput[] = [];
    for (let index = 0; index < mediaAssets.length; index += 1) {
      const asset = mediaAssets[index];
      if (!asset) {
        continue;
      }

      try {
        const binary = await fs.readFile(asset.path);
        attachments.push({
          attachmentId: `wechat-${processedMessage.messageId}-${index + 1}`,
          kind: toConversationAttachmentKind(asset.kind),
          fileName: asset.fileName ?? basename(asset.path),
          dataBase64: binary.toString("base64"),
          ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
          ...(typeof asset.sizeBytes === "number" ? { sizeBytes: asset.sizeBytes } : {}),
        });
      } catch (error) {
        await this.logger.warn("Desktop wechat attachment bridge failed", {
          context: {
            accountId: processedMessage.accountId,
            peerId: processedMessage.peerId,
            messageId: processedMessage.messageId,
            path: asset.path,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return attachments.length > 0 ? attachments : undefined;
  }

  private async sendTextChunks(input: {
    account: WechatModuleStorage["accounts"][number];
    peerId: string;
    text: string;
    contextToken?: string;
  }): Promise<string | undefined> {
    const token = trimText(input.account.token);
    if (!token) {
      throw new Error("账号 token 缺失，无法发送微信消息");
    }

    const chunks = splitReplyText(input.text);
    let lastClientId: string | undefined;
    for (const chunk of chunks) {
      const sent = await sendWechatTextMessage({
        baseUrl: trimText(input.account.baseUrl) ?? this.storage.config.baseUrl,
        routeTag: this.storage.config.routeTag,
        token,
        toUserId: input.peerId,
        text: chunk,
        contextToken: input.contextToken,
      });
      lastClientId = sent.clientId;
    }

    return lastClientId;
  }

  private isDebugAccountEnabled(accountId: string): boolean {
    return normalizeStringList(this.storage.config.debugAccountIds).includes(accountId);
  }

  private setDebugAccountEnabled(accountId: string, enabled?: boolean): boolean {
    const list = new Set(normalizeStringList(this.storage.config.debugAccountIds));
    const nextEnabled = enabled === undefined ? !list.has(accountId) : enabled;
    if (nextEnabled) {
      list.add(accountId);
    } else {
      list.delete(accountId);
    }
    this.storage.config.debugAccountIds = [...list];
    return nextEnabled;
  }

  private async trySendDeliveryErrorNotice(input: {
    account: WechatModuleStorage["accounts"][number];
    peerId: string;
    contextToken?: string;
    reason: string;
  }): Promise<void> {
    try {
      const notice = `处理失败：${compactPreview(input.reason, 120) ?? "未知错误"}`;
      await this.sendTextChunks({
        account: input.account,
        peerId: input.peerId,
        text: notice,
        contextToken: input.contextToken,
      });
    } catch (error) {
      await this.logger.warn("Desktop wechat delivery error notice failed", {
        context: {
          accountId: input.account.accountId,
          peerId: input.peerId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async resolveExecutionWorkspaceId(): Promise<string | undefined> {
    const configuredWorkspaceId = trimText(this.storage.config.selectedWorkspaceId)
      ?? trimText(this.storage.config.defaultExecutionWorkspaceId);
    if (configuredWorkspaceId) {
      return configuredWorkspaceId;
    }

    const workspaceList = await this.workspaceQuery.list({
      limit: 1,
      offset: 0,
    });
    const fallbackWorkspaceId = trimText(workspaceList.items[0]?.workspaceId);
    if (!fallbackWorkspaceId) {
      return undefined;
    }

    this.storage.config.selectedWorkspaceId = fallbackWorkspaceId;
    this.storage.config.defaultExecutionWorkspaceId = fallbackWorkspaceId;
    this.storage.updatedAt = nowIso();
    return fallbackWorkspaceId;
  }

  private async resolveOrCreateBinding(input: {
    accountId: string;
    peerId: string;
    conversationKey: string;
    messageId: string;
    inboundText: string;
    createdAt: string;
    contextToken?: string;
  }): Promise<WechatConversationBindingRecord> {
    const existing = this.storage.bindings.find((item) =>
      item.accountId === input.accountId && item.peerId === input.peerId,
    );
    if (existing) {
      existing.updatedAt = nowIso();
      existing.lastMessageId = input.messageId;
      existing.lastInboundPreview = compactPreview(input.inboundText);

      if (!isCurrentWechatRuntimeSession(existing)) {
        const recreated = await this.createWechatConversationBinding({
          ...input,
          existing,
        });
        Object.assign(existing, recreated, {
          createdAt: existing.createdAt,
        });
      }

      if (input.contextToken) {
        existing.lastContextToken = input.contextToken;
      }

      return existing;
    }

    return this.createWechatConversationBinding(input);
  }

  private async createWechatConversationBinding(input: {
    accountId: string;
    peerId: string;
    conversationKey: string;
    messageId: string;
    inboundText: string;
    createdAt: string;
    contextToken?: string;
    existing?: WechatConversationBindingRecord;
  }): Promise<WechatConversationBindingRecord> {
    const workspaceId = input.existing?.workspaceId
      ?? await this.resolveExecutionWorkspaceId();
    if (!workspaceId) {
      throw new Error("未配置 selectedWorkspaceId 或 defaultExecutionWorkspaceId，无法创建会话");
    }

    const created = await this.conversationCommand.createSession({
      workspaceId,
      title: `微信会话 ${input.peerId}`,
      selectedAgentId: FULLY_MANAGED_AGENT_ID,
      metadata: {
        source: "wechat",
        accountId: input.accountId,
        peerId: input.peerId,
        conversationSettings: buildWechatConversationSettings(),
      },
    });

    const binding: WechatConversationBindingRecord = {
      key: input.conversationKey,
      accountId: input.accountId,
      peerId: input.peerId,
      homeWorkspaceId: trimText(this.storage.config.selectedWorkspaceId) ?? input.existing?.homeWorkspaceId,
      workspaceId,
      sessionId: created.item.sessionId,
      createdAt: input.existing?.createdAt ?? input.createdAt,
      updatedAt: nowIso(),
      lastMessageId: input.messageId,
      lastInboundPreview: compactPreview(input.inboundText),
      lastContextToken: input.contextToken,
      runtimeSessionVersion: WECHAT_RUNTIME_SESSION_VERSION,
    };

    if (!input.existing) {
      this.storage.bindings.unshift(binding);
    }

    return binding;
  }

  private toLoginSessionView(item: WechatModuleStorage["loginSessions"][number]): WechatLoginSessionView {
    return {
      sessionKey: item.sessionKey,
      accountId: item.accountId,
      status: item.status,
      qrcodeUrl: item.qrcodeUrl,
      message: item.message,
      startedAt: item.startedAt,
      expiresAt: item.expiresAt,
      updatedAt: item.updatedAt,
    };
  }

  private toWechatStateView(): WechatStateView {
    const bindingCountByAccount = new Map<string, number>();
    for (const item of this.storage.bindings) {
      bindingCountByAccount.set(item.accountId, (bindingCountByAccount.get(item.accountId) ?? 0) + 1);
    }

    const processedCountByAccount = new Map<string, number>();
    for (const item of this.storage.processedMessages) {
      processedCountByAccount.set(item.accountId, (processedCountByAccount.get(item.accountId) ?? 0) + 1);
    }

    const accounts = this.storage.accounts.map((item) => ({
      accountId: item.accountId,
      userId: item.userId,
      enabled: item.enabled,
      configured: Boolean(trimText(item.token)),
      running: item.enabled && Boolean(trimText(item.token)),
      connectionStatus: inferAccountConnectionStatus({
        enabled: item.enabled,
        token: item.token,
        lastError: item.lastError,
        pausedUntil: item.pausedUntil,
      }),
      transportMode: "long-poll" as const,
      baseUrl: trimText(item.baseUrl) ?? this.storage.config.baseUrl,
      cdnBaseUrl: this.storage.config.cdnBaseUrl,
      savedAt: item.savedAt,
      updatedAt: item.updatedAt,
      lastInboundAt: item.lastInboundAt,
      lastOutboundAt: item.lastOutboundAt,
      lastError: item.lastError,
      pausedUntil: item.pausedUntil,
      bindingCount: bindingCountByAccount.get(item.accountId) ?? 0,
      processedMessageCount: processedCountByAccount.get(item.accountId) ?? 0,
    }));

    return {
      transportMode: "long-poll",
      config: { ...this.storage.config },
      catalog: buildWechatCatalog(),
      accounts,
      bindings: this.storage.bindings.map((item) => toWechatBindingView(item)),
      processedMessages: [...this.storage.processedMessages],
      loginSessions: this.storage.loginSessions.map((item) => this.toLoginSessionView(item)),
      stats: {
        accountCount: accounts.length,
        activeAccountCount: accounts.filter((item) => item.connectionStatus === "connected" || item.connectionStatus === "connecting").length,
        bindingCount: this.storage.bindings.length,
        processedMessageCount: this.storage.processedMessages.length,
      },
      updatedAt: this.storage.updatedAt,
    };
  }
}

function extractAssistantReplyText(detail: DesktopConversationSessionDetail): string | undefined {
  for (let index = detail.messages.length - 1; index >= 0; index -= 1) {
    const message = detail.messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    const textParts: string[] = [];
    for (const part of message.parts) {
      if (part.type !== "text" && part.type !== "reasoning") {
        continue;
      }

      const text = part.text.trim();
      if (text.length > 0) {
        textParts.push(text);
      }
    }

    const content = textParts.join("\n");

    const compacted = compactPreview(content, 800);
    if (compacted) {
      return compacted;
    }
  }

  return undefined;
}
