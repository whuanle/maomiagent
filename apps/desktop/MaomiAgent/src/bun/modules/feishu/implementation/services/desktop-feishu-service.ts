import { randomUUID } from "node:crypto";

import type { DesktopFeishuPort } from "../../abstraction/ports/desktop-feishu.ports";
import type { DesktopFeishuActionExecutorPort } from "../../abstraction/ports/desktop-feishu-action-executor.ports";
import type { DesktopFeishuDocRuntimePort } from "../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type {
  DesktopFeishuSmartAssistantAuthSnapshot,
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
import {
  mergeDesktopFeishuOAuthScopes,
  normalizeDesktopFeishuRedirectUri,
  resolveDesktopFeishuOAuthCallbackOrigin,
} from "../../../../../shared/desktop-feishu-oauth";
import {
  buildDesktopFeishuAuthorizationUrl,
  DesktopFeishuOAuthError,
  exchangeDesktopFeishuAuthorizationCode,
  refreshDesktopFeishuAuthorization,
  renderDesktopFeishuOAuthCallbackHtml,
} from "./desktop-feishu-oauth-flow";
import { hydrateDesktopFeishuStateView } from "./desktop-feishu-state-hydrator";

const PENDING_STATE_MAX_AGE_MS = 10 * 60_000;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUniqueStrings(values?: readonly string[]): string[] {
  return [...new Set((values ?? [])
    .map((item) => item.trim())
    .filter(Boolean))];
}

function clearStoredSmartAssistantTokens(auth: DesktopFeishuSmartAssistantAuthSnapshot): void {
  delete auth.accessToken;
  delete auth.refreshToken;
  delete auth.tokenType;
  delete auth.scopes;
}

function clearPendingSmartAssistantAuthorization(
  auth: DesktopFeishuSmartAssistantAuthSnapshot,
): void {
  delete auth.pendingState;
  delete auth.pendingStateIssuedAt;
  delete auth.pendingRedirectUri;
  delete auth.pendingAppId;
}

function clearSmartAssistantAuthorizationState(state: FeishuStateView): void {
  state.smartAssistant.authStatus = "idle";
  state.smartAssistant.hasRefreshToken = false;
  state.smartAssistant.scopes = [];
  state.smartAssistant.accessTokenExpiresAt = undefined;
  state.smartAssistant.refreshTokenExpiresAt = undefined;
  state.smartAssistant.lastAuthorizedAt = undefined;
  state.smartAssistant.lastRefreshedAt = undefined;
  state.smartAssistant.lastError = undefined;
  state.smartAssistant.statusNotice = undefined;

  if (!state.developer) {
    return;
  }

  state.developer.authStatus = "idle";
  state.developer.hasRefreshToken = false;
  state.developer.scopes = [];
  state.developer.accessTokenExpiresAt = undefined;
  state.developer.refreshTokenExpiresAt = undefined;
  state.developer.lastAuthorizedAt = undefined;
  state.developer.lastRefreshedAt = undefined;
  state.developer.lastError = undefined;
  state.developer.statusNotice = undefined;
}

function applyFixedSmartAssistantRedirects(state: FeishuStateView): boolean {
  const nextRedirectUri = normalizeDesktopFeishuRedirectUri();
  const nextRedirectOrigin = resolveDesktopFeishuOAuthCallbackOrigin();

  let changed = false;

  if (state.smartAssistant.redirectUri !== nextRedirectUri) {
    state.smartAssistant.redirectUri = nextRedirectUri;
    changed = true;
  }

  if (state.smartAssistant.redirectOrigin !== nextRedirectOrigin) {
    state.smartAssistant.redirectOrigin = nextRedirectOrigin;
    changed = true;
  }

  if (state.developer) {
    if (state.developer.redirectUri !== nextRedirectUri) {
      state.developer.redirectUri = nextRedirectUri;
      changed = true;
    }

    if (state.developer.redirectOrigin !== nextRedirectOrigin) {
      state.developer.redirectOrigin = nextRedirectOrigin;
      changed = true;
    }
  }

  return changed;
}

