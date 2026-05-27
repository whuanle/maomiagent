import {
  DependencyModuleBase,
  type DependencyModuleRuntimeContext,
  createServiceToken,
  type DependencyModuleContext,
} from "../../../shared/ioc";
import {
  DESKTOP_FEISHU_DOC_MEDIA_PREVIEW_PATH,
  DESKTOP_FEISHU_DOC_WHITEBOARD_PREVIEW_PATH,
  DESKTOP_FEISHU_OAUTH_CALLBACK_PATH,
} from "../../../../shared/desktop-feishu-oauth";
import { DESKTOP_RUNTIME_CONTEXT } from "../../foundation";
import type { DesktopConversationCapabilityProvider } from "../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import { DESKTOP_CONVERSATION_CAPABILITY_PROVIDER } from "../../conversation/abstraction/tokens/desktop-conversation.tokens";
import {
  DESKTOP_CONVERSATION_COMMAND_PORT,
  DESKTOP_CONVERSATION_QUERY_PORT,
  DesktopConversationModule,
  type DesktopConversationCommandPort,
  type DesktopConversationQueryPort,
} from "../../conversation";

import { DESKTOP_AI_ONE_SHOT_PORT, DESKTOP_AI_RUNTIME_PORT, DesktopAiModule } from "../../ai";
import { DESKTOP_CONFIGURATION_PORT, DesktopConfigurationModule } from "../../configuration";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import { DESKTOP_WORKSPACE_QUERY_PORT, DesktopWorkspaceModule } from "../../workspace";
import type { DesktopFeishuPort } from "../abstraction/ports/desktop-feishu.ports";
import { DESKTOP_FEISHU_ACTION_EXECUTOR_PORT } from "../abstraction/tokens/desktop-feishu-action-executor.tokens";
import { DESKTOP_FEISHU_DOC_RUNTIME_PORT } from "../abstraction/tokens/desktop-feishu-doc-runtime.tokens";
import { DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT } from "../abstraction/tokens/desktop-feishu-smart-assistant-action-registry.tokens";
import {
  DESKTOP_FEISHU_COMMAND_PORT,
  DESKTOP_FEISHU_PORT,
  DESKTOP_FEISHU_QUERY_PORT,
} from "../abstraction/tokens/desktop-feishu.tokens";
import { DESKTOP_FEISHU_STORE_PORT } from "../abstraction/tokens/desktop-feishu-store.tokens";
import { DesktopFeishuDocRuntime } from "../implementation/services/desktop-feishu-doc-runtime";
import { DesktopFeishuConversationCapabilityProvider } from "../implementation/services/desktop-feishu-conversation-capability-provider";
import { FeishuDocTreeCache } from "../implementation/services/feishu-doc-tree-cache";
import { FeishuDocTreeLoader } from "../implementation/services/feishu-doc-tree-loader";
import { FeishuDocTreeRemoteSource } from "../implementation/services/feishu-doc-tree-remote-source";
import { DesktopFeishuSmartAssistantActionRegistry } from "../implementation/services/desktop-feishu-smart-assistant-action-registry";
import { DesktopFeishuSmartAssistantActionExecutor } from "../implementation/services/desktop-feishu-smart-assistant-action-executor";
import { DesktopFeishuOpenApiClient } from "../implementation/services/desktop-feishu-openapi-client";
import { DesktopFeishuBotTenantSdkGateway } from "../implementation/services/desktop-feishu-bot-tenant-sdk-gateway";
import {
  DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_INTERVAL_MS,
  ensureDesktopFeishuDeveloperAccessToken,
  failDesktopFeishuDeveloperAutoRefreshTask,
  markDesktopFeishuDeveloperAutoRefreshTaskRunning,
  scheduleDesktopFeishuDeveloperAutoRefreshTask,
  withDesktopFeishuDeveloperAccessTokenRetry,
} from "../implementation/services/desktop-feishu-developer-token";
import {
  DesktopFeishuBotRuntime,
  type DesktopFeishuBotRuntimePort,
} from "../implementation/services/desktop-feishu-bot-runtime";
import { DesktopFeishuBotSemanticClassifier } from "../implementation/services/desktop-feishu-bot-semantic-classifier";
import { DesktopFeishuService } from "../implementation/services/desktop-feishu-service";
import { runDesktopFeishuStoreMutation } from "../implementation/services/desktop-feishu-store-mutation";
import { DesktopFeishuStore } from "../implementation/stores/desktop-feishu-store";

export const DESKTOP_FEISHU_SERVICE_TOKEN =
  createServiceToken<DesktopFeishuPort>("desktop.feishu.service");
export const DESKTOP_FEISHU_BOT_RUNTIME_TOKEN =
  createServiceToken<DesktopFeishuBotRuntimePort>("desktop.feishu.bot-runtime");
