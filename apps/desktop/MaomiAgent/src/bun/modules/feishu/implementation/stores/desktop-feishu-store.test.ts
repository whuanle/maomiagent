import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger, RuntimeLogRecord } from "../../../logs";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuStore } from "./desktop-feishu-store";

function createConfiguration(storeFilePath: string): DesktopConfigurationPort {
  return {
    get: (key) => (key === "desktop.feishu.store.path" ? storeFilePath : undefined),
    getString: (key, fallback) => (key === "desktop.feishu.store.path" ? storeFilePath : fallback),
    getBoolean: (_key, fallback) => fallback,
    getNumber: (_key, fallback) => fallback,
    getRecord: () => undefined,
    requireString: (key) => {
      if (key === "desktop.feishu.store.path") {
        return storeFilePath;
      }
      throw new Error(`Missing configuration value: ${key}`);
    },
    snapshot: () => ({ values: {} }),
  };
}

function createLogger(): RuntimeLogger {
  const write = async (level: RuntimeLogRecord["level"], message: string): Promise<RuntimeLogRecord> => ({
    id: `${level}-${message}`,
    at: new Date(0).toISOString(),
    level,
    source: "desktop-test",
    module: "desktop.feishu.store.test",
    message,
  });

  return {
    write,
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
  };
}

async function createStoreFixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-store-"));
  const storeFilePath = join(tempRoot, "feishu-store.json");
  const store = new DesktopFeishuStore(createConfiguration(storeFilePath), createLogger());

  return {
    store,
    storeFilePath,
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  };
}