function applyStoredSmartAssistantPublicState(store: DesktopFeishuStoreSnapshot): boolean {
  const auth = store.auth.smartAssistant;
  const hasAppSecret = Boolean(normalizeText(auth.appSecret));
  const hasRefreshToken = Boolean(normalizeText(auth.refreshToken));
  const scopes = normalizeUniqueStrings(auth.scopes);
  const currentSmartAssistantScopes = normalizeUniqueStrings(store.state.smartAssistant.scopes);

  let changed = false;

  if (store.state.smartAssistant.hasAppSecret !== hasAppSecret) {
    store.state.smartAssistant.hasAppSecret = hasAppSecret;
    changed = true;
  }

  if (store.state.smartAssistant.hasRefreshToken !== hasRefreshToken) {
    store.state.smartAssistant.hasRefreshToken = hasRefreshToken;
    changed = true;
  }

  if (scopes.length > 0 && scopes.join(" ") !== currentSmartAssistantScopes.join(" ")) {
    store.state.smartAssistant.scopes = scopes;
    changed = true;
  }

  if (store.state.developer) {
    const currentDeveloperScopes = normalizeUniqueStrings(store.state.developer.scopes);

    if (store.state.developer.hasAppSecret !== hasAppSecret) {
      store.state.developer.hasAppSecret = hasAppSecret;
      changed = true;
    }

    if (store.state.developer.hasRefreshToken !== hasRefreshToken) {
      store.state.developer.hasRefreshToken = hasRefreshToken;
      changed = true;
    }

    if (scopes.length > 0 && scopes.join(" ") !== currentDeveloperScopes.join(" ")) {
      store.state.developer.scopes = scopes;
      changed = true;
    }
  }

  return changed;
}

function applyFeishuSmartAssistantPublicShape(store: DesktopFeishuStoreSnapshot): boolean {
  const redirectsChanged = applyFixedSmartAssistantRedirects(store.state);
  const authChanged = applyStoredSmartAssistantPublicState(store);
  return redirectsChanged || authChanged;
}

function deriveAuthorizationScopes(store: DesktopFeishuStoreSnapshot): string[] {
  const hydrated = hydrateDesktopFeishuStateView(store.state);
  return mergeDesktopFeishuOAuthScopes(hydrated.catalog.developerScopes);
}

export class DesktopFeishuService implements DesktopFeishuPort {
  constructor(
    private readonly store: DesktopFeishuStorePort,
    private readonly actionExecutor: DesktopFeishuActionExecutorPort,
    private readonly docRuntime: DesktopFeishuDocRuntimePort,
  ) {}

  private hydrateStoreState(store: DesktopFeishuStoreSnapshot): FeishuStateView {
    applyFeishuSmartAssistantPublicShape(store);
    return hydrateDesktopFeishuStateView(store.state);
  }

  async getState(): Promise<FeishuStateView> {
    const store = await this.store.read();
    if (applyFeishuSmartAssistantPublicShape(store)) {
      await this.store.write(store);
    }
    return this.hydrateStoreState(store);
  }

  async savePersonalConfig(input: FeishuPersonalConfigInput): Promise<FeishuStateView> {
    const payload = input as any;
    const store = await this.store.read();
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
    await this.store.write(store);
    return this.hydrateStoreState(store);
  }

  async clearPersonalConfig(): Promise<FeishuStateView> {
    const store = await this.store.read();
    store.state.mode = "none";
    store.state.personal = null;
    store.state.personalDocs = {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    };
    await this.store.write(store);
    return this.hydrateStoreState(store);
  }

  async saveDeveloperConfig(input: FeishuDeveloperConfigInput): Promise<FeishuStateView> {
    const payload = input as any;
    const store = await this.store.read();
    const now = new Date().toISOString();
    const nextAppId = normalizeText(payload.appId);
    const providedAppSecret = normalizeText(payload.appSecret);
    if (providedAppSecret) {
      store.auth.smartAssistant.appSecret = providedAppSecret;
    }

    const previousAppId = normalizeText(store.state.smartAssistant.appId);
    const configurationChanged = previousAppId !== nextAppId || Boolean(providedAppSecret);

    if (configurationChanged) {
      clearStoredSmartAssistantTokens(store.auth.smartAssistant);
      clearPendingSmartAssistantAuthorization(store.auth.smartAssistant);
      clearSmartAssistantAuthorizationState(store.state);
    }

    store.state.mode = "developer";
    store.state.developer = {
      appId: nextAppId,
      hasAppSecret: false,
      redirectUri: normalizeDesktopFeishuRedirectUri(),
      redirectOrigin: resolveDesktopFeishuOAuthCallbackOrigin(),
      authStatus: store.state.developer?.authStatus ?? "idle",
      authMethod: "oauth",
      hasRefreshToken: false,
      scopes: store.state.developer?.scopes ?? [],
      allowedTools: store.state.developer?.allowedTools ?? [],
      accessTokenExpiresAt: store.state.developer?.accessTokenExpiresAt,
      refreshTokenExpiresAt: store.state.developer?.refreshTokenExpiresAt,
      lastAuthorizedAt: store.state.developer?.lastAuthorizedAt,
      lastRefreshedAt: store.state.developer?.lastRefreshedAt,
      lastError: store.state.developer?.lastError,
      statusNotice: store.state.developer?.statusNotice,
      autoRefreshTask: store.state.developer?.autoRefreshTask ?? {
        enabled: false,
      },
    };
    store.state.smartAssistant = {
      ...store.state.smartAssistant,
      enabled: true,
      appId: nextAppId,
      hasAppSecret: false,
      redirectUri: normalizeDesktopFeishuRedirectUri(),
      redirectOrigin: resolveDesktopFeishuOAuthCallbackOrigin(),
      hasRefreshToken: false,
      docsMcp: {
        mcpId: "desktop.feishu.smart-assistant",
        name: "maomi_feishu_assistant_docs",
        endpoint: "desktop://feishu-assistant/docs",
        transport: "http-streamable",
        enabled: true,
        updatedAt: now,
      },
    };
    applyFeishuSmartAssistantPublicShape(store);
    await this.store.write(store);
    return this.hydrateStoreState(store);
  }

