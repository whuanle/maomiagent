import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopFeishuBotRuntimeSnapshot,
  DesktopFeishuDeveloperCredentialSnapshot,
  DesktopFeishuDeveloperTokenSnapshot,
  DesktopFeishuDocTreeCacheSnapshot,
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";

function createInitialStateView(): FeishuStateView {
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
    appSecret: "",
    hasAppSecret: false,
    verificationToken: "",
    hasVerificationToken: false,
    encryptKey: "",
    hasEncryptKey: false,
    transportMode: "websocket",
    catalog: {
      transportMode: "websocket",
      descriptors: [],
    },
    connectionStatus: "disconnected",
    sessionMappingCount: 0,
    processedMessageCount: 0,
    queuedConversationCount: 0,
    recentProcessedMessages: [],
    updatedAt: new Date().toISOString(),
  };
}

function createInitialBotRuntime(): DesktopFeishuBotRuntimeSnapshot {
  return {
    version: "1.0",
    bindings: [],
    processedMessages: [],
    pendingActions: [],
  };
}

function createInitialDeveloperCredential(): DesktopFeishuDeveloperCredentialSnapshot {
  return {
    appSecret: "",
  };
}

function createInitialDeveloperToken(): DesktopFeishuDeveloperTokenSnapshot {
  return {
    accessToken: "",
    refreshToken: "",
    accessTokenExpiresAt: "",
    refreshTokenExpiresAt: "",
  };
}

function createInitialDocTreeCache(): DesktopFeishuDocTreeCacheSnapshot {
  return {
    lastRootToken: "",
    lastRootUpdatedAt: "",
    roots: {},
    branches: {},
    contents: {},
  };
}

function createInitialSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: createInitialStateView(),
    bot: createInitialBotState(),
    botRuntime: createInitialBotRuntime(),
    docs: {},
    developerCredential: createInitialDeveloperCredential(),
    developerToken: createInitialDeveloperToken(),
    docTreeCache: createInitialDocTreeCache(),
  };
}

type DesktopFeishuStoreFileSystem = {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  writeFile: typeof writeFile;
  rename: typeof rename;
  copyFile: typeof copyFile;
  unlink: typeof unlink;
};

const nodeFileSystem: DesktopFeishuStoreFileSystem = {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  unlink,
};

function shouldFallbackToCopyOnRenameFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EACCES";
}

export class DesktopFeishuStore implements DesktopFeishuStorePort {
  private readonly storeFilePath: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    configuration: DesktopConfigurationPort,
    private readonly logger: RuntimeLogger,
    private readonly fileSystem: DesktopFeishuStoreFileSystem = nodeFileSystem,
  ) {
    this.storeFilePath = configuration.getString("desktop.feishu.store.path")
      ?? join(homedir(), ".maomiagent", "desktop", "data", "feishu-store.json");
  }

  async read(): Promise<DesktopFeishuStoreSnapshot> {
    return this.readSnapshotFromDisk();
  }

  async write(snapshot: DesktopFeishuStoreSnapshot): Promise<void> {
    await this.persistSnapshot(snapshot);
  }

  async mutate<T>(mutator: (snapshot: DesktopFeishuStoreSnapshot) => Promise<T> | T): Promise<T> {
    const next = this.mutationQueue.then(async () => {
      const snapshot = await this.readSnapshotFromDisk();
      const result = await mutator(snapshot);
      await this.persistSnapshot(snapshot);
      return result;
    });

    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async readSnapshotFromDisk(): Promise<DesktopFeishuStoreSnapshot> {
    try {
      const raw = await this.fileSystem.readFile(this.storeFilePath, "utf8");
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
        botRuntime: {
          ...initial.botRuntime,
          ...(parsed.botRuntime ?? {}),
          bindings: Array.isArray(parsed.botRuntime?.bindings)
            ? parsed.botRuntime.bindings
            : initial.botRuntime.bindings,
          processedMessages: Array.isArray(parsed.botRuntime?.processedMessages)
            ? parsed.botRuntime.processedMessages
            : initial.botRuntime.processedMessages,
          pendingActions: Array.isArray(parsed.botRuntime?.pendingActions)
            ? parsed.botRuntime.pendingActions
            : initial.botRuntime.pendingActions,
        },
        docs: (parsed.docs ?? {}) as Record<string, FeishuDocContentView>,
        developerCredential: {
          ...initial.developerCredential,
          ...(parsed.developerCredential ?? {}),
        },
        developerToken: {
          ...initial.developerToken,
          ...(parsed.developerToken ?? {}),
        },
        docTreeCache: {
          lastRootToken: parsed.docTreeCache?.lastRootToken ?? initial.docTreeCache.lastRootToken,
          lastRootUpdatedAt: parsed.docTreeCache?.lastRootUpdatedAt ?? initial.docTreeCache.lastRootUpdatedAt,
          roots: parsed.docTreeCache?.roots ?? initial.docTreeCache.roots,
          branches: parsed.docTreeCache?.branches ?? initial.docTreeCache.branches,
          contents: parsed.docTreeCache?.contents ?? initial.docTreeCache.contents,
        },
      };
    } catch {
      return createInitialSnapshot();
    }
  }

  private async persistSnapshot(snapshot: DesktopFeishuStoreSnapshot): Promise<void> {
    try {
      await this.fileSystem.mkdir(dirname(this.storeFilePath), { recursive: true });
      const tempPath = `${this.storeFilePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      await this.fileSystem.writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
      try {
        await this.fileSystem.rename(tempPath, this.storeFilePath);
      } catch (renameError) {
        if (!shouldFallbackToCopyOnRenameFailure(renameError)) {
          throw renameError;
        }

        await this.fileSystem.copyFile(tempPath, this.storeFilePath);
        await this.fileSystem.unlink(tempPath).catch(() => undefined);
      }
    } catch (error) {
      await this.logger.warn("failed to write desktop feishu store", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
