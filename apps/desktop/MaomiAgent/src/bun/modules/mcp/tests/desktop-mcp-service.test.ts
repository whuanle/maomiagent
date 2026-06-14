import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopConfigurationService } from "../../configuration";
import type { DesktopRuntimeContext } from "../../foundation";
import { DesktopMcpService } from "../implementation/services/desktop-mcp-service";
import type { DesktopWorkspaceQueryPort } from "../../workspace";
import type { RuntimeLogger, RuntimeLogRecord } from "../../../../shared/runtime-logs";

const DESKTOP_PACKAGE_TMP_ROOT = join(import.meta.dir, "..", "..", "..", "..", "..", "tmp");

async function writeFakeMcpServerScript(serverScriptPath: string) {
  await writeFile(serverScriptPath, [
    'import { Server } from "@modelcontextprotocol/sdk/server/index.js";',
    'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
    'import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";',
    '',
    'const server = new Server(',
    '  { name: "fake-mcp", version: "1.0.0" },',
    '  { capabilities: { tools: {} } },',
    ');',
    'server.setRequestHandler(ListToolsRequestSchema, async () => ({',
    '  tools: [{',
    '    name: "echo",',
    '    title: "Echo",',
    '    description: "Return the provided text.",',
    '    inputSchema: {',
    '      type: "object",',
    '      properties: {',
    '        text: { type: "string" },',
    '      },',
    '      required: ["text"],',
    '      additionalProperties: false,',
    '    },',
    '  }],',
    '}));',
    'server.setRequestHandler(CallToolRequestSchema, async (request) => ({',
    '  content: [{ type: "text", text: String(request.params.arguments?.text ?? "") }],',
    '  structuredContent: { echoed: String(request.params.arguments?.text ?? "") },',
    '}));',
    'await server.connect(new StdioServerTransport());',
  ].join("\n"), "utf8");
}

function createRuntimeLoggerStub(): RuntimeLogger {
  const write = async (level: RuntimeLogRecord["level"], message: string): Promise<RuntimeLogRecord> => ({
    id: `${level}-${message}`,
    at: new Date().toISOString(),
    level,
    source: "desktop-test",
    module: "desktop.mcp.test",
    message,
  });

  return {
    write,
    debug: (message, extra) => write("debug", extra?.location ? `${message} @ ${extra.location}` : message),
    info: (message, extra) => write("info", extra?.location ? `${message} @ ${extra.location}` : message),
    warn: (message, extra) => write("warn", extra?.location ? `${message} @ ${extra.location}` : message),
    error: (message, extra) => write("error", extra?.location ? `${message} @ ${extra.location}` : message),
  };
}

function createRuntimeContext(tempRoot: string): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      registerHttpRoute() {
        return () => {};
      },
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    window: {
      title: "MaomiAgent Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    configuration: {
      values: {
        mcp: {
          storage: {
            path: join(tempRoot, "mcp-state.json"),
          },
        },
      },
    },
    createWindow() {
      throw new Error("not needed");
    },
    installProcessHandlers: false,
  };
}