  async beginDeveloperAuthorization(
    input: FeishuDeveloperConfigInput,
  ): Promise<FeishuDeveloperAuthorizeResult> {
    const payload = input as any;
    const store = await this.store.read();
    const appId = normalizeText(store.state.smartAssistant.appId) || normalizeText(payload.appId);
    const appSecret = normalizeText(store.auth.smartAssistant.appSecret);

    if (!appId) {
      throw new Error("Please save the Feishu App ID before starting authorization.");
    }
    if (!appSecret) {
      throw new Error("Please save the Feishu App Secret before starting authorization.");
    }

    const redirectUri = normalizeDesktopFeishuRedirectUri();
    const oauthState = randomUUID();
    const scopes = deriveAuthorizationScopes(store);

    store.auth.smartAssistant.pendingState = oauthState;
    store.auth.smartAssistant.pendingStateIssuedAt = new Date().toISOString();
    store.auth.smartAssistant.pendingRedirectUri = redirectUri;
    store.auth.smartAssistant.pendingAppId = appId;

    if (store.state.developer) {
      store.state.developer.authStatus = "pending";
      store.state.developer.lastError = undefined;
      store.state.developer.statusNotice = "等待授权回调";
    }
    store.state.smartAssistant.authStatus = "pending";
    store.state.smartAssistant.lastError = undefined;
    store.state.smartAssistant.statusNotice = "等待授权回调";

    applyFeishuSmartAssistantPublicShape(store);
    await this.store.write(store);

    return {
      item: this.hydrateStoreState(store),
      authUrl: buildDesktopFeishuAuthorizationUrl({
        appId,
        redirectUri,
        state: oauthState,
        scopes,
      }),
    };
  }

