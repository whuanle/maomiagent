import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../apps/desktop/MaomiAgent/src/shared/desktop-feishu";
import { hydrateDesktopFeishuStateView } from "../apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-state-hydrator";

type SmokeOptions = {
  url?: string;
  outputDir: string;
};

type DevServerHandle = {
  url: string;
  process: ReturnType<typeof spawn>;
};

type BrowserReport = {
  url: string;
  launcher: string;
  title: string;
  routeTabs: string[];
  personalDraftValueAfterBackgroundRefresh: string;
  directoryTabs: string[];
  directoryCounts: Record<string, number>;
  scopeJsonPreview: string;
  popupUrl: string;
  firstActionModalTitle: string;
  draftValuesAfterBackgroundRefresh: {
    appId: string;
    appSecret: string;
    redirectUri: string;
  };
  messageLog: string[];
  metricSnapshots: {
    initial: string[];
    afterSave: string[];
    afterAuthorize: string[];
    afterRefresh: string[];
    afterClear: string[];
  };
  consoleMessages: Array<{ type: string; text: string }>;
  pageErrors: string[];
};

type SmokeInput = {
  feishuState: FeishuStateView;
  botState: FeishuBotStateView;
  workspaces: Array<{
    workspaceId: string;
    name: string;
    directoryPath: string;
    isPinned: boolean;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>;
};

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const desktopAppDir = path.join(repoRoot, "apps", "desktop", "MaomiAgent");
const defaultOutputRoot = path.join(repoRoot, "output", "playwright");
const defaultUrl = process.env.MAOMI_DESKTOP_FEISHU_SMART_ASSISTANT_SMOKE_URL?.trim() || undefined;

function ensureDirectory(dirPath: string) {
  mkdirSync(dirPath, { recursive: true });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  process.stdout.write([
    "Usage: bun scripts/smoke-desktop-feishu-smart-assistant-ui.ts [options]",
    "",
    "Options:",
    "  --url <url>          Desktop mainview feishu URL. If omitted, the script starts a local web dev server.",
    "  --output-dir <path>  Output directory for the screenshot and JSON report.",
    "  --help               Show this help text.",
    "",
    "Environment overrides:",
    "  MAOMI_DESKTOP_FEISHU_SMART_ASSISTANT_SMOKE_URL",
    "",
  ].join("\n"));
}

function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {
    url: defaultUrl,
    outputDir: defaultOutputRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--url") {
      options.url = argv[index + 1]?.trim() || options.url;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = argv[index + 1]?.trim() || options.outputDir;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function resolveProbeUrl(targetUrl: string) {
  const parsed = new URL(targetUrl);
  parsed.hash = "";
  return parsed.toString();
}

async function stopDevServer(handle: DevServerHandle | null) {
  if (!handle || handle.process.killed) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(handle.process.pid), "/t", "/f"],
        {
          stdio: "ignore",
          windowsHide: true,
        },
      );
      killer.on("error", () => resolve());
      killer.on("close", () => resolve());
    });
    return;
  }

  handle.process.kill("SIGTERM");
}

