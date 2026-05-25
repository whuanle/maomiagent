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
import {
  mergeDesktopFeishuOAuthScopes,
  normalizeDesktopFeishuRedirectUri,
  resolveDesktopFeishuOAuthCallbackOrigin,
} from "../../../../../shared/desktop-feishu-oauth";
import type { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { refreshDesktopFeishuDeveloperToken } from "./desktop-feishu-developer-token";
import { hydrateDesktopFeishuStateView } from "./desktop-feishu-state-hydrator";

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

export class DesktopFeishuService implements DesktopFeishuPort {
  constructor(
    private readonly store: DesktopFeishuStorePort,
    private readonly actionExecutor: DesktopFeishuActionExecutorPort,
    private readonly docRuntime: DesktopFeishuDocRuntimePort,
    private readonly openApiClient: DesktopFeishuOpenApiClient,
  ) {}

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

  async getState(): Promise<FeishuStateView> {
    const store = await this.store.read();
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
    return this.hydrateState(store.state as FeishuStateView);
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
    return this.hydrateState(store.state as FeishuStateView);
  }

  async saveDeveloperConfig(input: FeishuDeveloperConfigInput): Promise<FeishuStateView> {
    const payload = input as any;
    const store = await this.store.read();
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
      docsMcp: {
        mcpId: "desktop.feishu.smart-assistant",
        name: "maomi_feishu_assistant_docs",
        endpoint: "desktop://feishu-assistant/docs",
        transport: "http-streamable",
        enabled: true,
        updatedAt: now,
      },
    };
    await this.store.write(store);
    return this.hydrateState(store.state as FeishuStateView);
  }

  async beginDeveloperAuthorization(
    input: FeishuDeveloperConfigInput,
  ): Promise<FeishuDeveloperAuthorizeResult> {
    const payload = input as any;
    const store = await this.store.read();
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
    await this.store.write(store);

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
  }

  async handleOAuthCallback(
    input: FeishuOAuthCallbackInput,
  ): Promise<FeishuOAuthCallbackResult> {
    const store = await this.store.read();
    const now = new Date().toISOString();
    const error = input.error?.trim();
    const errorDescription = input.errorDescription?.trim();
    const code = input.code?.trim();

    if (error) {
      const message = errorDescription || error;
      if (store.state.developer) {
        store.state.developer.authStatus = "error";
        store.state.developer.lastError = message;
      }
      store.state.smartAssistant.authStatus = "error";
      store.state.smartAssistant.lastError = message;
      await this.store.write(store);

      return {
        success: false,
        html: renderOAuthCallbackHtml({
          title: "飞书授权失败",
          message,
        }),
      };
    }

    if (!code) {
      const message = "未收到飞书授权码，请重新发起授权。";
      if (store.state.developer) {
        store.state.developer.authStatus = "error";
        store.state.developer.lastError = message;
      }
      store.state.smartAssistant.authStatus = "error";
      store.state.smartAssistant.lastError = message;
      await this.store.write(store);

      return {
        success: false,
        html: renderOAuthCallbackHtml({
          title: "飞书授权失败",
          message,
        }),
      };
    }

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
      await this.store.write(store);

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
      await this.store.write(store);

      return {
        success: false,
        html: renderOAuthCallbackHtml({
          title: "飞书授权失败",
          message,
        }),
      };
    }
  }

  async refreshDeveloperToken(): Promise<FeishuStateView> {
    return refreshDesktopFeishuDeveloperToken({
      store: this.store,
      openApiClient: this.openApiClient,
    });
  }

  async clearSmartAssistantConfig(): Promise<FeishuStateView> {
    const store = await this.store.read();
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
    await this.store.write(store);
    return this.hydrateState(store.state as FeishuStateView);
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
    };
    next.docs = store.docs;
    await this.store.write(next);
    return this.hydrateState(next.state as FeishuStateView);
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