  async handleOAuthCallback(input: FeishuOAuthCallbackInput): Promise<FeishuOAuthCallbackResult> {
    const store = await this.store.read();
    const pendingState = normalizeText(store.auth.smartAssistant.pendingState);
    const pendingIssuedAt = normalizeText(store.auth.smartAssistant.pendingStateIssuedAt);
    const redirectUri =
      normalizeText(store.auth.smartAssistant.pendingRedirectUri)
      || normalizeDesktopFeishuRedirectUri();
    const appId =
      normalizeText(store.auth.smartAssistant.pendingAppId)
      || normalizeText(store.state.smartAssistant.appId)
      || normalizeText(store.state.developer?.appId);
    const appSecret = normalizeText(store.auth.smartAssistant.appSecret);

    const fail = async (
      message: string,
      authStatus: FeishuStateView["smartAssistant"]["authStatus"] = "error",
    ): Promise<FeishuOAuthCallbackResult> => {
      clearPendingSmartAssistantAuthorization(store.auth.smartAssistant);
      store.state.smartAssistant.authStatus = authStatus;
      store.state.smartAssistant.lastError = message;
      store.state.smartAssistant.statusNotice = "授权失败，请返回应用重试";

      if (store.state.developer) {
        store.state.developer.authStatus = authStatus;
        store.state.developer.lastError = message;
        store.state.developer.statusNotice = "授权失败，请返回应用重试";
      }

      applyFeishuSmartAssistantPublicShape(store);
      await this.store.write(store);

      return {
        success: false,
        html: renderDesktopFeishuOAuthCallbackHtml({
          success: false,
          message: "授权失败，请返回应用重试",
        }),
      };
    };

    const returnedError = normalizeText(input.error);
    if (returnedError) {
      const description = normalizeText(input.errorDescription);
      return fail(
        description
          ? `Feishu OAuth returned error: ${returnedError} (${description})`
          : `Feishu OAuth returned error: ${returnedError}`,
      );
    }

    if (!pendingState || normalizeText(input.state) !== pendingState) {
      return fail("Feishu OAuth state mismatch.");
    }

    if (!pendingIssuedAt) {
      return fail("Feishu OAuth state is missing.");
    }

    const issuedAtMs = Date.parse(pendingIssuedAt);
    if (!Number.isFinite(issuedAtMs) || Date.now() - issuedAtMs > PENDING_STATE_MAX_AGE_MS) {
      return fail("Feishu OAuth state expired.");
    }

    const code = normalizeText(input.code);
    if (!code) {
      return fail("Feishu OAuth callback did not include a code.");
    }

    if (!appId || !appSecret) {
      return fail("Desktop Feishu app credentials are incomplete.");
    }

    let token;
    try {
      token = await exchangeDesktopFeishuAuthorizationCode({
        appId,
        appSecret,
        code,
        redirectUri,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }

    store.auth.smartAssistant.accessToken = token.accessToken;
    if (token.refreshToken) {
      store.auth.smartAssistant.refreshToken = token.refreshToken;
    } else {
      delete store.auth.smartAssistant.refreshToken;
    }
    store.auth.smartAssistant.tokenType = token.tokenType;
    store.auth.smartAssistant.scopes = token.scopes;
    clearPendingSmartAssistantAuthorization(store.auth.smartAssistant);

    const now = new Date().toISOString();
    store.state.smartAssistant.authStatus = "authorized";
    store.state.smartAssistant.accessTokenExpiresAt = token.accessTokenExpiresAt;
    store.state.smartAssistant.refreshTokenExpiresAt = token.refreshTokenExpiresAt;
    store.state.smartAssistant.lastAuthorizedAt = now;
    store.state.smartAssistant.lastRefreshedAt = now;
    store.state.smartAssistant.lastError = undefined;
    store.state.smartAssistant.statusNotice = "授权成功，即将关闭";

    if (store.state.developer) {
      store.state.developer.authStatus = "authorized";
      store.state.developer.accessTokenExpiresAt = token.accessTokenExpiresAt;
      store.state.developer.refreshTokenExpiresAt = token.refreshTokenExpiresAt;
      store.state.developer.lastAuthorizedAt = now;
      store.state.developer.lastRefreshedAt = now;
      store.state.developer.lastError = undefined;
      store.state.developer.statusNotice = "授权成功，即将关闭";
    }

    applyFeishuSmartAssistantPublicShape(store);
    await this.store.write(store);

    return {
      success: true,
      html: renderDesktopFeishuOAuthCallbackHtml({
        success: true,
        message: "授权成功，即将关闭",
      }),
    };
  }

  async refreshDeveloperToken(): Promise<FeishuStateView> {
    const store = await this.store.read();
    const appId = normalizeText(store.state.smartAssistant.appId) || normalizeText(store.state.developer?.appId);
    const appSecret = normalizeText(store.auth.smartAssistant.appSecret);
    const refreshToken = normalizeText(store.auth.smartAssistant.refreshToken);

    if (!appId || !appSecret || !refreshToken) {
      throw new Error("Refresh token is missing. Please authorize again.");
    }

    let token;
    try {
      token = await refreshDesktopFeishuAuthorization({
        appId,
        appSecret,
        refreshToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const authStatus =
        error instanceof DesktopFeishuOAuthError
        && error.kind === "provider_rejected"
        && [20026, 20037, 20064, 20073, 20074].includes(error.code ?? 0)
          ? "expired"
          : "error";

      store.state.smartAssistant.authStatus = authStatus;
      store.state.smartAssistant.lastError = message;
      store.state.smartAssistant.statusNotice = authStatus === "expired"
        ? "授权已过期，请重新授权"
        : "授权刷新失败，请稍后重试";

      if (store.state.developer) {
        store.state.developer.authStatus = authStatus;
        store.state.developer.lastError = message;
        store.state.developer.statusNotice = store.state.smartAssistant.statusNotice;
      }

      applyFeishuSmartAssistantPublicShape(store);
      await this.store.write(store);
      throw error;
    }

    store.auth.smartAssistant.accessToken = token.accessToken;
    if (token.refreshToken) {
      store.auth.smartAssistant.refreshToken = token.refreshToken;
    } else {
      delete store.auth.smartAssistant.refreshToken;
    }
    store.auth.smartAssistant.tokenType = token.tokenType;
    store.auth.smartAssistant.scopes = token.scopes;

    const now = new Date().toISOString();
    store.state.smartAssistant.authStatus = "authorized";
    store.state.smartAssistant.accessTokenExpiresAt = token.accessTokenExpiresAt;
    store.state.smartAssistant.refreshTokenExpiresAt = token.refreshTokenExpiresAt;
    store.state.smartAssistant.lastRefreshedAt = now;
    store.state.smartAssistant.lastError = undefined;
    store.state.smartAssistant.statusNotice = "授权已刷新";

    if (store.state.developer) {
      store.state.developer.authStatus = "authorized";
      store.state.developer.accessTokenExpiresAt = token.accessTokenExpiresAt;
      store.state.developer.refreshTokenExpiresAt = token.refreshTokenExpiresAt;
      store.state.developer.lastRefreshedAt = now;
      store.state.developer.lastError = undefined;
      store.state.developer.statusNotice = "授权已刷新";
    }

    applyFeishuSmartAssistantPublicShape(store);
    await this.store.write(store);
    return this.hydrateStoreState(store);
  }

  async clearSmartAssistantConfig(): Promise<FeishuStateView> {
    const store = await this.store.read();
    store.state.mode = store.state.personalDocs.enabled ? "personal" : "none";
    store.state.developer = null;
    store.state.smartAssistant = {
      enabled: false,
      appId: "",
      hasAppSecret: false,
      redirectUri: normalizeDesktopFeishuRedirectUri(),
      redirectOrigin: resolveDesktopFeishuOAuthCallbackOrigin(),
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
    delete store.auth.smartAssistant.appSecret;
    clearStoredSmartAssistantTokens(store.auth.smartAssistant);
    clearPendingSmartAssistantAuthorization(store.auth.smartAssistant);
    applyFeishuSmartAssistantPublicShape(store);
    await this.store.write(store);
    return this.hydrateStoreState(store);
  }

  async clearConfig(): Promise<FeishuStateView> {
    const store = await this.store.read();
    const next: DesktopFeishuStoreSnapshot = {
      ...store,
      state: {
        ...store.state,
        personalDocs: {
          enabled: false,
          discoveredTools: [],
          docsMcp: null,
        },
        smartAssistant: {
          enabled: false,
          appId: "",
          hasAppSecret: false,
          redirectUri: normalizeDesktopFeishuRedirectUri(),
          redirectOrigin: resolveDesktopFeishuOAuthCallbackOrigin(),
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
        },
        mode: "none",
        personal: null,
        developer: null,
        managedMcp: null,
      },
      bot: {
        ...store.bot,
        enabled: false,
        appId: "",
        hasAppSecret: false,
        hasVerificationToken: false,
        hasEncryptKey: false,
        connectionStatus: "stopped",
        updatedAt: new Date().toISOString(),
      },
      auth: {
        smartAssistant: {},
      },
    };
    next.docs = store.docs;
    applyFeishuSmartAssistantPublicShape(next);
    await this.store.write(next);
    return this.hydrateStoreState(next);
  }

  async getBotState(): Promise<FeishuBotStateView> {
    return (await this.store.read()).bot as FeishuBotStateView;
  }

  async saveBotConfig(input: FeishuBotConfigInput): Promise<FeishuBotStateView> {
    const payload = input as any;
    const store = await this.store.read();
    store.bot.enabled = Boolean(payload.enabled);
    store.bot.appId = payload.appId ?? "";
    store.bot.hasAppSecret = Boolean(payload.appSecret);
    store.bot.hasVerificationToken = Boolean(payload.verificationToken);
    store.bot.hasEncryptKey = Boolean(payload.encryptKey);
    store.bot.connectionStatus = payload.enabled ? "ready" : "stopped";
    store.bot.updatedAt = new Date().toISOString();
    await this.store.write(store);
    return store.bot as FeishuBotStateView;
  }

  async clearBotConfig(): Promise<FeishuBotStateView> {
    const store = await this.store.read();
    store.bot = {
      ...store.bot,
      enabled: false,
      appId: "",
      hasAppSecret: false,
      hasVerificationToken: false,
      hasEncryptKey: false,
      connectionStatus: "stopped",
      updatedAt: new Date().toISOString(),
    };
    await this.store.write(store);
    return store.bot as FeishuBotStateView;
  }

  async getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView> {
    return this.docRuntime.getDocsCapabilities();
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
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult> {
    return this.docRuntime.pushWorkspaceDoc(input);
  }

  async executeSmartAssistantAction(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView> {
    return this.actionExecutor.executeSmartAssistantAction(input);
  }
}
