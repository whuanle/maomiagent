import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopFeishuAuthSnapshot,
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import {
  resolveDesktopFeishuOAuthCallbackOrigin,
  resolveDesktopFeishuOAuthCallbackUrl,
} from "../../../../../shared/desktop-feishu-oauth";

function createInitialStateView(): FeishuStateView {
  const redirectUri = resolveDesktopFeishuOAuthCallbackUrl();
  const redirectOrigin = resolveDesktopFeishuOAuthCallbackOrigin(redirectUri);
  return {
    personalDocs: {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    },
    smartAssistant: {
      enabled: false,
      appId: "",
      hasAppSecret: false,
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
    docs: {
      personal: "https://open.feishu.cn",
      developer: "https://open.feishu.cn",
      authorize: "https://open.feishu.cn",
      token: "https://open.feishu.cn",
      refreshToken: "https://open.feishu.cn",
    },
    catalog: {
      developerScopes: [],
      developerTenantScopes: [],
      developerAllowedTools: [],
      supportedTools: [],
    },
  };
}

function createInitialBotState(): FeishuBotStateView {
  return {
    enabled: false,
    appId: "",
    hasAppSecret: false,
    hasVerificationToken: false,
    hasEncryptKey: false,
    transportMode: "webhook",
    catalog: {
      transportMode: "webhook",
      descriptors: [],
    },
    connectionStatus: "stopped",
    sessionMappingCount: 0,
    processedMessageCount: 0,
    queuedConversationCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

function createInitialSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: createInitialStateView(),
    bot: createInitialBotState(),
    docs: {},
    auth: createInitialAuthSnapshot(),
  };
}

function createInitialAuthSnapshot(): DesktopFeishuAuthSnapshot {
  return {
    smartAssistant: {},
  };
}

export class DesktopFeishuStore implements DesktopFeishuStorePort {
  private readonly storeFilePath: string;

  constructor(
    configuration: DesktopConfigurationPort,
    private readonly logger: RuntimeLogger,
  ) {
    this.storeFilePath = configuration.getString("desktop.feishu.store.path")
      ?? join(homedir(), ".maomiagent", "desktop", "data", "feishu-store.json");
  }

  async read(): Promise<DesktopFeishuStoreSnapshot> {
    try {
      const raw = await readFile(this.storeFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DesktopFeishuStoreSnapshot>;
      const initial = createInitialSnapshot();
      return {
        state: {
          ...initial.state,
          ...(parsed.state ?? {}),
        },
        bot: {
          ...initial.bot,
          ...(parsed.bot ?? {}),
        },
        docs: (parsed.docs ?? {}) as Record<string, FeishuDocContentView>,
        auth: {
          ...initial.auth,
          ...(parsed.auth ?? {}),
          smartAssistant: {
            ...initial.auth.smartAssistant,
            ...((parsed.auth as DesktopFeishuAuthSnapshot | undefined)?.smartAssistant ?? {}),
          },
        },
      };
    } catch {
      return createInitialSnapshot();
    }
  }

  async write(snapshot: DesktopFeishuStoreSnapshot): Promise<void> {
    try {
      await mkdir(dirname(this.storeFilePath), { recursive: true });
      await writeFile(this.storeFilePath, JSON.stringify(snapshot, null, 2), "utf8");
    } catch (error) {
      this.logger.warn("failed to write desktop feishu store", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
