import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { DesktopConversationWorkspaceSettings } from "../../../../../shared/desktop-conversation";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import {
  createDefaultDesktopConversationWorkspaceSettings,
  DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION,
  DesktopConversationWorkspaceSettingsService,
} from "./desktop-conversation-workspace-settings-service";

const WORKSPACE_ID = "workspace-1";

function createWorkspaceQuery(workspaceId: string, directoryPath: string): Pick<DesktopWorkspaceQueryPort, "get"> {
  return {
    get: async (candidateWorkspaceId) => candidateWorkspaceId === workspaceId
      ? {
          workspaceId,
          name: "Test Workspace",
          directoryPath,
          isPinned: false,
          tags: [],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }
      : null,
  };
}

async function withWorkspace(run: (input: {
  workspaceRoot: string;
  service: DesktopConversationWorkspaceSettingsService;
  settingsPath: string;
}) => Promise<void>) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-chat-workspace-settings-"));
  const service = new DesktopConversationWorkspaceSettingsService(
    createWorkspaceQuery(WORKSPACE_ID, workspaceRoot),
  );
  const settingsPath = join(workspaceRoot, ".maomi", "chat", "settings.json");

  try {
    await run({
      workspaceRoot,
      service,
      settingsPath,
    });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

describe("DesktopConversationWorkspaceSettingsService", () => {
  test("returns built-in defaults when the workspace settings file is missing", async () => {
    await withWorkspace(async ({ service, settingsPath }) => {
      const result = await service.read({ workspaceId: WORKSPACE_ID });

      expect(result).toEqual({
        workspaceId: WORKSPACE_ID,
        version: DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION,
        path: settingsPath,
        exists: false,
        updatedAt: undefined,
        settings: createDefaultDesktopConversationWorkspaceSettings(),
        warnings: [],
      });
    });
  });

  test("writes merged patches into a versioned workspace settings document", async () => {
    await withWorkspace(async ({ service, settingsPath }) => {
      await service.save({
        workspaceId: WORKSPACE_ID,
        patch: {
          selectedChannelId: "openai",
          selectedModelId: "gpt-5",
          defaultTerminalShellKind: "bash",
          assistantAvatarDataUrl: "data:image/png;base64,AAAA",
          userAvatarDataUrl: "data:image/png;base64,BBBB",
          capabilityPreferences: {
            "mcp.runtime": false,
          },
        },
      });

      const saved = await service.save({
        workspaceId: WORKSPACE_ID,
        patch: {
          thinkingEnabled: false,
          contextCompressionThresholdPercent: 83,
        },
      });

      expect(saved.settings).toEqual({
        ...createDefaultDesktopConversationWorkspaceSettings(),
        selectedChannelId: "openai",
        selectedModelId: "gpt-5",
        defaultTerminalShellKind: "bash",
        assistantAvatarDataUrl: "data:image/png;base64,AAAA",
        userAvatarDataUrl: "data:image/png;base64,BBBB",
        thinkingEnabled: false,
        contextCompressionThresholdPercent: 85,
        capabilityPreferences: {
          "memory.runtime": true,
          "mcp.runtime": false,
          "skills.runtime": true,
          "feishu.smartAssistant": false,
        },
      } satisfies DesktopConversationWorkspaceSettings);

      const document = JSON.parse(await readFile(settingsPath, "utf8")) as {
        version: number;
        updatedAt: string;
        settings: DesktopConversationWorkspaceSettings;
      };

      expect(document.version).toBe(DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION);
      expect(document.updatedAt).toBe(saved.updatedAt);
      expect(document.settings).toEqual(saved.settings);
    });
  });

  test("falls back to defaults with warnings when the settings JSON is malformed", async () => {
    await withWorkspace(async ({ service, settingsPath }) => {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, "{ invalid json", "utf8");

      const result = await service.read({ workspaceId: WORKSPACE_ID });

      expect(result.exists).toBe(true);
      expect(result.settings).toEqual(createDefaultDesktopConversationWorkspaceSettings());
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("malformed");
    });
  });

  test("clears malformed-file warnings after a successful save rewrites the document", async () => {
    await withWorkspace(async ({ service, settingsPath }) => {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, "{ invalid json", "utf8");

      const saved = await service.save({
        workspaceId: WORKSPACE_ID,
        patch: {
          thinkingEnabled: false,
        },
      });

      expect(saved.warnings).toEqual([]);
      expect(saved.settings.thinkingEnabled).toBe(false);

      const reread = await service.read({ workspaceId: WORKSPACE_ID });
      expect(reread.warnings).toEqual([]);
      expect(reread.settings.thinkingEnabled).toBe(false);
    });
  });

  test("requires selected channel and model to be saved together", async () => {
    await withWorkspace(async ({ service, settingsPath }) => {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, `${JSON.stringify({
        version: DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION,
        updatedAt: "2026-05-29T10:00:00.000Z",
        settings: {
          selectedChannelId: "openai",
        },
      }, null, 2)}\n`, "utf8");

      const loaded = await service.read({ workspaceId: WORKSPACE_ID });
      expect(loaded.settings.selectedChannelId).toBeUndefined();
      expect(loaded.settings.selectedModelId).toBeUndefined();
      expect(loaded.warnings.some((warning) => warning.includes("must be saved together"))).toBe(true);

      const saved = await service.save({
        workspaceId: WORKSPACE_ID,
        patch: {
          selectedChannelId: "anthropic",
        },
      });

      expect(saved.settings.selectedChannelId).toBeUndefined();
      expect(saved.settings.selectedModelId).toBeUndefined();

      const document = JSON.parse(await readFile(settingsPath, "utf8")) as {
        settings: DesktopConversationWorkspaceSettings;
      };
      expect(document.settings.selectedChannelId).toBeUndefined();
      expect(document.settings.selectedModelId).toBeUndefined();
    });
  });

  test("serializes concurrent saves so later patches preserve earlier fields", async () => {
    await withWorkspace(async ({ service, settingsPath }) => {
      const [first, second] = await Promise.all([
        service.save({
          workspaceId: WORKSPACE_ID,
          patch: {
            selectedChannelId: "openai",
            selectedModelId: "gpt-5",
          },
        }),
        service.save({
          workspaceId: WORKSPACE_ID,
          patch: {
            thinkingEnabled: false,
            capabilityPreferences: {
              "skills.runtime": false,
            },
          },
        }),
      ]);

      expect(first.settings.selectedChannelId).toBe("openai");
      expect(second.settings).toEqual({
        ...createDefaultDesktopConversationWorkspaceSettings(),
        selectedChannelId: "openai",
        selectedModelId: "gpt-5",
        thinkingEnabled: false,
        capabilityPreferences: {
          "memory.runtime": true,
          "mcp.runtime": true,
          "skills.runtime": false,
          "feishu.smartAssistant": false,
        },
      } satisfies DesktopConversationWorkspaceSettings);

      const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as {
        settings: DesktopConversationWorkspaceSettings;
      };
      expect(persisted.settings).toEqual(second.settings);
    });
  });
});