describe("DesktopFeishuStore", () => {
  test("migrates legacy snapshots with developer and doc tree defaults", async () => {
    const fixture = await createStoreFixture();

    try {
      await writeFile(fixture.storeFilePath, JSON.stringify({ docs: {} }), "utf8");

      const snapshot = await fixture.store.read();

      expect(snapshot.docTreeCache).toEqual({
        lastRootToken: "",
        lastRootUpdatedAt: "",
        roots: {},
        branches: {},
        contents: {},
      });
      expect(snapshot.developerCredential).toEqual({
        appSecret: "",
      });
      expect(snapshot.developerToken).toEqual({
        accessToken: "",
        refreshToken: "",
        accessTokenExpiresAt: "",
        refreshTokenExpiresAt: "",
      });
      expect(snapshot.botRuntime.pendingActions).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  test("migrates legacy bot runtime snapshots with empty pending actions", async () => {
    const fixture = await createStoreFixture();

    try {
      await writeFile(fixture.storeFilePath, JSON.stringify({
        botRuntime: {
          version: "1.0",
          bindings: [],
          processedMessages: [],
        },
      }), "utf8");

      const snapshot = await fixture.store.read();

      expect(snapshot.botRuntime.pendingActions).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  test("persists docs and doc tree roots without dropping either collection", async () => {
    const fixture = await createStoreFixture();

    try {
      const initial = await fixture.store.read();
      const snapshot: DesktopFeishuStoreSnapshot = {
        ...initial,
        docs: {
          doc_1: {
            docId: "doc_1",
            title: "Existing Doc",
            markdown: "# Existing Doc",
            updatedAt: "2026-05-21T00:00:00.000Z",
          },
        },
        docTreeCache: {
          ...initial.docTreeCache,
          lastRootToken: "root_token",
          lastRootUpdatedAt: "2026-05-21T00:00:00.000Z",
          roots: {
            root_token: {
              token: "root_token",
              kind: "document",
              rootNodeId: "doc_1",
              title: "Existing Doc",
              loadedAt: "2026-05-21T00:00:00.000Z",
            },
          },
        },
      };

      await fixture.store.write(snapshot);

      const persisted = JSON.parse(await readFile(fixture.storeFilePath, "utf8")) as DesktopFeishuStoreSnapshot;
      expect(persisted.docs.doc_1).toMatchObject({
        docId: "doc_1",
        title: "Existing Doc",
      });
      expect(persisted.docTreeCache.roots.root_token).toMatchObject({
        token: "root_token",
        kind: "document",
        rootNodeId: "doc_1",
        title: "Existing Doc",
      });
      expect(persisted.docTreeCache.lastRootToken).toBe("root_token");
      expect(persisted.docTreeCache.lastRootUpdatedAt).toBe("2026-05-21T00:00:00.000Z");

      const reloaded = await fixture.store.read();
      expect(reloaded.docs.doc_1).toMatchObject({
        docId: "doc_1",
        title: "Existing Doc",
      });
      expect(reloaded.docTreeCache.roots.root_token).toMatchObject({
        token: "root_token",
        kind: "document",
        rootNodeId: "doc_1",
      });
      expect(reloaded.docTreeCache.lastRootToken).toBe("root_token");
    } finally {
      await fixture.cleanup();
    }
  });

  test("auto-recovers garbled feishu doc markdown and title from stored docs", async () => {
    const fixture = await createStoreFixture();

    try {
      const markdown = "# 飞书文档\n\n这里是正常中文。";
      const title = "飞书文档";
      const mojibakeMarkdown = Buffer.from(markdown, "utf8").toString("latin1");
      const mojibakeTitle = Buffer.from(title, "utf8").toString("latin1");

      await writeFile(fixture.storeFilePath, JSON.stringify({
        docs: {
          doc_1: {
            docId: "doc_1",
            title: mojibakeTitle,
            markdown: mojibakeMarkdown,
            length: mojibakeMarkdown.length,
            totalLength: mojibakeMarkdown.length,
            offset: 0,
            analysis: {
              riskyBlocks: [],
              riskySync: false,
              syncMode: null,
              riskyBlockMode: "safe",
            },
          },
        },
      }), "utf8");

      const snapshot = await fixture.store.read();

      expect(snapshot.docs.doc_1?.title).toBe(title);
      expect(snapshot.docs.doc_1?.markdown).toBe(markdown);

      const persisted = JSON.parse(await readFile(fixture.storeFilePath, "utf8")) as DesktopFeishuStoreSnapshot;
      expect(persisted.docs.doc_1?.title).toBe(title);
      expect(persisted.docs.doc_1?.markdown).toBe(markdown);
    } finally {
      await fixture.cleanup();
    }
  });

  test("persists bot form fields so they can be restored after restart", async () => {
    const fixture = await createStoreFixture();

    try {
      const initial = await fixture.store.read();
      const snapshot: DesktopFeishuStoreSnapshot = {
        ...initial,
        bot: {
          ...initial.bot,
          enabled: true,
          appId: "cli_test_bot",
          appSecret: "secret-1",
          hasAppSecret: true,
          verificationToken: "verify-1",
          hasVerificationToken: true,
          encryptKey: "encrypt-1",
          hasEncryptKey: true,
          allowWorkspaceSwitch: true,
          workspaceSwitchScope: "restricted",
          allowedExecutionWorkspaceIds: ["workspace-a"],
          selectedChannelId: "channel-alpha",
          selectedModelId: "model-alpha",
          savedAt: "2026-05-25T08:00:00.000Z",
          updatedAt: "2026-05-25T08:00:00.000Z",
        },
      };

      await fixture.store.write(snapshot);

      const reloaded = await fixture.store.read();
      expect(reloaded.bot).toMatchObject({
        enabled: true,
        appId: "cli_test_bot",
        appSecret: "secret-1",
        hasAppSecret: true,
        verificationToken: "verify-1",
        hasVerificationToken: true,
        encryptKey: "encrypt-1",
        hasEncryptKey: true,
        allowWorkspaceSwitch: true,
        workspaceSwitchScope: "restricted",
        allowedExecutionWorkspaceIds: ["workspace-a"],
        selectedChannelId: "channel-alpha",
        selectedModelId: "model-alpha",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  test("falls back to copying the temp snapshot when Windows rejects rename", async () => {
    const fixture = await createStoreFixture();
    const store = new DesktopFeishuStore(createConfiguration(fixture.storeFilePath), createLogger(), {
      mkdir,
      readFile,
      writeFile,
      copyFile,
      unlink,
      rename: async () => {
        const error = new Error("operation not permitted") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      },
    });

    try {
      const snapshot = await store.read();
      snapshot.state.smartAssistant.enabled = true;
      snapshot.state.smartAssistant.appId = "cli_test_app";

      await store.write(snapshot);

      const persisted = JSON.parse(await readFile(fixture.storeFilePath, "utf8")) as DesktopFeishuStoreSnapshot;
      expect(persisted.state.smartAssistant.enabled).toBe(true);
      expect(persisted.state.smartAssistant.appId).toBe("cli_test_app");

      const files = await readdir(dirname(fixture.storeFilePath));
      expect(files.filter((file) => file.endsWith(".tmp"))).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  test("persists pending bot actions without dropping processed messages", async () => {
    const fixture = await createStoreFixture();

    try {
      const initial = await fixture.store.read();
      const snapshot: DesktopFeishuStoreSnapshot = {
        ...initial,
        botRuntime: {
          ...initial.botRuntime,
          processedMessages: [{
            messageId: "om_1",
            conversationKey: "tenant-1:oc_1:root",
            status: "completed",
            createdAt: "2026-05-25T09:00:00.000Z",
            updatedAt: "2026-05-25T09:00:01.000Z",
          }],
          pendingActions: [{
            pendingId: "pending_1",
            scopeKey: "tenant-1:oc_1:root",
            chatId: "oc_1",
            messageId: "om_1",
            domain: "calendar",
            actionId: "calendar.create_event",
            workspaceId: "workspace-a",
            summary: "准备创建会议",
            details: ["今天 9:00-10:00", "主题 AI 落地讨论"],
            executeInput: {
              actionId: "calendar.create_event",
              workspaceId: "workspace-a",
              title: "AI 落地讨论",
              startAt: "2026-05-25T09:00:00+08:00",
              endAt: "2026-05-25T10:00:00+08:00",
            },
            initiatorSenderId: "ou_user_1",
            initiatorSenderName: "张三",
            createdAt: "2026-05-25T09:00:00.000Z",
            updatedAt: "2026-05-25T09:00:00.000Z",
            expiresAt: "2026-05-25T09:30:00.000Z",
          }],
        },
      };

      await fixture.store.write(snapshot);

      const persisted = JSON.parse(await readFile(fixture.storeFilePath, "utf8")) as DesktopFeishuStoreSnapshot;
      expect(persisted.botRuntime.processedMessages).toHaveLength(1);
      expect(persisted.botRuntime.pendingActions).toEqual([
        expect.objectContaining({
          pendingId: "pending_1",
          actionId: "calendar.create_event",
          summary: "准备创建会议",
        }),
      ]);

      const reloaded = await fixture.store.read();
      expect(reloaded.botRuntime.processedMessages).toHaveLength(1);
      expect(reloaded.botRuntime.pendingActions).toEqual([
        expect.objectContaining({
          pendingId: "pending_1",
          actionId: "calendar.create_event",
          summary: "准备创建会议",
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  test("serializes mutate operations so later writes keep earlier saved credentials", async () => {
    const fixture = await createStoreFixture();

    try {
      let releaseFirst: (() => void) | null = null;
      const firstStarted = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let waitForRelease!: () => void;
      const firstBlocker = new Promise<void>((resolve) => {
        waitForRelease = resolve;
      });

      const firstMutation = fixture.store.mutate!(async (snapshot) => {
        snapshot.state.mode = "developer";
        snapshot.state.smartAssistant.enabled = true;
        snapshot.state.smartAssistant.appId = "cli_test_app";
        snapshot.state.smartAssistant.hasAppSecret = true;
        snapshot.state.developer = {
          appId: "cli_test_app",
          hasAppSecret: true,
          redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
          redirectOrigin: "http://127.0.0.1:35000",
          authStatus: "idle",
          authMethod: "oauth",
          hasRefreshToken: false,
          scopes: [],
          allowedTools: [],
          autoRefreshTask: {
            enabled: false,
          },
        } as DesktopFeishuStoreSnapshot["state"]["developer"];
        snapshot.developerCredential.appSecret = "secret-1";
        releaseFirst?.();
        await firstBlocker;
      });

      await firstStarted;

      const secondMutation = fixture.store.mutate!(async (snapshot) => {
        snapshot.state.smartAssistant.authStatus = "error";
        snapshot.state.smartAssistant.lastError = "请先完成飞书授权";
      });

      waitForRelease();
      await Promise.all([firstMutation, secondMutation]);

      const reloaded = await fixture.store.read();
      expect(reloaded.state.smartAssistant.appId).toBe("cli_test_app");
      expect(reloaded.state.developer?.appId).toBe("cli_test_app");
      expect(reloaded.developerCredential.appSecret).toBe("secret-1");
      expect(reloaded.state.smartAssistant.lastError).toBe("请先完成飞书授权");
    } finally {
      await fixture.cleanup();
    }
  });
});