export const DESKTOP_FEISHU_CONVERSATION_CAPABILITY_PROVIDER_TOKEN =
  createServiceToken<DesktopConversationCapabilityProvider>(
    "desktop.feishu.conversation-capability-provider",
  );

export class DesktopFeishuModule extends DependencyModuleBase {
  static moduleId = "desktop.feishu";
  static dependencies = [
    DesktopConfigurationModule,
    DesktopLogsModule,
    DesktopAiModule,
    DesktopWorkspaceModule,
    DesktopConversationModule,
  ] as const;

  private unregisterHttpRoutes: Array<() => void> = [];
  private botRuntime: DesktopFeishuBotRuntimePort | null = null;
  private developerTokenAutoRefreshHandle: ReturnType<typeof setInterval> | null = null;

  override configureServices(context: DependencyModuleContext): void {
    const openApiClient = new DesktopFeishuOpenApiClient();

    context.addSingleton(DESKTOP_FEISHU_STORE_PORT, {
      useFactory: (services) => new DesktopFeishuStore(
        services.resolve(DESKTOP_CONFIGURATION_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.feishu.store",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_DOC_RUNTIME_PORT, {
      useFactory: (services) => {
        const store = services.resolve(DESKTOP_FEISHU_STORE_PORT);
        const treeCache = new FeishuDocTreeCache(store);
        const accessToken = async (input?: { forceRefresh?: boolean }) => {
          return ensureDesktopFeishuDeveloperAccessToken({
            store,
            openApiClient,
            forceRefresh: input?.forceRefresh,
          });
        };
        const remoteSource = new FeishuDocTreeRemoteSource({
          getJson: async <T>(url: string, _accessToken: string) => withDesktopFeishuDeveloperAccessTokenRetry(
            {
              store,
              openApiClient,
            },
            ({ accessToken }) => openApiClient.getJson<T>(url, accessToken),
          ),
        });
        const treeLoader = new FeishuDocTreeLoader({
          scopeId: () => "desktop.feishu.smart-assistant",
          accessToken: () => accessToken(),
          now: () => new Date().toISOString(),
          cache: treeCache,
          remote: remoteSource,
          emit: () => undefined,
        });
        return new DesktopFeishuDocRuntime({
          store,
          loader: treeLoader,
          contentSource: remoteSource,
          accessToken,
          workspaceQuery: services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
        });
      },
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT, {
      useFactory: (services) => new DesktopFeishuSmartAssistantActionRegistry(
        services.resolve(DESKTOP_AI_RUNTIME_PORT),
        services.resolve(DESKTOP_FEISHU_DOC_RUNTIME_PORT),
        new DesktopFeishuBotTenantSdkGateway({
          store: services.resolve(DESKTOP_FEISHU_STORE_PORT),
          openApiClient,
        }),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_ACTION_EXECUTOR_PORT, {
      useFactory: (services) => new DesktopFeishuSmartAssistantActionExecutor(
        services.resolve(DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_BOT_RUNTIME_TOKEN, {
      useFactory: (services) => new DesktopFeishuBotRuntime(
        services.resolve(DESKTOP_FEISHU_STORE_PORT),
        services.resolve(DESKTOP_CONVERSATION_COMMAND_PORT) as DesktopConversationCommandPort,
        services.resolve(DESKTOP_CONVERSATION_QUERY_PORT) as DesktopConversationQueryPort,
        services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
        services.resolve(DESKTOP_FEISHU_ACTION_EXECUTOR_PORT),
        new DesktopFeishuBotSemanticClassifier(
          services.resolve(DESKTOP_AI_ONE_SHOT_PORT),
        ),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.feishu.bot",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopFeishuService(
        services.resolve(DESKTOP_FEISHU_STORE_PORT),
        services.resolve(DESKTOP_FEISHU_ACTION_EXECUTOR_PORT),
        services.resolve(DESKTOP_FEISHU_DOC_RUNTIME_PORT),
        openApiClient,
        () => services.resolve(DESKTOP_FEISHU_BOT_RUNTIME_TOKEN),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_CONVERSATION_CAPABILITY_PROVIDER_TOKEN, {
      useFactory: (services) => new DesktopFeishuConversationCapabilityProvider(
        services.resolve(DESKTOP_FEISHU_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_FEISHU_PORT, DESKTOP_FEISHU_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_FEISHU_QUERY_PORT, DESKTOP_FEISHU_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_FEISHU_COMMAND_PORT, DESKTOP_FEISHU_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
      DESKTOP_FEISHU_CONVERSATION_CAPABILITY_PROVIDER_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const runtimeContext = context.container.resolve(DESKTOP_RUNTIME_CONTEXT);
    const feishu = context.container.resolve(DESKTOP_FEISHU_PORT);
    const store = context.container.resolve(DESKTOP_FEISHU_STORE_PORT);
    const docRuntime = context.container.resolve(DESKTOP_FEISHU_DOC_RUNTIME_PORT) as DesktopFeishuDocRuntime;
    const botRuntime = context.container.resolve(DESKTOP_FEISHU_BOT_RUNTIME_TOKEN);
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.feishu",
    });
    this.botRuntime = botRuntime;

    this.unregisterHttpRoutes.forEach((unregister) => unregister());
    this.unregisterHttpRoutes = [];
    if (this.developerTokenAutoRefreshHandle) {
      clearInterval(this.developerTokenAutoRefreshHandle);
      this.developerTokenAutoRefreshHandle = null;
    }

    const registerPreviewRoute = (input: {
      path: string;
      kind: "media" | "whiteboard";
      read: (token: string) => Promise<{ contentType: string; bytes: Uint8Array }>;
    }) => runtimeContext.singleInstance.registerHttpRoute({
      method: "GET",
      path: input.path,
      handler: async (request) => {
        const token = request.url.searchParams.get("token")?.trim() ?? "";
        if (!token) {
          return {
            status: 400,
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
            body: "token is required",
          };
        }

        try {
          const preview = await input.read(token);
          return {
            status: 200,
            headers: {
              "content-type": preview.contentType,
              "cache-control": "no-store",
            },
            bodyBytes: preview.bytes,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await logger.warn("Desktop feishu preview route failed", {
            context: {
              path: input.path,
              kind: input.kind,
              token,
              message,
            },
          });
          return {
            status: 502,
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
            body: message,
          };
        }
      },
    });

    this.unregisterHttpRoutes = [
      runtimeContext.singleInstance.registerHttpRoute({
        method: "GET",
        path: DESKTOP_FEISHU_OAUTH_CALLBACK_PATH,
        handler: async (request) => {
          const result = await feishu.handleOAuthCallback({
            code: request.url.searchParams.get("code") ?? undefined,
            state: request.url.searchParams.get("state") ?? undefined,
            error: request.url.searchParams.get("error") ?? undefined,
            errorDescription: request.url.searchParams.get("error_description") ?? undefined,
          });

          return {
            status: result.success ? 200 : 400,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
            body: result.html,
          };
        },
      }),
      registerPreviewRoute({
        path: DESKTOP_FEISHU_DOC_MEDIA_PREVIEW_PATH,
        kind: "media",
        read: (token) => docRuntime.readDocMediaPreview(token),
      }),
      registerPreviewRoute({
        path: DESKTOP_FEISHU_DOC_WHITEBOARD_PREVIEW_PATH,
        kind: "whiteboard",
        read: (token) => docRuntime.readDocWhiteboardPreview(token),
      }),
    ];

    await logger.info("Desktop feishu OAuth callback route registered", {
      context: {
        path: DESKTOP_FEISHU_OAUTH_CALLBACK_PATH,
      },
    });
    await logger.info("Desktop feishu preview routes registered", {
      context: {
        paths: [DESKTOP_FEISHU_DOC_MEDIA_PREVIEW_PATH, DESKTOP_FEISHU_DOC_WHITEBOARD_PREVIEW_PATH],
      },
    });

    const runDeveloperTokenAutoRefresh = async () => {
      try {
        const state = await feishu.getState();
        if (state.smartAssistant.authStatus !== "authorized" || !state.smartAssistant.hasRefreshToken) {
          return;
        }

        await runDesktopFeishuStoreMutation(store, (snapshot) => {
          markDesktopFeishuDeveloperAutoRefreshTaskRunning(snapshot, new Date());
        });
        await feishu.refreshDeveloperToken();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await runDesktopFeishuStoreMutation(store, (snapshot) => {
          failDesktopFeishuDeveloperAutoRefreshTask(snapshot, new Date());
        });
        await logger.warn("Desktop feishu auto refresh failed", {
          context: {
            message,
          },
        });
      }
    };

    const state = await feishu.getState();
    if (state.smartAssistant.authStatus === "authorized" && state.smartAssistant.hasRefreshToken) {
      await runDesktopFeishuStoreMutation(store, (snapshot) => {
        scheduleDesktopFeishuDeveloperAutoRefreshTask(snapshot, new Date(), "queued");
      });
    }

    this.developerTokenAutoRefreshHandle = setInterval(() => {
      void runDeveloperTokenAutoRefresh();
    }, DESKTOP_FEISHU_DEVELOPER_TOKEN_AUTO_REFRESH_INTERVAL_MS);

    await botRuntime.start();
  }

  override async onStop(): Promise<void> {
    if (this.developerTokenAutoRefreshHandle) {
      clearInterval(this.developerTokenAutoRefreshHandle);
      this.developerTokenAutoRefreshHandle = null;
    }
    await this.botRuntime?.stop();
    this.botRuntime = null;
    this.unregisterHttpRoutes.forEach((unregister) => unregister());
    this.unregisterHttpRoutes = [];
  }
}