function createWorkspaceQueryStub(workspaces: Record<string, string>): Pick<DesktopWorkspaceQueryPort, "get"> {
  return {
    async get(workspaceId) {
      const directoryPath = workspaces[workspaceId];
      if (!directoryPath) {
        return null;
      }
      return {
        workspaceId,
        name: workspaceId,
        directoryPath,
        isPinned: false,
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    },
  };
}

describe("DesktopMcpService", () => {
  test("returns Playwright in recommended MCP and marks it installed after install", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-mcp-"));

    try {
      const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
      const service = new DesktopMcpService(configuration, createRuntimeLoggerStub());

      const recommended = await service.recommended();
      const playwright = recommended.find((item) => item.id === "playwright");

      expect(playwright).toMatchObject({
        id: "playwright",
        name: "playwright",
        title: "Playwright",
        endpoint: "npx",
        transport: "stdio",
        installed: false,
      });
      expect(playwright?.metadata).toEqual({
        args: ["-y", "@playwright/mcp@latest", "--headless"],
      });

      const installed = await service.installRecommended("playwright");
      expect(installed.created).toBe(true);
      expect(installed.item.name).toBe("playwright");

      const recommendedAfterInstall = await service.recommended();
      expect(recommendedAfterInstall.find((item) => item.id === "playwright")?.installed).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("probes disabled MCP entries with a forced runtime check before enabling", async () => {
    await mkdir(DESKTOP_PACKAGE_TMP_ROOT, { recursive: true });
    const tempRoot = await mkdtemp(join(DESKTOP_PACKAGE_TMP_ROOT, "maomi-desktop-mcp-probe-"));
    const serverScriptPath = join(tempRoot, "fake-mcp-server.mjs");
    const nodeExecutable = Bun.which("node");

    expect(nodeExecutable).toBeTruthy();

    await writeFakeMcpServerScript(serverScriptPath);

    try {
      const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
      const service = new DesktopMcpService(configuration, createRuntimeLoggerStub());
      const created = await service.create({
        name: "fake-disabled-mcp",
        scope: "global",
        transport: "stdio",
        endpoint: nodeExecutable!,
        enabled: false,
        timeoutMs: 15_000,
        auth: { mode: "none" },
        metadata: {
          args: [serverScriptPath],
        },
      });

      const testResult = await service.testConnection(created.item.id);
      expect(testResult.reasonCode).toBe("LOCAL_OK");
      expect(testResult.message).toBe("stdio MCP connected successfully");

      const healthResult = await service.healthCheck(created.item.id);
      expect(healthResult.reasonCode).toBe("LOCAL_OK");
      expect(healthResult.status).toBe("healthy");

      const capabilities = await service.capabilities(created.item.id);
      expect(capabilities.message).toBe("stdio MCP connected successfully");
      expect(capabilities.toolsReasonCode).toBe("SDK_TOOLS_LIST_OK");
      expect(capabilities.tools).toEqual(["echo"]);
      expect(capabilities.toolDetails).toEqual([
        expect.objectContaining({
          name: "echo",
          title: "Echo",
        }),
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("lists and executes effective runtime MCP tools", async () => {
    await mkdir(DESKTOP_PACKAGE_TMP_ROOT, { recursive: true });
    const tempRoot = await mkdtemp(join(DESKTOP_PACKAGE_TMP_ROOT, "maomi-desktop-mcp-runtime-tools-"));
    const serverScriptPath = join(tempRoot, "fake-mcp-server.mjs");
    const nodeExecutable = Bun.which("node");

    expect(nodeExecutable).toBeTruthy();
    await writeFakeMcpServerScript(serverScriptPath);

    try {
      const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
      const service = new DesktopMcpService(configuration, createRuntimeLoggerStub());
      await service.create({
        name: "fake-runtime-mcp",
        scope: "workspace",
        workspaceId: "workspace-1",
        transport: "stdio",
        endpoint: nodeExecutable!,
        enabled: true,
        timeoutMs: 15_000,
        auth: { mode: "none" },
        metadata: {
          args: [serverScriptPath],
        },
      });

      const runtimeTools = await service.runtimeTools({ workspaceId: "workspace-1" });
      expect(runtimeTools).toEqual([
        expect.objectContaining({
          mcpName: "fake-runtime-mcp",
          toolName: "echo",
        }),
      ]);

      const result = await service.executeRuntimeTool({
        workspaceId: "workspace-1",
        mcpName: "fake-runtime-mcp",
        toolName: "echo",
        arguments: {
          text: "hello from runtime tool",
        },
      }) as Record<string, unknown>;

      expect(result).toEqual(expect.objectContaining({
        structuredContent: {
          echoed: "hello from runtime tool",
        },
      }));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("expands workspace directory placeholders for runtime config", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-mcp-workspace-runtime-"));
    const workspaceDirectory = join(tempRoot, "repo");

    try {
      await mkdir(workspaceDirectory, { recursive: true });

      const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
      const service = new DesktopMcpService(
        configuration,
        createRuntimeLoggerStub(),
        createWorkspaceQueryStub({
          "workspace-1": workspaceDirectory,
        }),
      );

      await service.create({
        name: "filesystem",
        scope: "workspace",
        workspaceId: "workspace-1",
        transport: "stdio",
        endpoint: "npx",
        enabled: true,
        timeoutMs: 15_000,
        auth: { mode: "none" },
        metadata: {
          args: ["-y", "@modelcontextprotocol/server-filesystem", "{workspace:directory}"],
        },
      });

      const runtimeConfig = await service.runtimeConfig({ workspaceId: "workspace-1" });
      expect(runtimeConfig.filesystem).toEqual({
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", workspaceDirectory],
        environment: undefined,
        enabled: true,
        timeout: 15_000,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("falls back to home directory when workspace placeholder cannot resolve", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-mcp-home-fallback-"));

    try {
      const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
      const service = new DesktopMcpService(configuration, createRuntimeLoggerStub());

      await service.create({
        name: "filesystem",
        scope: "global",
        transport: "stdio",
        endpoint: "npx",
        enabled: true,
        timeoutMs: 15_000,
        auth: { mode: "none" },
        metadata: {
          args: ["-y", "@modelcontextprotocol/server-filesystem", "{workspace:directory}"],
        },
      });

      const runtimeConfig = await service.runtimeConfig();
      expect(runtimeConfig.filesystem).toEqual({
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", homedir()],
        environment: undefined,
        enabled: true,
        timeout: 15_000,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("migrates legacy filesystem HOME root to workspace-aware placeholder on load", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-mcp-legacy-filesystem-"));
    const workspaceDirectory = join(tempRoot, "repo");
    const statePath = join(tempRoot, "mcp-state.json");

    try {
      await mkdir(workspaceDirectory, { recursive: true });
      await writeFile(statePath, JSON.stringify({
        version: "1.0",
        updatedAt: "2026-01-01T00:00:00.000Z",
        items: [{
          id: "mcp_legacy_filesystem",
          name: "filesystem",
          scope: "workspace",
          workspaceId: "workspace-1",
          transport: "stdio",
          endpoint: "npx",
          enabled: true,
          auth: { mode: "none" },
          timeoutMs: 15_000,
          metadata: {
            args: ["-y", "@modelcontextprotocol/server-filesystem", "{env:HOME}"],
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }],
        healthRecords: [],
      }, null, 2), "utf-8");

      const configuration = new DesktopConfigurationService(createRuntimeContext(tempRoot));
      const service = new DesktopMcpService(
        configuration,
        createRuntimeLoggerStub(),
        createWorkspaceQueryStub({
          "workspace-1": workspaceDirectory,
        }),
      );

      const runtimeConfig = await service.runtimeConfig({ workspaceId: "workspace-1" });
      expect(runtimeConfig.filesystem).toEqual({
        type: "local",
        command: ["npx", "-y", "@modelcontextprotocol/server-filesystem", workspaceDirectory],
        environment: undefined,
        enabled: true,
        timeout: 15_000,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