async function startDesktopWebDevServer() {
  return new Promise<DevServerHandle>((resolve, reject) => {
    const child = spawn(
      "bun",
      ["run", "web:dev"],
      {
        cwd: desktopAppDir,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    const startupTimeout = setTimeout(async () => {
      await stopDevServer({ url: "", process: child });
      reject(new Error("Timed out while waiting for the desktop web dev server to print its URL"));
    }, 180_000);

    let settled = false;
    let outputBuffer = "";

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(startupTimeout);
      callback();
    };

    const handleChunk = (chunk: Buffer | string) => {
      outputBuffer += chunk.toString();
      const matches = [...outputBuffer.matchAll(/http:\/\/127\.0\.0\.1:(\d+)/g)];
      const latest = matches.at(-1);
      if (!latest) {
        return;
      }

      const url = `http://127.0.0.1:${latest[1]}/#feishu`;
      settle(() => resolve({
        url,
        process: child,
      }));
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settle(() => reject(new Error(
        outputBuffer.trim() || `Desktop web dev server exited before startup with code ${code}`,
      )));
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number) {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: "GET",
      });
      if (response.ok) {
        return;
      }
      lastError = new Error(`Unexpected status ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(150);
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out while waiting for ${url}`);
}

function resolveEdgeExecutablePath() {
  const candidates = [
    process.env.MAOMI_SMOKE_PLAYWRIGHT_EXECUTABLE?.trim(),
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe")
      : undefined,
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe")
      : undefined,
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function createSmokeFeishuState(): FeishuStateView {
  const baseState: FeishuStateView = {
    personalDocs: {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    },
    smartAssistant: {
      enabled: false,
      appId: "",
      hasAppSecret: false,
      redirectUri: "http://127.0.0.1/desktop/feishu/oauth/callback",
      redirectOrigin: "http://127.0.0.1",
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

  return hydrateDesktopFeishuStateView(baseState);
}

function createSmokeBotState(): FeishuBotStateView {
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
    updatedAt: new Date(0).toISOString(),
  };
}

function createSmokeInput(): SmokeInput {
  const now = new Date().toISOString();
  return {
    feishuState: createSmokeFeishuState(),
    botState: createSmokeBotState(),
    workspaces: [
      {
        workspaceId: "workspace-feishu-smoke",
        name: "Feishu Smoke Workspace",
        directoryPath: "E:/workspace/MaomiAgent",
        isPinned: true,
        tags: ["smoke", "feishu"],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

const browserSmokeRunnerScript = String.raw`
const { chromium } = require("playwright");
const fs = require("node:fs");

const debug = (step) => process.stderr.write("[desktop-feishu-smart-assistant-smoke] " + step + "\n");

function buildLaunchCandidates(explicitExecutablePath) {
  const candidates = [];
  if (explicitExecutablePath) {
    candidates.push({
      launcher: "executable:" + explicitExecutablePath,
      options: { executablePath: explicitExecutablePath, headless: true, timeout: 15000 },
    });
  }
  if (process.platform === "win32") {
    candidates.push({
      launcher: "channel:msedge",
      options: { channel: "msedge", headless: true, timeout: 15000 },
    });
  }
  candidates.push({
    launcher: "bundled:chromium",
    options: { headless: true, timeout: 15000 },
  });
  return candidates;
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

(async () => {
  const [, , url, screenshotPath, explicitExecutablePath, inputPath] = process.argv;
  const smokeInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const browserReport = {
    url,
    launcher: "",
    title: "",
    routeTabs: [],
    personalDraftValueAfterBackgroundRefresh: "",
    directoryTabs: [],
    directoryCounts: {},
    scopeJsonPreview: "",
    popupUrl: "",
    firstActionModalTitle: "",
    draftValuesAfterBackgroundRefresh: {
      appId: "",
      appSecret: "",
      redirectUri: "",
    },
    messageLog: [],
    metricSnapshots: {
      initial: [],
      afterSave: [],
      afterAuthorize: [],
      afterRefresh: [],
      afterClear: [],
    },
    consoleMessages: [],
    pageErrors: [],
  };
  let browser = null;
  let context = null;
  let lastError = null;

  for (const candidate of buildLaunchCandidates(explicitExecutablePath || undefined)) {
    try {
      debug("launching " + candidate.launcher);
      browser = await chromium.launch(candidate.options);
      browserReport.launcher = candidate.launcher;
      debug("launched " + candidate.launcher);
      break;
    } catch (error) {
      lastError = error;
      debug("launch failed " + candidate.launcher + ": " + (error && error.message ? error.message : String(error)));
    }
  }

  if (!browser) {
    throw lastError || new Error("Failed to launch a Playwright browser for desktop feishu smoke validation");
  }

  try {
    context = await browser.newContext({
      viewport: {
        width: 1600,
        height: 1200,
      },
    });
    const page = await context.newPage();

    page.on("console", (message) => {
      browserReport.consoleMessages.push({
        type: message.type(),
        text: message.text(),
      });
    });
    page.on("pageerror", (error) => {
      browserReport.pageErrors.push(error.message);
    });

    await page.addInitScript((input) => {
      const cloneValue = (value) => JSON.parse(JSON.stringify(value));
      const initialFeishuState = cloneValue(input.feishuState);
      let currentFeishuState = cloneValue(input.feishuState);
      const currentBotState = cloneValue(input.botState);
      const workspaces = cloneValue(input.workspaces);
      const nowIso = () => new Date().toISOString();
      const nextRunIso = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const listWorkspaces = (query = {}) => {
        const offset = typeof query.offset === "number" ? Math.max(0, query.offset) : 0;
        const limit = typeof query.limit === "number" ? Math.max(1, query.limit) : Math.max(workspaces.length, 1);
        const items = workspaces.slice(offset, offset + limit);
        return {
          items,
          meta: {
            total: workspaces.length,
            limit,
            offset,
            hasMore: offset + items.length < workspaces.length,
          },
        };
      };
      const findActionDomain = (actionId) => {
        const action = currentFeishuState.smartAssistant.actions.find((item) => item.actionId === actionId);
        return action ? action.domain : "docs";
      };
      const syncDeveloperFromAssistant = () => {
        currentFeishuState.developer = {
          appId: currentFeishuState.smartAssistant.appId || "",
          hasAppSecret: currentFeishuState.smartAssistant.hasAppSecret,
          redirectUri: currentFeishuState.smartAssistant.redirectUri,
          redirectOrigin: currentFeishuState.smartAssistant.redirectOrigin,
          authStatus: currentFeishuState.smartAssistant.authStatus,
          authMethod: "oauth",
          hasRefreshToken: currentFeishuState.smartAssistant.hasRefreshToken,
          scopes: cloneValue(currentFeishuState.smartAssistant.scopes || []),
          allowedTools: cloneValue(currentFeishuState.smartAssistant.allowedTools || []),
          ...(currentFeishuState.smartAssistant.lastAuthorizedAt
            ? { lastAuthorizedAt: currentFeishuState.smartAssistant.lastAuthorizedAt }
            : {}),
          ...(currentFeishuState.smartAssistant.lastRefreshedAt
            ? { lastRefreshedAt: currentFeishuState.smartAssistant.lastRefreshedAt }
            : {}),
          autoRefreshTask: cloneValue(currentFeishuState.smartAssistant.autoRefreshTask),
        };
      };
      const smokeState = {
        lastPopupUrl: "",
      };

      window.localStorage.setItem("maomiagent.shell-preferences", JSON.stringify({
        version: 1,
        language: "zh-CN",
        themeMode: "light",
      }));
      window.localStorage.setItem("maomiagent.language", "zh-CN");
      window.__maomiFeishuSmokeState = smokeState;
      window.open = () => {
        const popup = {
          closed: false,
          opener: window,
          document: {
            open() {},
            write() {},
            close() {},
          },
          location: {
            replace(url) {
              smokeState.lastPopupUrl = String(url || "");
            },
          },
          focus() {},
          close() {
            popup.closed = true;
          },
        };
        return popup;
      };

      window.maomiDesktopWindow = {
        getWindowState: async () => ({ maximized: false }),
        windowControl: async () => ({ maximized: false }),
        refreshMainView: async () => ({ url: window.location.href, usedDevServer: true, rebuilt: false }),
        chooseDirectory: async () => null,
        openPathInFileManager: async () => undefined,
        openExternalUrl: async () => undefined,
      };

      window.maomiDesktopWorkspace = {
        listDesktopWorkspaces: async (query = {}) => cloneValue(listWorkspaces(query)),
        getDesktopWorkspace: async (workspaceId) => cloneValue(workspaces.find((item) => item.workspaceId === workspaceId) || null),
      };

      window.maomiDesktopFeishu = {
        getDesktopFeishuState: async () => cloneValue(currentFeishuState),
        saveDesktopFeishuPersonalConfig: async () => cloneValue(currentFeishuState),
        clearDesktopFeishuPersonalConfig: async () => cloneValue(currentFeishuState),
        saveDesktopFeishuDeveloperConfig: async (input) => {
          currentFeishuState.mode = "developer";
          currentFeishuState.smartAssistant.enabled = true;
          currentFeishuState.smartAssistant.appId = (input.appId || "").trim();
          currentFeishuState.smartAssistant.hasAppSecret = Boolean(input.appSecret) || currentFeishuState.smartAssistant.hasAppSecret;
          currentFeishuState.smartAssistant.redirectUri = input.redirectUri || currentFeishuState.smartAssistant.redirectUri;
          currentFeishuState.smartAssistant.authStatus = "idle";
          currentFeishuState.smartAssistant.hasRefreshToken = false;
          delete currentFeishuState.smartAssistant.lastAuthorizedAt;
          delete currentFeishuState.smartAssistant.lastRefreshedAt;
          currentFeishuState.smartAssistant.autoRefreshTask = {
            enabled: false,
          };
          currentFeishuState.smartAssistant.docsMcp = null;
          syncDeveloperFromAssistant();
          return cloneValue(currentFeishuState);
        },
        beginDesktopFeishuDeveloperAuthorization: async () => {
          const now = nowIso();
          currentFeishuState.mode = "developer";
          currentFeishuState.smartAssistant.enabled = true;
          currentFeishuState.smartAssistant.authStatus = "authorized";
          currentFeishuState.smartAssistant.hasRefreshToken = true;
          currentFeishuState.smartAssistant.lastAuthorizedAt = now;
          currentFeishuState.smartAssistant.lastRefreshedAt = now;
          currentFeishuState.smartAssistant.autoRefreshTask = {
            taskId: "task-feishu-smoke-refresh",
            enabled: true,
            status: "success",
            nextRunAt: nextRunIso(),
          };
          syncDeveloperFromAssistant();
          return {
            item: cloneValue(currentFeishuState),
            authUrl: "https://open.feishu.cn/open-apis/authen/v1/index?app_id=" + encodeURIComponent(currentFeishuState.smartAssistant.appId || ""),
          };
        },
        refreshDesktopFeishuDeveloperToken: async () => {
          const now = nowIso();
          currentFeishuState.smartAssistant.authStatus = "authorized";
          currentFeishuState.smartAssistant.hasRefreshToken = true;
          currentFeishuState.smartAssistant.lastRefreshedAt = now;
          currentFeishuState.smartAssistant.autoRefreshTask = {
            taskId: currentFeishuState.smartAssistant.autoRefreshTask.taskId || "task-feishu-smoke-refresh",
            enabled: true,
            status: "success",
            nextRunAt: nextRunIso(),
          };
          syncDeveloperFromAssistant();
          return cloneValue(currentFeishuState);
        },
        clearDesktopFeishuSmartAssistantConfig: async () => {
          currentFeishuState = cloneValue(initialFeishuState);
          return cloneValue(currentFeishuState);
        },
        clearDesktopFeishuConfig: async () => cloneValue(currentFeishuState),
        getDesktopFeishuBotState: async () => cloneValue(currentBotState),
        saveDesktopFeishuBotConfig: async () => cloneValue(currentBotState),
        clearDesktopFeishuBotConfig: async () => cloneValue(currentBotState),
        getDesktopFeishuDocsCapabilities: async () => ({
          accessKind: "developer_oauth",
          available: true,
          connectionStatus: "ready",
          tools: currentFeishuState.catalog.supportedTools,
          docsMcp: currentFeishuState.smartAssistant.docsMcp,
          supportedRoots: ["docs", "wiki"],
        }),
        getDesktopFeishuDocTree: async () => ({
          root: "docs",
          roots: [],
          items: [],
          nextPageToken: undefined,
        }),
        getDesktopFeishuDocContent: async (input) => ({
          docId: input.docId,
          title: input.docId,
          markdown: "# Smoke Doc\n\nFeishu smoke validation placeholder.",
          updatedAt: new Date().toISOString(),
          source: "remote",
        }),
        getDesktopFeishuDocMediaPreviewUrls: async () => ({ items: [] }),
        getDesktopFeishuDocWhiteboardPreviewUrls: async () => ({ items: [] }),
        openDesktopFeishuWorkspaceDoc: async (_workspaceId, docId) => ({
          docId,
          title: docId,
          markdown: "# Workspace Doc\n\nFeishu smoke validation placeholder.",
          updatedAt: new Date().toISOString(),
          source: "local",
        }),
        getDesktopFeishuWorkspaceDocLocalDraft: async (_workspaceId, docId) => ({
          docId,
          title: docId,
          markdown: "# Local Draft\n\nFeishu smoke validation placeholder.",
          updatedAt: new Date().toISOString(),
          source: "local",
        }),
        saveDesktopFeishuWorkspaceDocLocalDraft: async (input) => ({
          docId: input.docId,
          title: input.title,
          markdown: input.markdown || "",
          updatedAt: new Date().toISOString(),
          source: "local",
        }),
        pullDesktopFeishuWorkspaceDoc: async (_workspaceId, docId) => ({
          docId,
          pulled: true,
          updatedAt: new Date().toISOString(),
        }),
        pushDesktopFeishuWorkspaceDoc: async (input) => ({
          docId: input.docId,
          pushed: true,
          updatedAt: new Date().toISOString(),
        }),
        executeDesktopFeishuSmartAssistantAction: async (input) => ({
          workspaceId: input.workspaceId,
          actionId: input.actionId,
          domain: findActionDomain(input.actionId),
          executionMode: "builtin_runtime",
          executed: true,
          confirmationRequired: false,
          summary: {
            headline: "Smoke action completed",
            details: ["This response is generated by the desktop feishu smoke mock."],
            nextSuggestedActionIds: [],
          },
          result: {
            echoedActionId: input.actionId,
            echoedQuery: input.query || "",
          },
          notes: ["desktop-feishu-smart-assistant-smoke"],
        }),
      };
    }, smokeInput);

    debug("navigating to page");
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const readMetricTexts = async () => {
      return page.locator(".feishu-assistant-access-metric").evaluateAll((nodes) => {
        return nodes.map((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
      });
    };
    const waitForMessageText = async (text) => {
      const notice = page.locator(".ant-message-notice").filter({ hasText: text }).last();
      await notice.waitFor({ state: "visible", timeout: 30000 });
      browserReport.messageLog.push(text);
    };

    const pageTabs = page.locator(".feishu-page-tabs");
    await pageTabs.waitFor({ state: "visible", timeout: 30000 });

    const routeTabLabels = await page.locator(".feishu-page-tabs .ant-tabs-tab-btn").allInnerTexts();
    browserReport.routeTabs = routeTabLabels.map((item) => item.trim()).filter(Boolean);

    const personalDocsTab = pageTabs.getByRole("tab", { name: "个人文档 MCP", exact: true });
    await personalDocsTab.click();
    const personalUrlInput = page.getByPlaceholder("粘贴飞书 MCP 配置平台生成的个人远程 MCP URL", { exact: true });
    await personalUrlInput.waitFor({ state: "visible", timeout: 30000 });
    await personalUrlInput.fill("https://mcp.feishu.cn/smoke-personal-draft");
    await page.waitForTimeout(6200);
    browserReport.personalDraftValueAfterBackgroundRefresh = await personalUrlInput.inputValue();

    const smartAssistantTab = pageTabs.getByRole("tab", { name: "飞书智能助手", exact: true });
    await smartAssistantTab.click();
    debug("opened smart assistant tab");

    await page.waitForSelector(".feishu-assistant-layout", { timeout: 30000 });
    await page.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll(".feishu-assistant-tabs .ant-tabs-tab-btn"));
      return labels.some((item) => /域能力 \((\d+)\)/.test(item.textContent || ""));
    }, { timeout: 30000 });

    const directoryTabs = await page.locator(".feishu-assistant-tabs .ant-tabs-tab-btn").allInnerTexts();
    browserReport.directoryTabs = directoryTabs.map((item) => item.trim()).filter(Boolean);
    for (const label of browserReport.directoryTabs) {
      const match = label.match(/^(.*?) \((\d+)\)$/);
      if (match) {
        browserReport.directoryCounts[match[1]] = Number(match[2]);
      }
    }

    const scopeJson = await page.locator(".feishu-assistant-access-scope-json").inputValue();
    browserReport.scopeJsonPreview = scopeJson;
    browserReport.metricSnapshots.initial = await readMetricTexts();

    const assistantAppIdInput = page.getByPlaceholder("输入飞书智能助手应用 App ID", { exact: true });
    const assistantAppSecretInput = page.getByPlaceholder("输入飞书智能助手应用 App Secret", { exact: true });
    const assistantRedirectUriInput = page.locator(".feishu-assistant-access-field")
      .filter({ hasText: "OAuth 回调地址" })
      .locator("input")
      .first();
    const initialAssistantRedirectUri = await assistantRedirectUriInput.inputValue();

    await assistantAppIdInput.fill("cli_smoke_draft_app");
    await assistantAppSecretInput.fill("draft-secret");
    await page.waitForTimeout(6200);
    browserReport.draftValuesAfterBackgroundRefresh = {
      appId: await assistantAppIdInput.inputValue(),
      appSecret: await assistantAppSecretInput.inputValue(),
      redirectUri: await assistantRedirectUriInput.inputValue(),
    };

    await assistantAppIdInput.fill("cli_smoke_saved_app");
    await assistantAppSecretInput.fill("smoke-secret");
    await page.locator(".feishu-assistant-access-action-grid .ant-btn").filter({ hasText: "保存配置" }).first().click();
    await waitForMessageText("飞书智能助手配置已保存");
    browserReport.metricSnapshots.afterSave = await readMetricTexts();

    await page.locator(".feishu-assistant-access-action-grid .ant-btn").filter({ hasText: "发起授权" }).first().click();
    await page.waitForFunction(() => {
      const state = window.__maomiFeishuSmokeState;
      return Boolean(state && typeof state.lastPopupUrl === "string" && state.lastPopupUrl.includes("open.feishu.cn"));
    }, { timeout: 30000 });
    browserReport.popupUrl = await page.evaluate(() => window.__maomiFeishuSmokeState?.lastPopupUrl || "");
    browserReport.metricSnapshots.afterAuthorize = await readMetricTexts();

    await page.locator(".feishu-assistant-access-action-grid .ant-btn").filter({ hasText: "续费授权" }).first().click();
    await waitForMessageText("飞书智能助手 Token 已刷新");
    browserReport.metricSnapshots.afterRefresh = await readMetricTexts();

    const actionTab = page.locator(".feishu-assistant-tabs").getByRole("tab", { name: /动作目录/, exact: false });
    await actionTab.click();
    await page.waitForSelector(".feishu-assistant-table-card-action .ant-table-tbody tr:not(.ant-table-measure-row)", { timeout: 30000 });
    await page.locator(".feishu-assistant-table-card-action .ant-table-tbody tr:not(.ant-table-measure-row) .ant-btn").first().click();
    await page.waitForSelector(".ant-modal .ant-modal-title", { timeout: 30000 });
    browserReport.firstActionModalTitle = ((await page.locator(".ant-modal .ant-modal-title").textContent()) || "").trim();
    await page.locator(".ant-modal-footer .ant-btn").first().click();

    await page.locator(".feishu-assistant-access-action-grid .ant-btn").filter({ hasText: "重置配置" }).first().click();
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll("button")).some((button) => {
        const text = (button.textContent || "").replace(/\s+/g, "");
        return text.includes("重置") && Boolean(button.closest(".ant-popconfirm-buttons"));
      });
    }, { timeout: 30000 });
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const target = buttons.find((button) => {
        const text = (button.textContent || "").replace(/\s+/g, "");
        return text.includes("重置") && Boolean(button.closest(".ant-popconfirm-buttons"));
      });
      if (!target) {
        throw new Error("Unable to locate the smart assistant reset confirmation button");
      }
      target.click();
    });
    await waitForMessageText("飞书智能助手配置已清除");
    browserReport.metricSnapshots.afterClear = await readMetricTexts();

    const appIdValueAfterClear = await page.getByPlaceholder("输入飞书智能助手应用 App ID", { exact: true }).inputValue();

    browserReport.title = await page.title();

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    const requiredCounts = {
      "域能力": 11,
      "动作目录": 33,
      "连接方式": 2,
      "上下文模板": 11,
      "运行策略": 4,
    };
    for (const [label, expectedCount] of Object.entries(requiredCounts)) {
      if (browserReport.directoryCounts[label] !== expectedCount) {
        throw new Error("Unexpected smart assistant directory count for " + label + ": " + JSON.stringify(browserReport.directoryCounts));
      }
    }

    if (!browserReport.scopeJsonPreview.includes("offline_access") || !browserReport.scopeJsonPreview.includes("im:message")) {
      throw new Error("Expected smart assistant scope JSON to include developer user and tenant scopes");
    }

    if (browserReport.personalDraftValueAfterBackgroundRefresh !== "https://mcp.feishu.cn/smoke-personal-draft") {
      throw new Error("Expected personal docs URL draft to survive background state refreshes");
    }

    if (
      browserReport.draftValuesAfterBackgroundRefresh.appId !== "cli_smoke_draft_app"
      || browserReport.draftValuesAfterBackgroundRefresh.appSecret !== "draft-secret"
    ) {
      throw new Error("Expected smart assistant draft inputs to survive background state refreshes");
    }

    if (
      !initialAssistantRedirectUri.includes("/desktop/feishu/oauth/callback")
      || browserReport.draftValuesAfterBackgroundRefresh.redirectUri !== initialAssistantRedirectUri
    ) {
      throw new Error("Expected OAuth redirect URI to stay stable across background state refreshes");
    }

    if (!browserReport.popupUrl.includes("open.feishu.cn/open-apis/authen/v1/index?app_id=cli_smoke_saved_app")) {
      throw new Error("Expected authorization popup URL to target the saved smart assistant app");
    }

    if (!browserReport.firstActionModalTitle.includes("试运行动作")) {
      throw new Error("Expected the first smart assistant action modal to open");
    }

    if (!browserReport.metricSnapshots.initial[0]?.includes("未配置") || !browserReport.metricSnapshots.initial[1]?.includes("未保存")) {
      throw new Error("Expected initial smart assistant metrics to reflect an unconfigured state");
    }

    if (!browserReport.metricSnapshots.afterSave[0]?.includes("未配置") || !browserReport.metricSnapshots.afterSave[1]?.includes("已保存") || !browserReport.metricSnapshots.afterSave[2]?.includes("当前没有 refresh_token")) {
      throw new Error("Expected metrics after save to reflect saved app config before authorization");
    }

    if (!browserReport.metricSnapshots.afterAuthorize[0]?.includes("已授权") || !browserReport.metricSnapshots.afterAuthorize[2]?.includes("已启用") || !browserReport.metricSnapshots.afterAuthorize[3]?.includes("OAuth 已授权")) {
      throw new Error("Expected metrics after authorize to reflect an authorized assistant state");
    }

    if (!browserReport.metricSnapshots.afterRefresh[0]?.includes("已授权") || !browserReport.metricSnapshots.afterRefresh[2]?.includes("已启用")) {
      throw new Error("Expected metrics after refresh to remain in an authorized state");
    }

    if (!browserReport.metricSnapshots.afterClear[0]?.includes("未配置") || !browserReport.metricSnapshots.afterClear[1]?.includes("未保存") || appIdValueAfterClear.trim() !== "") {
      throw new Error("Expected smart assistant reset to clear app config and restore the unconfigured state");
    }

    for (const expectedMessage of ["飞书智能助手配置已保存", "飞书智能助手 Token 已刷新", "飞书智能助手配置已清除"]) {
      if (!browserReport.messageLog.includes(expectedMessage)) {
        throw new Error("Expected smoke message log to contain: " + expectedMessage);
      }
    }

    if (browserReport.pageErrors.length > 0 || browserReport.consoleMessages.some((item) => item.type === "error")) {
      throw new Error([
        "Desktop feishu smart assistant page emitted browser errors during smoke validation",
        "Page errors: " + JSON.stringify(browserReport.pageErrors),
        "Console errors: " + JSON.stringify(browserReport.consoleMessages.filter((item) => item.type === "error")),
      ].join("\n"));
    }

    process.stdout.write(JSON.stringify(browserReport));
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
})().catch((error) => {
  process.stderr.write(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
`;

function resolveBrowserSmokeRuntimeExecutable() {
  if (typeof Bun !== "undefined") {
    const nodeExecutable = Bun.which("node");
    if (nodeExecutable) {
      return nodeExecutable;
    }
  }

  return process.execPath;
}

async function runBrowserSmokeInNode(input: {
  url: string;
  screenshotPath: string;
  smokeInput: SmokeInput;
}) {
  const edgeExecutablePath = resolveEdgeExecutablePath();
  const runtimeExecutable = resolveBrowserSmokeRuntimeExecutable();
  const runnerPath = `${input.screenshotPath}.runner.cjs`;
  const inputPath = `${input.screenshotPath}.input.json`;

  writeFileSync(runnerPath, `${browserSmokeRunnerScript}\n`, "utf8");
  writeFileSync(inputPath, `${JSON.stringify(input.smokeInput)}\n`, "utf8");

  return new Promise<BrowserReport>((resolve, reject) => {
    const child = spawn(
      runtimeExecutable,
      [
        runnerPath,
        input.url,
        input.screenshotPath,
        edgeExecutablePath ?? "",
        inputPath,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      const output = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n\n");
      reject(new Error(output
        ? `Timed out while waiting for the Node Playwright desktop feishu smoke runner\n\n${output}`
        : "Timed out while waiting for the Node Playwright desktop feishu smoke runner"));
    }, 180_000);

    const cleanup = () => {
      rmSync(runnerPath, { force: true });
      rmSync(inputPath, { force: true });
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      cleanup();
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Node desktop feishu smoke runner exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as BrowserReport);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDirectory(options.outputDir);

  let devServerHandle: DevServerHandle | null = null;
  let targetUrl = options.url;

  try {
    if (!targetUrl) {
      devServerHandle = await startDesktopWebDevServer();
      targetUrl = devServerHandle.url;
    }

    const probeUrl = resolveProbeUrl(targetUrl);
    await waitForHttp(probeUrl, 30_000);

    const screenshotPath = path.join(options.outputDir, "desktop-feishu-smart-assistant-ui-smoke.png");
    const reportPath = path.join(options.outputDir, "desktop-feishu-smart-assistant-ui-smoke.json");
    const browserReport = await runBrowserSmokeInNode({
      url: targetUrl,
      screenshotPath,
      smokeInput: createSmokeInput(),
    });

    writeFileSync(reportPath, `${JSON.stringify(browserReport, null, 2)}\n`, "utf8");

    process.stdout.write([
      "Desktop feishu smart assistant browser smoke passed.",
      `URL: ${targetUrl}`,
      `Screenshot: ${screenshotPath}`,
      `Report: ${reportPath}`,
    ].join("\n"));
  } finally {
    await stopDevServer(devServerHandle);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
