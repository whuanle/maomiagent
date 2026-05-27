import type { DesktopFeishuPort } from "../../abstraction/ports/desktop-feishu.ports";
import type { DesktopFeishuActionExecutorPort } from "../../abstraction/ports/desktop-feishu-action-executor.ports";
import type { DesktopFeishuDocRuntimePort } from "../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type {
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  FeishuBotConfigInput,
  FeishuBotStateView,
  FeishuDeveloperAuthorizeResult,
  FeishuDeveloperConfigInput,
  FeishuDocContentView,
  FeishuDocMediaPreviewResult,
  FeishuDocTreeBranchInput,
  FeishuDocTreeBranchResult,
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
  FeishuDocTreeQuery,
  FeishuDocTreeView,
  FeishuDocWhiteboardPreviewResult,
  FeishuDocWorkspacePullResult,
  FeishuDocWorkspacePushResult,
  FeishuDocsCapabilitiesView,
  FeishuOAuthCallbackInput,
  FeishuOAuthCallbackResult,
  FeishuPersonalConfigInput,
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
  FeishuStateView,
  FeishuWorkspaceDocInput,
} from "../../../../../shared/desktop-feishu";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import {
  mergeDesktopFeishuOAuthScopes,
  normalizeDesktopFeishuRedirectUri,
  resolveDesktopFeishuOAuthCallbackOrigin,
} from "../../../../../shared/desktop-feishu-oauth";
import type { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import {
  clearDesktopFeishuDeveloperAutoRefreshTask,
  refreshDesktopFeishuDeveloperToken,
  scheduleDesktopFeishuDeveloperAutoRefreshTask,
} from "./desktop-feishu-developer-token";
import { buildFeishuBotTenantCapabilityCatalog } from "./desktop-feishu-bot-tenant-capability-catalog";
import { runDesktopFeishuStoreMutation } from "./desktop-feishu-store-mutation";
import { hydrateDesktopFeishuStateView } from "./desktop-feishu-state-hydrator";
import type { DesktopFeishuBotRuntimePort } from "./desktop-feishu-bot-runtime";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOAuthCallbackHtml(input: { title: string; message: string }): string {
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:32px;color:#1f2328}main{max-width:520px}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;line-height:1.7;margin:0;color:#4b5563}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => trimText(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeFeishuBotConnectionStatus(
  value: unknown,
): FeishuBotStateView["connectionStatus"] {
  if (
    value === "disconnected"
    || value === "connecting"
    || value === "connected"
    || value === "processing"
    || value === "error"
  ) {
    return value;
  }

  if (value === "ready" || value === "stopped") {
    return "disconnected";
  }

  return "disconnected";
}

function normalizeLegacyFeishuBotEventStatus(
  value: unknown,
): NonNullable<FeishuBotStateView["latestEvent"]>["status"] {
  if (
    value === "received"
    || value === "queued"
    || value === "duplicate"
    || value === "ignored"
    || value === "planned"
    || value === "processed"
    || value === "failed"
  ) {
    return value;
  }

  if (value === "challenge") {
    return "received";
  }

  return "ignored";
}

function normalizeFeishuBotEventInfo(
  event: NonNullable<FeishuBotStateView["latestEvent"]> | undefined,
  fallbackUpdatedAt: unknown,
): FeishuBotStateView["latestEvent"] {
  if (!event) {
    return undefined;
  }

  return {
    status: normalizeLegacyFeishuBotEventStatus(event.status),
    receivedAt:
      trimText(event.receivedAt)
      ?? trimText(fallbackUpdatedAt)
      ?? new Date().toISOString(),
    eventType: trimText(event.eventType),
    eventId: trimText(event.eventId),
    messageId: trimText(event.messageId),
    chatId: trimText(event.chatId),
    detail: trimText(event.detail),
  };
}

function hydrateFeishuBotState(state: FeishuBotStateView): FeishuBotStateView {
  const legacyState = state as FeishuBotStateView & {
    latestWebhook?: {
      status?: unknown;
      receivedAt?: unknown;
      eventType?: unknown;
      eventId?: unknown;
      messageId?: unknown;
      chatId?: unknown;
      detail?: unknown;
    };
  };
  const appId = trimText(state.appId) ?? "";
  const appSecret = trimText(state.appSecret) ?? "";
  const verificationToken = trimText(state.verificationToken) ?? "";
  const encryptKey = trimText(state.encryptKey) ?? "";
  const hasAppSecret = state.hasAppSecret === true || Boolean(appSecret);
  const hasVerificationToken = state.hasVerificationToken === true || Boolean(verificationToken);
  const hasEncryptKey = state.hasEncryptKey === true || Boolean(encryptKey);
  const hasSavedCredential = Boolean(appId && hasAppSecret);
  const enabled = state.enabled || hasSavedCredential;
  const allowWorkspaceSwitch = state.allowWorkspaceSwitch === true;
  const allowedExecutionWorkspaceIds = allowWorkspaceSwitch
    ? normalizeStringList(state.allowedExecutionWorkspaceIds)
    : [];
  const latestEvent = normalizeFeishuBotEventInfo(
    state.latestEvent
    ?? (legacyState.latestWebhook
      ? {
          status: legacyState.latestWebhook.status as NonNullable<
            FeishuBotStateView["latestEvent"]
          >["status"],
          receivedAt:
            trimText(legacyState.latestWebhook.receivedAt)
            ?? trimText(state.updatedAt)
            ?? new Date().toISOString(),
          eventType: trimText(legacyState.latestWebhook.eventType),
          eventId: trimText(legacyState.latestWebhook.eventId),
          messageId: trimText(legacyState.latestWebhook.messageId),
          chatId: trimText(legacyState.latestWebhook.chatId),
          detail: trimText(legacyState.latestWebhook.detail),
        }
      : undefined),
    state.updatedAt,
  );

  return {
    ...state,
    appId,
    appSecret,
    verificationToken,
    encryptKey,
    enabled,
    hasAppSecret,
    hasVerificationToken,
    hasEncryptKey,
    transportMode: "websocket",
    catalog: {
      descriptors: Array.isArray(state.catalog?.descriptors) ? [...state.catalog.descriptors] : [],
      transportMode: "websocket",
    },
    tenantCapabilities: buildFeishuBotTenantCapabilityCatalog(),
    allowWorkspaceSwitch,
    workspaceSwitchScope:
      allowWorkspaceSwitch
      && state.workspaceSwitchScope === "restricted"
      && allowedExecutionWorkspaceIds.length > 0
        ? "restricted"
        : "all",
    allowedExecutionWorkspaceIds,
    selectedWorkspaceId: trimText(state.selectedWorkspaceId),
    defaultExecutionWorkspaceId: trimText(state.defaultExecutionWorkspaceId),
    selectedChannelId: trimText(state.selectedChannelId),
    selectedModelId: trimText(state.selectedModelId),
    connectionStatus: normalizeFeishuBotConnectionStatus(state.connectionStatus),
    latestEvent,
    recentProcessedMessages: Array.isArray(state.recentProcessedMessages)
      ? state.recentProcessedMessages.map((item) => ({ ...item }))
      : [],
  };
}

export class DesktopFeishuService implements DesktopFeishuPort {
  constructor(
    private readonly store: DesktopFeishuStorePort,
    private readonly actionExecutor: DesktopFeishuActionExecutorPort,
    private readonly docRuntime: DesktopFeishuDocRuntimePort,
    private readonly openApiClient: DesktopFeishuOpenApiClient,
    private readonly botRuntime?:
      | DesktopFeishuBotRuntimePort
      | (() => DesktopFeishuBotRuntimePort | undefined),
  ) {}

  private resolveBotRuntime(): DesktopFeishuBotRuntimePort | undefined {
    return typeof this.botRuntime === "function"
      ? this.botRuntime()
      : this.botRuntime;
  }

  private hydrateState(state: FeishuStateView): FeishuStateView {
    return hydrateDesktopFeishuStateView(state);
  }

  private hydrateStoreState(store: DesktopFeishuStoreSnapshot): FeishuStateView {
    const state = this.hydrateState(store.state as FeishuStateView);
    const lastRootToken = store.docTreeCache.lastRootToken.trim();
    const lastRoot = lastRootToken
      ? Object.values(store.docTreeCache.roots).find((item) => item.token === lastRootToken)
      : Object.values(store.docTreeCache.roots)
        .filter((item) => item.token.trim())
        .sort((left, right) => right.loadedAt.localeCompare(left.loadedAt))[0];
    const restoredRootToken = lastRootToken || lastRoot?.token;

    if (!restoredRootToken) {
      return state;
    }

    return {
      ...state,
      docsWorkspace: {
        ...state.docsWorkspace,
        lastRootToken: restoredRootToken,
        lastRootTitle: lastRoot?.title,
        lastRootLoadedAt: lastRoot?.loadedAt ?? store.docTreeCache.lastRootUpdatedAt,
      },
    };
  }

  private async mutateStore<T>(
    mutator: (store: DesktopFeishuStoreSnapshot) => Promise<T> | T,
  ): Promise<T> {
    return runDesktopFeishuStoreMutation(this.store, mutator);
  }

  private hydrateBotStoreState(store: DesktopFeishuStoreSnapshot): FeishuBotStateView {
    const base = hydrateFeishuBotState(store.bot as FeishuBotStateView);
    const recentProcessedMessages = [...(store.botRuntime.processedMessages ?? [])]
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
        || right.createdAt.localeCompare(left.createdAt)
        || left.messageId.localeCompare(right.messageId, "en", { sensitivity: "base" }))
      .slice(0, 20)
      .map((item) => ({ ...item }));
    const pendingActions = [...(store.botRuntime.pendingActions ?? [])]
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
        || right.createdAt.localeCompare(left.createdAt)
        || left.pendingId.localeCompare(right.pendingId, "en", { sensitivity: "base" }))
      .map((item) => ({
        pendingId: item.pendingId,
        chatId: item.chatId,
        threadId: item.threadId,
        messageId: item.messageId,
        domain: item.domain,
        actionId: item.actionId,
        workspaceId: item.workspaceId,
        summary: item.summary,
        details: [...item.details],
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
      }));

    return {
      ...base,
      sessionMappingCount: store.botRuntime.bindings.length,
      processedMessageCount: store.botRuntime.processedMessages.length,
      latestProcessedMessage: recentProcessedMessages[0],
      recentProcessedMessages,
      pendingActionCount: pendingActions.length,
      latestPendingAction: pendingActions[0],
    };
  }

  async getState(): Promise<FeishuStateView> {
    const store = await this.store.read();
    return this.hydrateStoreState(store);
  }

  async savePersonalConfig(input: FeishuPersonalConfigInput): Promise<FeishuStateView> {
    const payload = input as any;
    return this.mutateStore((store) => {
      store.state.mode = "personal";
      store.state.personalDocs.enabled = true;
      store.state.personalDocs.serverUrl = payload.serverUrl ?? "";
      store.state.personalDocs.savedAt = new Date().toISOString();
      store.state.personalDocs.docsMcp = {
        mcpId: "desktop.feishu.personal",
        name: "maomi_feishu_personal_docs",
        endpoint: payload.serverUrl ?? "",
        transport: "http-streamable",
        enabled: true,
        updatedAt: new Date().toISOString(),
      };
      store.state.personal = {
        serverUrl: payload.serverUrl ?? "",
        savedAt: new Date().toISOString(),
        discoveredTools: [],
      };
      return this.hydrateState(store.state as FeishuStateView);
    });
  }

  async clearPersonalConfig(): Promise<FeishuStateView> {
    return this.mutateStore((store) => {
      store.state.mode = "none";
      store.state.personal = null;
      store.state.personalDocs = {
        enabled: false,
        discoveredTools: [],
        docsMcp: null,
      };
      return this.hydrateState(store.state as FeishuStateView);
    });
  }

  async saveDeveloperConfig(input: FeishuDeveloperConfigInput): Promise<FeishuStateView> {
    const payload = input as any;
    return this.mutateStore((store) => {
      const now = new Date().toISOString();
      const redirectUri = normalizeDesktopFeishuRedirectUri(payload.redirectUri);
      const redirectOrigin = resolveDesktopFeishuOAuthCallbackOrigin(redirectUri);
      if (payload.appSecret !== undefined) {
        store.developerCredential.appSecret = payload.appSecret;
      }
      const hasAppSecret = Boolean(store.developerCredential.appSecret);
      store.state.mode = "developer";
      store.state.developer = {
        appId: payload.appId ?? "",
        hasAppSecret,
        redirectUri,
        redirectOrigin,
        authStatus: "idle",
        authMethod: "oauth",
        hasRefreshToken: false,
        scopes: [],
        allowedTools: [],
        autoRefreshTask: {
          enabled: false,
        },
      };
      store.state.smartAssistant = {
        ...store.state.smartAssistant,
        enabled: true,
        appId: payload.appId ?? "",
        hasAppSecret,
        redirectUri,
        redirectOrigin,
        authStatus: "idle",
        hasRefreshToken: false,
        autoRefreshTask: {
          enabled: false,
        },
        docsMcp: {
          mcpId: "desktop.feishu.smart-assistant",
          name: "maomi_feishu_assistant_docs",
          endpoint: "desktop://feishu-assistant/docs",
          transport: "http-streamable",
          enabled: true,
          updatedAt: now,
        },
      };
      return this.hydrateState(store.state as FeishuStateView);
    });
  }

  async beginDeveloperAuthorization(
    input: FeishuDeveloperConfigInput,
  ): Promise<FeishuDeveloperAuthorizeResult> {
    const payload = input as any;
    return this.mutateStore((store) => {
      const appId = payload.appId ?? store.state.smartAssistant.appId ?? store.state.developer?.appId ?? "";
      const redirectUri = normalizeDesktopFeishuRedirectUri(
        payload.redirectUri || store.state.smartAssistant.redirectUri || store.state.developer?.redirectUri,
      );
      const redirectOrigin = resolveDesktopFeishuOAuthCallbackOrigin(redirectUri);
      if (store.state.developer) {
        store.state.developer.redirectUri = redirectUri;
        store.state.developer.redirectOrigin = redirectOrigin;
        store.state.developer.authStatus = "pending";
      }
      store.state.smartAssistant.redirectUri = redirectUri;
      store.state.smartAssistant.redirectOrigin = redirectOrigin;
      store.state.smartAssistant.authStatus = "pending";

      const authUrl = new URL("https://open.feishu.cn/open-apis/authen/v1/index");
      authUrl.searchParams.set("app_id", appId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", mergeDesktopFeishuOAuthScopes(
        this.hydrateState(store.state as FeishuStateView).smartAssistant.scopes,
      ).join(" "));

      return {
        item: this.hydrateState(store.state as FeishuStateView),
        authUrl: authUrl.toString(),
      } as unknown as FeishuDeveloperAuthorizeResult;
    });
  }

  async handleOAuthCallback(
    input: FeishuOAuthCallbackInput,
  ): Promise<FeishuOAuthCallbackResult> {
    const now = new Date().toISOString();
    const error = input.error?.trim();
    const errorDescription = input.errorDescription?.trim();
    const code = input.code?.trim();

    if (error) {
      const message = errorDescription || error;
      return this.mutateStore((store) => {
        if (store.state.developer) {
          store.state.developer.authStatus = "error";
          store.state.developer.lastError = message;
        }
        store.state.smartAssistant.authStatus = "error";
        store.state.smartAssistant.lastError = message;

        return {
          success: false,
          html: renderOAuthCallbackHtml({
            title: "飞书授权失败",
            message,
          }),
        };
      });
    }

    if (!code) {
      const message = "未收到飞书授权码，请重新发起授权。";
      return this.mutateStore((store) => {
        if (store.state.developer) {
          store.state.developer.authStatus = "error";
          store.state.developer.lastError = message;
        }
        store.state.smartAssistant.authStatus = "error";
        store.state.smartAssistant.lastError = message;

        return {
          success: false,
          html: renderOAuthCallbackHtml({
            title: "飞书授权失败",
            message,
          }),
        };
      });
    }

    return this.mutateStore(async (store) => {
      const appId = store.state.developer?.appId || store.state.smartAssistant.appId || "";
      const appSecret = store.developerCredential.appSecret;
      const redirectUri = normalizeDesktopFeishuRedirectUri(
        store.state.developer?.redirectUri || store.state.smartAssistant.redirectUri,
      );

      try {
        if (!appId && !appSecret) {
          throw new Error("缺少飞书应用 App ID 和 App Secret，请重新保存配置。");
        }
        if (!appId) {
          throw new Error("缺少飞书应用 App ID，请重新保存配置。");
        }
        if (!appSecret) {
          throw new Error("缺少飞书应用 App Secret，请重新保存配置。");
        }

        const tokens = await this.openApiClient.exchangeOAuthCode({
          appId,
          appSecret,
          code,
          redirectUri,
        });

        store.developerToken = tokens;
        const hasRefreshToken = Boolean(tokens.refreshToken);

        if (store.state.developer) {
          store.state.developer.authStatus = "authorized";
          store.state.developer.hasRefreshToken = hasRefreshToken;
          store.state.developer.accessTokenExpiresAt = tokens.accessTokenExpiresAt;
          store.state.developer.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt;
          store.state.developer.lastAuthorizedAt = now;
          store.state.developer.lastError = hasRefreshToken
            ? undefined
            : "当前未保存 refresh_token，请确认应用已开通 offline_access 权限。";
        }
        store.state.smartAssistant.authStatus = "authorized";
        store.state.smartAssistant.hasRefreshToken = hasRefreshToken;
        store.state.smartAssistant.accessTokenExpiresAt = tokens.accessTokenExpiresAt;
        store.state.smartAssistant.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt;
        store.state.smartAssistant.lastAuthorizedAt = now;
        store.state.smartAssistant.lastError = hasRefreshToken
          ? undefined
          : "当前未保存 refresh_token，请确认应用已开通 offline_access 权限。";

        if (hasRefreshToken) {
          scheduleDesktopFeishuDeveloperAutoRefreshTask(store, new Date(now), "queued");
        } else {
          clearDesktopFeishuDeveloperAutoRefreshTask(store);
        }

        return {
          success: true,
          html: renderOAuthCallbackHtml({
            title: "飞书授权完成",
            message: "授权已完成，可以关闭此页面。",
          }),
        };
      } catch (tokenError) {
        const message = tokenError instanceof Error ? tokenError.message : String(tokenError);
        if (store.state.developer) {
          store.state.developer.authStatus = "error";
          store.state.developer.lastError = message;
        }
        store.state.smartAssistant.authStatus = "error";
        store.state.smartAssistant.lastError = message;

        return {
          success: false,
          html: renderOAuthCallbackHtml({
            title: "飞书授权失败",
            message,
          }),
        };
      }
    });
  }

  async refreshDeveloperToken(): Promise<FeishuStateView> {
    return refreshDesktopFeishuDeveloperToken({
      store: this.store,
      openApiClient: this.openApiClient,
    });
  }

  async clearSmartAssistantConfig(): Promise<FeishuStateView> {
    return this.mutateStore((store) => {
      store.state.mode = store.state.personalDocs.enabled ? "personal" : "none";
      store.state.developer = null;
      store.state.smartAssistant = {
        enabled: false,
        appId: "",
        hasAppSecret: false,
        redirectUri: "",
        redirectOrigin: "",
        authStatus: "idle",
        authMethod: "oauth",
        hasRefreshToken: false,
        scopes: [],
        allowedTools: [],
        autoRefreshTask: {
          enabled: false,
        },
        docsMcp: null,
        runtimePolicy: {
          controlPlane: "planned",
          domainMounting: "lazy_by_domain",
          actionExecution: "registry_first",
        },
        connectionProfiles: [],
        domainModels: [],
        contextTemplates: [],
        policyItems: [],
        domains: [],
        actions: [],
      };
      return this.hydrateState(store.state as FeishuStateView);
    });
  }

  async clearConfig(): Promise<FeishuStateView> {
    const result = await this.mutateStore((store) => {
      store.state.personalDocs = {
        enabled: false,
        discoveredTools: [],
        docsMcp: null,
      };
      store.state.smartAssistant = {
        enabled: false,
        appId: "",
        hasAppSecret: false,
        redirectUri: "",
        redirectOrigin: "",
        authStatus: "idle",
        authMethod: "oauth",
        hasRefreshToken: false,
        scopes: [],
        allowedTools: [],
        autoRefreshTask: {
          enabled: false,
        },
        docsMcp: null,
        runtimePolicy: {
          controlPlane: "planned",
          domainMounting: "lazy_by_domain",
          actionExecution: "registry_first",
        },
        connectionProfiles: [],
        domainModels: [],
        contextTemplates: [],
        policyItems: [],
        domains: [],
        actions: [],
      };
      store.state.mode = "none";
      store.state.personal = null;
      store.state.developer = null;
      store.state.managedMcp = null;
      store.botRuntime = {
        version: "1.0",
        bindings: [],
        processedMessages: [],
        pendingActions: [],
      };
      store.bot = {
        ...store.bot,
        enabled: false,
        appId: "",
        appSecret: "",
        transportMode: "websocket",
        hasAppSecret: false,
        verificationToken: "",
        hasVerificationToken: false,
        encryptKey: "",
        hasEncryptKey: false,
        catalog: {
          ...store.bot.catalog,
          transportMode: "websocket",
        },
        selectedWorkspaceId: undefined,
        executionWorkspaceMode: undefined,
        defaultExecutionWorkspaceId: undefined,
        allowWorkspaceSwitch: false,
        workspaceSwitchScope: "all",
        allowedExecutionWorkspaceIds: [],
        selectedChannelId: undefined,
        selectedModelId: undefined,
        connectionStatus: "disconnected",
        connectionDetail: undefined,
        latestEvent: undefined,
        latestProcessedMessage: undefined,
        recentProcessedMessages: [],
        pendingActionCount: 0,
        latestPendingAction: undefined,
        sessionMappingCount: 0,
        processedMessageCount: 0,
        queuedConversationCount: 0,
        savedAt: undefined,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      };
      return this.hydrateState(store.state as FeishuStateView);
    });
    await this.resolveBotRuntime()?.sync();
    return result;
  }

  async getBotState(): Promise<FeishuBotStateView> {
    return this.hydrateBotStoreState(await this.store.read());
  }

  async saveBotConfig(input: FeishuBotConfigInput): Promise<FeishuBotStateView> {
    const payload = input as any;
    await this.mutateStore((store) => {
      const now = new Date().toISOString();
      const appId = trimText(payload.appId) ?? "";
      const previousAppId = trimText(store.bot.appId) ?? "";
      const nextAppSecret = payload.appSecret !== undefined ? trimText(payload.appSecret) : undefined;
      const nextVerificationToken = payload.verificationToken !== undefined
        ? trimText(payload.verificationToken)
        : undefined;
      const nextEncryptKey = payload.encryptKey !== undefined ? trimText(payload.encryptKey) : undefined;
      const appSecret = nextAppSecret !== undefined
        ? nextAppSecret ?? ""
        : trimText(store.bot.appSecret) ?? "";
      const verificationToken = nextVerificationToken !== undefined
        ? nextVerificationToken ?? ""
        : trimText(store.bot.verificationToken) ?? "";
      const encryptKey = nextEncryptKey !== undefined
        ? nextEncryptKey ?? ""
        : trimText(store.bot.encryptKey) ?? "";
      const hasAppSecret = Boolean(appSecret);
      const hasVerificationToken = Boolean(verificationToken);
      const hasEncryptKey = Boolean(encryptKey);
      const allowWorkspaceSwitch = payload.allowWorkspaceSwitch === true;
      const allowedExecutionWorkspaceIds = allowWorkspaceSwitch
        ? normalizeStringList(payload.allowedExecutionWorkspaceIds)
        : [];
      const workspaceSwitchScope = allowWorkspaceSwitch
        && payload.workspaceSwitchScope === "restricted"
        && allowedExecutionWorkspaceIds.length > 0
        ? "restricted"
        : "all";
      const selectedWorkspaceId = trimText(payload.selectedWorkspaceId)
        ?? trimText(payload.defaultExecutionWorkspaceId)
        ?? store.bot.selectedWorkspaceId
        ?? store.bot.defaultExecutionWorkspaceId;
      const defaultExecutionWorkspaceId = trimText(payload.defaultExecutionWorkspaceId)
        ?? trimText(payload.selectedWorkspaceId)
        ?? store.bot.defaultExecutionWorkspaceId
        ?? store.bot.selectedWorkspaceId;
      const executionWorkspaceMode = payload.executionWorkspaceMode === "home"
        || payload.executionWorkspaceMode === "default-linked"
        || payload.executionWorkspaceMode === "auto"
        ? payload.executionWorkspaceMode
        : store.bot.executionWorkspaceMode;
      const enabled = Boolean(appId && hasAppSecret);
      const connectionStatus = enabled
        ? normalizeFeishuBotConnectionStatus(store.bot.connectionStatus)
        : "disconnected";
      if (previousAppId && previousAppId !== appId) {
        store.botRuntime = {
          version: "1.0",
          bindings: [],
          processedMessages: [],
          pendingActions: [],
        };
      }

      store.bot = {
        ...store.bot,
        enabled,
        appId,
        appSecret,
        transportMode: "websocket",
        hasAppSecret,
        verificationToken,
        hasVerificationToken,
        encryptKey,
        hasEncryptKey,
        catalog: {
          ...store.bot.catalog,
          transportMode: "websocket",
        },
        selectedWorkspaceId,
        executionWorkspaceMode,
        defaultExecutionWorkspaceId,
        allowWorkspaceSwitch,
        workspaceSwitchScope,
        allowedExecutionWorkspaceIds,
        selectedChannelId: trimText(payload.selectedChannelId),
        selectedModelId: trimText(payload.selectedModelId),
        connectionStatus,
        connectionDetail: undefined,
        lastError: undefined,
        latestProcessedMessage: undefined,
        recentProcessedMessages: [],
        savedAt: now,
        updatedAt: now,
      };
    });
    await this.resolveBotRuntime()?.sync();
    return this.getBotState();
  }

  async clearBotConfig(): Promise<FeishuBotStateView> {
    await this.mutateStore((store) => {
      store.botRuntime = {
        version: "1.0",
        bindings: [],
        processedMessages: [],
        pendingActions: [],
      };
      store.bot = {
        ...store.bot,
        enabled: false,
        appId: "",
        appSecret: "",
        transportMode: "websocket",
        hasAppSecret: false,
        verificationToken: "",
        hasVerificationToken: false,
        encryptKey: "",
        hasEncryptKey: false,
        catalog: {
          ...store.bot.catalog,
          transportMode: "websocket",
        },
        selectedWorkspaceId: undefined,
        executionWorkspaceMode: undefined,
        defaultExecutionWorkspaceId: undefined,
        allowWorkspaceSwitch: false,
        workspaceSwitchScope: "all",
        allowedExecutionWorkspaceIds: [],
        selectedChannelId: undefined,
        selectedModelId: undefined,
        connectionStatus: "disconnected",
        connectionDetail: undefined,
        latestEvent: undefined,
        latestProcessedMessage: undefined,
        recentProcessedMessages: [],
        pendingActionCount: 0,
        latestPendingAction: undefined,
        sessionMappingCount: 0,
        processedMessageCount: 0,
        queuedConversationCount: 0,
        savedAt: undefined,
        lastError: undefined,
        updatedAt: new Date().toISOString(),
      };
    });
    await this.resolveBotRuntime()?.sync();
    return this.getBotState();
  }

  async getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView> {
    return this.docRuntime.getDocsCapabilities();
  }

  async loadDocTreeRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult> {
    return this.docRuntime.loadDocTreeRoot(input);
  }

  async loadDocTreeBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult> {
    return this.docRuntime.loadDocTreeBranch(input);
  }

  async getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView> {
    return this.docRuntime.getDocTree(input);
  }

  async getDocContent(docId: string): Promise<FeishuDocContentView> {
    return this.docRuntime.getDocContent(docId);
  }

  async getDocMediaPreviewUrls(input: { fileTokens: string[] }): Promise<FeishuDocMediaPreviewResult> {
    return this.docRuntime.getDocMediaPreviewUrls(input);
  }

  async getDocWhiteboardPreviewUrls(input: {
    whiteboardTokens: string[];
  }): Promise<FeishuDocWhiteboardPreviewResult> {
    return this.docRuntime.getDocWhiteboardPreviewUrls(input);
  }

  async openWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView> {
    return this.docRuntime.openWorkspaceDoc(input);
  }

  async getWorkspaceDocLocalDraft(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView> {
    return this.docRuntime.getWorkspaceDocLocalDraft(input);
  }

  async saveWorkspaceDocLocalDraft(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocContentView> {
    return this.docRuntime.saveWorkspaceDocLocalDraft(input);
  }

  async pullWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocWorkspacePullResult> {
    return this.docRuntime.pullWorkspaceDoc(input);
  }

  async pushWorkspaceDoc(input: {
    workspaceId: string;
    docId: string;
    title?: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult> {
    return this.docRuntime.pushWorkspaceDoc(input);
  }

  async openDocIR(input: FeishuWorkspaceDocInput): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }> {
    return this.docRuntime.openDocIR(input);
  }

  async pullDocIR(input: FeishuWorkspaceDocInput & { overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }> {
    return this.docRuntime.pullDocIR(input);
  }

  async pushDocIR(input: FeishuWorkspaceDocInput): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }> {
    return this.docRuntime.pushDocIR(input);
  }

  async executeSmartAssistantAction(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView> {
    return this.actionExecutor.executeSmartAssistantAction(input);
  }

}
