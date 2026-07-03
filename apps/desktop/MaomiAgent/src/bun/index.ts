import { BrowserWindow, Updater, Utils, defineElectrobunRPC } from "electrobun/bun";
import { writeFile } from "node:fs/promises";

import {
  checkDesktopAppUpdate,
  installDesktopAppUpdate,
} from "./desktop-app-update";
import { startDesktopApplication } from "./desktop-host";
import { removeDesktopWorkspaceWithTaskCleanup } from "./desktop-workspace-task-cleanup";
import type { ModuleHost } from "./shared/ioc";
import {
  REFRESH_MAIN_VIEW_ROUTE_PATH,
  createSingleInstanceCoordinator,
} from "./single-instance";
import { DESKTOP_LOCAL_CONTROL_PROTOCOL } from "../shared/desktop-feishu-oauth";
import type { DesktopRendererRPC, DesktopWindowAction } from "../shared/desktop-rpc";
import type {
  FeishuDocTreeBranchInput,
  FeishuDocTreeBranchResult,
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
} from "../shared/desktop-feishu";
import {
  RUNTIME_LOGGER_FACTORY_PORT,
  RUNTIME_LOGS_QUERY_PORT,
  RUNTIME_LOG_WRITER_PORT,
  type RuntimeLogsQuery,
} from "./modules/logs";
import { DESKTOP_AI_ONE_SHOT_PORT } from "./modules/ai";
import {
  DESKTOP_AGENTS_COMMAND_PORT,
  DESKTOP_AGENTS_QUERY_PORT,
} from "./modules/agents";
import { DESKTOP_BROWSER_PORT } from "./modules/browser";
import {
  DESKTOP_CONVERSATION_COMMAND_PORT,
  DESKTOP_CONVERSATION_QUERY_PORT,
  DESKTOP_CONVERSATION_SERVICE_TOKEN,
  DesktopConversationService,
} from "./modules/conversation";
import {
  DESKTOP_MODELS_COMMAND_PORT,
  DESKTOP_MODELS_QUERY_PORT,
} from "./modules/models";
import {
  DESKTOP_MEMORY_COMMAND_PORT,
  DESKTOP_MEMORY_QUERY_PORT,
} from "./modules/memory";
import {
  DESKTOP_SKILLS_COMMAND_PORT,
  DESKTOP_SKILLS_MARKET_PORT,
  DESKTOP_SKILLS_QUERY_PORT,
} from "./modules/skills";
import {
  DESKTOP_MCP_COMMAND_PORT,
  DESKTOP_MCP_MARKET_PORT,
  DESKTOP_MCP_QUERY_PORT,
} from "./modules/mcp";
import {
  DESKTOP_WORKSPACE_COMMAND_PORT,
  DESKTOP_WORKSPACE_QUERY_PORT,
} from "./modules/workspace";
import {
  DESKTOP_GIT_COMMAND_PORT,
  DESKTOP_GIT_QUERY_PORT,
} from "./modules/git";
import {
  DESKTOP_TASKS_COMMAND_PORT,
  DESKTOP_TASKS_QUERY_PORT,
} from "./modules/tasks";
import {
  DESKTOP_TERMINALS_COMMAND_PORT,
  DESKTOP_TERMINALS_QUERY_PORT,
} from "./modules/terminals";
import {
  DESKTOP_WECHAT_COMMAND_PORT,
  DESKTOP_WECHAT_QUERY_PORT,
} from "./modules/wechat";
import {
  DESKTOP_UI_DESIGNER_COMMAND_PORT,
  DESKTOP_UI_DESIGNER_QUERY_PORT,
} from "./modules/ui-designer";
import {
  ensureWindowFrameVisible,
  fitFrameToVisibleWorkArea,
  resolveNearestWorkArea,
} from "./modules/window/implementation/services/window-frame-visibility";
import {
  resolveCenteredFrameInWorkArea,
  resolveRestoreFrameForDrag,
  resizeFrameFromPointer,
} from "./modules/window/implementation/services/window-frame-operations";
import {
  DESKTOP_FEISHU_COMMAND_PORT,
  DESKTOP_FEISHU_QUERY_PORT,
} from "./modules/feishu";
import type {
  DesktopMemoryMaintenanceRequest,
  DesktopMemoryProjectionQuery,
} from "../shared/desktop-memory";
import type { DesktopWindowResizePointer } from "../shared/desktop-rpc";

const APP_IDENTIFIER = "com.maomiagent.desktop";
const DEFAULT_MAIN_VIEW_URL = "views://mainview/index.html";
const DEFAULT_DESKTOP_PAGE_ZOOM = 1;
let activeDevServerUrl = process.env.MAOMI_DESKTOP_DEV_SERVER_URL?.trim() ?? "";

function resolveSingleInstanceAppKey(channel: string): string {
  if (channel === "dev" && process.env.MAOMI_DESKTOP_DEV_APP_KEY?.trim()) {
    return process.env.MAOMI_DESKTOP_DEV_APP_KEY.trim();
  }

  return APP_IDENTIFIER;
}

async function resolveMainViewUrl(channel: string): Promise<string> {
  const devServerUrl = activeDevServerUrl;

  if (channel === "dev" && devServerUrl) {
    try {
      await fetch(devServerUrl, { method: "HEAD" });
      console.log(`Using Vite dev server at ${devServerUrl}`);
      return devServerUrl;
    } catch {
      console.log("Vite dev server not detected. Falling back to bundled views.");
    }
  }

  return DEFAULT_MAIN_VIEW_URL;
}

function appendReloadToken(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}reload=${Date.now()}`;
}

function resetDesktopPageZoom(window: BrowserWindow | null): void {
  if (!window) {
    return;
  }

  window.setPageZoom(DEFAULT_DESKTOP_PAGE_ZOOM);
}

async function runProjectCommand(command: string[]): Promise<void> {
  const processHandle = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: Bun.env,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await processHandle.exited;
  if (exitCode === 0) {
    return;
  }

  throw new Error(`Command failed with exit code ${exitCode}: ${command.join(" ")}`);
}

async function rebuildBundledMainView(): Promise<void> {
  console.log("Rebuilding bundled desktop main view before refresh.");
  await runProjectCommand(["bun", "run", "brand:generate"]);
  await runProjectCommand(["bun", "x", "vite", "build"]);
}

async function refreshMainView(window: BrowserWindow | null, currentChannel: string) {
  if (!window) {
    throw new Error("Desktop main window is unavailable.");
  }

  const resolvedUrl = await resolveMainViewUrl(currentChannel);
  const usedDevServer = resolvedUrl !== DEFAULT_MAIN_VIEW_URL;
  let rebuilt = false;

  if (currentChannel === "dev" && !usedDevServer) {
    await rebuildBundledMainView();
    rebuilt = true;
  }

  const reloadUrl = appendReloadToken(resolvedUrl);
  window.url = reloadUrl;
  window.webview.loadURL(reloadUrl);

  return {
    url: resolvedUrl,
    usedDevServer,
    rebuilt,
  };
}

const channel = await Updater.localInfo.channel();
const singleInstance = await createSingleInstanceCoordinator({
  appKey: resolveSingleInstanceAppKey(channel),
  appName: channel === "dev" ? "MaomiAgent dev" : "MaomiAgent",
});

if (singleInstance.kind === "secondary") {
  console.log(
    "Detected an existing MaomiAgent instance. Activated it instead of launching a duplicate process.",
  );
  process.exit(0);
}

const url = await resolveMainViewUrl(channel);

type DesktopWindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DesktopWindowDragPointer = {
  offsetX: number;
  offsetY: number;
  windowWidth: number;
};

let lastNormalWindowFrame: DesktopWindowFrame | null = null;
let restoreFrameTimeoutId: ReturnType<typeof setTimeout> | null = null;

function isEffectivelyMaximized(window: BrowserWindow): boolean {
  return window.isMaximized();
}

function ensureWindowFrameVisibleAndRemember(
  window: BrowserWindow,
  options?: {
    rememberAsNormalFrame?: boolean;
  },
): DesktopWindowFrame {
  const fittedFrame = ensureWindowFrameVisible(window);

  if (options?.rememberAsNormalFrame !== false && !isEffectivelyMaximized(window) && !window.isFullScreen()) {
    lastNormalWindowFrame = { ...fittedFrame };
  }

  return fittedFrame;
}

function applyRestoreFrame(window: BrowserWindow, frame: DesktopWindowFrame): DesktopWindowFrame {
  const fittedFrame = fitFrameToVisibleWorkArea(frame);

  if (restoreFrameTimeoutId) {
    clearTimeout(restoreFrameTimeoutId);
    restoreFrameTimeoutId = null;
  }

  window.focus();
  window.setFrame(fittedFrame.x, fittedFrame.y, fittedFrame.width, fittedFrame.height);

  // Windows maximize->restore transition can race with setFrame; re-apply once in next tick.
  restoreFrameTimeoutId = setTimeout(() => {
    window.focus();
    window.setFrame(fittedFrame.x, fittedFrame.y, fittedFrame.width, fittedFrame.height);
    restoreFrameTimeoutId = null;
  }, 16);

  return fittedFrame;
}

function restoreWindowForDrag(
  window: BrowserWindow,
  dragPointer?: DesktopWindowDragPointer,
): void {
  if (!isEffectivelyMaximized(window)) {
    return;
  }

  const maximizedFrame = window.getFrame();
  const fallbackFrame: DesktopWindowFrame = {
    x: maximizedFrame.x,
    y: maximizedFrame.y,
    width: Math.max(900, Math.round(maximizedFrame.width * 0.86)),
    height: Math.max(640, Math.round(maximizedFrame.height * 0.86)),
  };
  const restoreFrame = lastNormalWindowFrame ?? fallbackFrame;
  const fittedRestoreFrame: DesktopWindowFrame = {
    x: restoreFrame.x,
    y: restoreFrame.y,
    width: Math.min(Math.max(Math.round(restoreFrame.width), 480), Math.round(maximizedFrame.width)),
    height: Math.min(Math.max(Math.round(restoreFrame.height), 320), Math.round(maximizedFrame.height)),
  };

  window.unmaximize();

  if (!dragPointer) {
    lastNormalWindowFrame = applyRestoreFrame(window, fittedRestoreFrame);
    return;
  }

  lastNormalWindowFrame = applyRestoreFrame(window, resolveRestoreFrameForDrag({
    maximizedFrame,
    restoreFrame: fittedRestoreFrame,
    dragPointer,
  }));
}

function maximizeWindow(window: BrowserWindow): void {
  lastNormalWindowFrame = { ...window.getFrame() };
  window.maximize();
}

function unmaximizeWindow(window: BrowserWindow): void {
  const maximizedFrame = window.getFrame();
  const workArea = resolveNearestWorkArea(maximizedFrame);
  const fallbackFrame: DesktopWindowFrame = {
    x: workArea.x,
    y: workArea.y,
    width: Math.max(900, Math.round(workArea.width * 0.86)),
    height: Math.max(640, Math.round(workArea.height * 0.86)),
  };
  const restoreSize = lastNormalWindowFrame ?? fallbackFrame;

  window.unmaximize();
  lastNormalWindowFrame = applyRestoreFrame(window, resolveCenteredFrameInWorkArea({
    workArea,
    frame: {
      width: restoreSize.width,
      height: restoreSize.height,
    },
  }));
}

function resizeWindow(window: BrowserWindow, resizePointer?: DesktopWindowResizePointer): void {
  if (!resizePointer || isEffectivelyMaximized(window)) {
    return;
  }

  const resizedFrame = resizeFrameFromPointer(resizePointer);
  lastNormalWindowFrame = applyRestoreFrame(window, resizedFrame);
}

function handleWindowAction(
  window: BrowserWindow | null,
  action: DesktopWindowAction,
  dragPointer?: DesktopWindowDragPointer,
  resizePointer?: DesktopWindowResizePointer,
) {
  if (!window) {
    return { maximized: false };
  }

  if (action === "minimize") {
    window.minimize();
  } else if (action === "toggleMaximize") {
    if (isEffectivelyMaximized(window)) {
      unmaximizeWindow(window);
    } else {
      maximizeWindow(window);
    }
  } else if (action === "restoreForDrag") {
    restoreWindowForDrag(window, dragPointer);
  } else if (action === "resizeWindow") {
    resizeWindow(window, resizePointer);
  } else if (action === "exitFullScreen") {
    if (window.isFullScreen()) {
      window.setFullScreen(false);
    }
  } else if (action === "close") {
    window.close();
  }
  return { maximized: isEffectivelyMaximized(window) };
}

async function chooseDirectory(startingFolder?: string): Promise<string | null> {
  const normalizedStartingFolder = startingFolder?.trim();
  const selections = await Utils.openFileDialog({
    ...(normalizedStartingFolder ? { startingFolder: normalizedStartingFolder } : {}),
    canChooseFiles: false,
    canChooseDirectory: true,
    allowsMultipleSelection: false,
  });

  const directoryPath = selections
    .map((value) => value.trim())
    .find(Boolean);

  return directoryPath ?? null;
}

function sanitizeSuggestedFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_");
  return normalized || "export.svg";
}

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function buildDialogFilterString(filters: Array<{ name: string; extensions: string[] }> | undefined): string {
  if (!filters || filters.length === 0) {
    return "All Files (*.*)|*.*";
  }

  const normalized = filters
    .map((filter) => {
      const extensions = filter.extensions
        .map((extension) => extension.trim().replace(/^\./, ""))
        .filter(Boolean);
      if (extensions.length === 0) {
        return null;
      }

      return `${filter.name} (${extensions.map((extension) => `*.${extension}`).join(", ")})|${extensions.map((extension) => `*.${extension}`).join(";")}`;
    })
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? normalized.join("|") : "All Files (*.*)|*.*";
}

async function runCommandForStdout(command: string[]): Promise<{ exitCode: number; stdout: string }> {
  const processHandle = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: Bun.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });

  const stdout = await new Response(processHandle.stdout).text();
  const exitCode = await processHandle.exited;
  return {
    exitCode,
    stdout: stdout.trim(),
  };
}

async function chooseSaveFilePath(input: {
  suggestedName: string;
  startingFolder?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | null> {
  const suggestedName = sanitizeSuggestedFileName(input.suggestedName);
  const startingFolder = input.startingFolder?.trim();

  if (process.platform === "win32") {
    const filter = buildDialogFilterString(input.filters);
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.SaveFileDialog",
      `$dialog.FileName = '${escapePowerShellLiteral(suggestedName)}'`,
      `$dialog.Filter = '${escapePowerShellLiteral(filter)}'`,
      "$dialog.OverwritePrompt = $true",
      "$dialog.AddExtension = $true",
      ...(startingFolder ? [`$dialog.InitialDirectory = '${escapePowerShellLiteral(startingFolder)}'`] : []),
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }",
    ].join("; ");
    const result = await runCommandForStdout(["powershell", "-NoProfile", "-STA", "-Command", script]);
    return result.exitCode === 0 && result.stdout ? result.stdout : null;
  }

  if (process.platform === "darwin") {
    const defaultLocation = startingFolder
      ? ` default location POSIX file "${startingFolder.replace(/"/g, '\\"')}"`
      : "";
    const script = `POSIX path of (choose file name with prompt "Save SVG" default name "${suggestedName.replace(/"/g, '\\"')}"${defaultLocation})`;
    const result = await runCommandForStdout(["osascript", "-e", script]);
    return result.exitCode === 0 && result.stdout ? result.stdout : null;
  }

  const zenityPath = Bun.which("zenity");
  if (zenityPath) {
    const fileName = startingFolder
      ? `${startingFolder.replace(/\\/g, "/").replace(/\/?$/, "/")}${suggestedName}`
      : suggestedName;
    const result = await runCommandForStdout([
      zenityPath,
      "--file-selection",
      "--save",
      "--confirm-overwrite",
      "--filename",
      fileName,
    ]);
    return result.exitCode === 0 && result.stdout ? result.stdout : null;
  }

  throw new Error("Save dialog is unavailable on this platform.");
}

async function saveTextFileWithDialog(input: {
  suggestedName: string;
  content: string;
  startingFolder?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<{ saved: boolean; path?: string }> {
  const targetPath = await chooseSaveFilePath({
    suggestedName: input.suggestedName,
    startingFolder: input.startingFolder,
    filters: input.filters,
  });

  if (!targetPath) {
    return { saved: false };
  }

  await writeFile(targetPath, input.content, "utf8");
  return {
    saved: true,
    path: targetPath,
  };
}

async function openPathInFileManager(targetPath: string): Promise<{ opened: boolean }> {
  const normalizedTargetPath = targetPath.trim();
  if (!normalizedTargetPath) {
    throw new Error("Path is required to open the file manager.");
  }

  if (process.platform === "win32") {
    const windowsTargetPath = normalizedTargetPath.replaceAll("/", "\\");
    const script = `Start-Process -FilePath explorer.exe -ArgumentList '${escapePowerShellLiteral(windowsTargetPath)}'`;
    const processHandle = Bun.spawn({
      cmd: ["powershell", "-NoProfile", "-Command", script],
      cwd: process.cwd(),
      env: Bun.env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });

    const exitCode = await processHandle.exited;
    if (exitCode !== 0) {
      throw new Error(`Failed to open path in file manager: ${normalizedTargetPath}`);
    }

    return { opened: true };
  }

  const command = process.platform === "darwin"
    ? ["open", normalizedTargetPath]
    : ["xdg-open", normalizedTargetPath];

  const processHandle = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: Bun.env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });

  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to open path in file manager: ${normalizedTargetPath}`);
  }

  return { opened: true };
}

async function openExternalUrl(targetUrl: string): Promise<{ opened: boolean }> {
  const normalizedTargetUrl = targetUrl.trim();
  if (!normalizedTargetUrl) {
    throw new Error("URL is required to open an external browser.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedTargetUrl);
  } catch {
    throw new Error(`Invalid external URL: ${normalizedTargetUrl}`);
  }

  if (!["http:", "https:", "mailto:", "tel:"].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsedUrl.protocol}`);
  }

  const command = process.platform === "win32"
    ? ["rundll32.exe", "url.dll,FileProtocolHandler", parsedUrl.toString()]
    : process.platform === "darwin"
      ? ["open", parsedUrl.toString()]
      : ["xdg-open", parsedUrl.toString()];

  const processHandle = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: Bun.env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });

  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to open external URL: ${parsedUrl.toString()}`);
  }

  return { opened: true };
}

function resolveModuleHost(host: ModuleHost | null): ModuleHost {
  if (!host) {
    throw new Error("Desktop IOC host is not ready.");
  }

  return host;
}

function resolveRuntimeLogsQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(RUNTIME_LOGS_QUERY_PORT);
}

function resolveRuntimeLogWriterPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(RUNTIME_LOG_WRITER_PORT);
}

function resolveDesktopAiOneShotPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_AI_ONE_SHOT_PORT);
}

function resolveDesktopBrowserPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_BROWSER_PORT);
}

function resolveDesktopWorkspaceQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_WORKSPACE_QUERY_PORT);
}

function resolveDesktopWorkspaceCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_WORKSPACE_COMMAND_PORT);
}

function resolveDesktopGitQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_GIT_QUERY_PORT);
}

function resolveDesktopGitCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_GIT_COMMAND_PORT);
}

function resolveDesktopTasksQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_TASKS_QUERY_PORT);
}

function resolveDesktopTasksCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_TASKS_COMMAND_PORT);
}

function resolveDesktopTerminalsQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_TERMINALS_QUERY_PORT);
}

function resolveDesktopTerminalsCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_TERMINALS_COMMAND_PORT);
}

function resolveDesktopWechatQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_WECHAT_QUERY_PORT);
}

function resolveDesktopWechatCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_WECHAT_COMMAND_PORT);
}

function resolveDesktopFeishuQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_FEISHU_QUERY_PORT);
}

function resolveDesktopFeishuCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_FEISHU_COMMAND_PORT);
}

function createDesktopFeishuDocTreeRuntimeRequestHandlers(host: ModuleHost | null): {
  loadDesktopFeishuDocTreeRoot: (input: FeishuDocTreeLoadInput) => Promise<FeishuDocTreeLoadResult>;
  loadDesktopFeishuDocTreeBranch: (input: FeishuDocTreeBranchInput) => Promise<FeishuDocTreeBranchResult>;
} {
  return {
    loadDesktopFeishuDocTreeRoot: (input) =>
      resolveDesktopFeishuQueryPort(host).loadDocTreeRoot(input),
    loadDesktopFeishuDocTreeBranch: (input) =>
      resolveDesktopFeishuQueryPort(host).loadDocTreeBranch(input),
  };
}

function resolveDesktopMemoryQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MEMORY_QUERY_PORT);
}

function resolveDesktopMemoryCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MEMORY_COMMAND_PORT);
}

function resolveDesktopAgentsQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_AGENTS_QUERY_PORT);
}

function resolveDesktopAgentsCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_AGENTS_COMMAND_PORT);
}

function resolveDesktopUiDesignerQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_UI_DESIGNER_QUERY_PORT);
}

function resolveDesktopUiDesignerCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_UI_DESIGNER_COMMAND_PORT);
}

function resolveDesktopModelsQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MODELS_QUERY_PORT);
}

function resolveDesktopModelsCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MODELS_COMMAND_PORT);
}

function resolveDesktopConversationQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_CONVERSATION_QUERY_PORT);
}

function resolveDesktopConversationCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_CONVERSATION_COMMAND_PORT);
}

function resolveDesktopConversationService(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(
    DESKTOP_CONVERSATION_SERVICE_TOKEN,
  ) as DesktopConversationService;
}

function resolveDesktopSkillsQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_SKILLS_QUERY_PORT);
}

function resolveDesktopSkillsCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_SKILLS_COMMAND_PORT);
}

function resolveDesktopSkillsMarketPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_SKILLS_MARKET_PORT);
}

function resolveDesktopMcpQueryPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MCP_QUERY_PORT);
}

function resolveDesktopMcpCommandPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MCP_COMMAND_PORT);
}

function resolveDesktopMcpMarketPort(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(DESKTOP_MCP_MARKET_PORT);
}

function toDesktopMemoryProjectionInput(query?: DesktopMemoryProjectionQuery) {
  if (!query) {
    return {};
  }

  return {
    units: {
      scopeFilter: query.scopeFilter,
      q: query.q,
      tiers: query.tiers,
      kinds: query.kinds,
      status: query.status,
      includeGlobal: query.includeGlobal,
      limit: query.unitsLimit ?? query.limit,
      offset: query.unitsOffset ?? query.offset,
    },
    traces: {
      limit: query.traceLimit,
      queryLike: query.traceQueryLike,
      unitId: query.traceUnitId,
      from: query.traceFrom,
      to: query.traceTo,
    },
    runtimeContextQuery: query.runtimeQuery,
  };
}

function toDesktopMemoryMaintenanceInput(input?: DesktopMemoryMaintenanceRequest) {
  if (!input) {
    return {};
  }

  return {
    scopeFilter: input.scopeFilter,
    action: input.action,
    criteria: input.criteria,
  };
}

function createRuntimeLogsRpcLogger(host: ModuleHost | null) {
  return resolveModuleHost(host).container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
    source: "desktop",
    module: "desktop.logs.rpc",
  });
}

function clearRuntimeLogsBefore(host: ModuleHost | null, query: Pick<RuntimeLogsQuery, "from" | "to">) {
  if (!query.to) {
    throw new Error("Query parameter \"to\" is required");
  }

  const deleted = resolveRuntimeLogsQueryPort(host).deleteByQuery(query);
  void createRuntimeLogsRpcLogger(host).warn("Desktop runtime logs before cutoff cleared", {
    context: {
      by: "rpc",
      deleted,
      from: query.from,
      to: query.to,
    },
  });
  return { deleted };
}

try {
  let host: ModuleHost | null = null;

  await startDesktopApplication({
    appIdentifier: APP_IDENTIFIER,
    appName: channel === "dev" ? "MaomiAgent dev" : "MaomiAgent",
    channel,
    mainViewUrl: url,
    singleInstance,
    onHostCreated(nextHost) {
      host = nextHost;
    },
    window: {
      title: "MaomiAgent",
      frame: {
        width: 1240,
        height: 840,
        x: 160,
        y: 80,
      },
    },
    createWindow(options) {
      let window: BrowserWindow | null = null;
      lastNormalWindowFrame = null;
      const singleInstanceAppKey = resolveSingleInstanceAppKey(channel);
      singleInstance.registerHttpRoute({
        method: "POST",
        path: REFRESH_MAIN_VIEW_ROUTE_PATH,
        async handler(request) {
          let accepted = false;
          let requestedDevServerUrl = "";

          try {
            const parsed = JSON.parse(request.bodyText) as {
              action?: string;
              appKey?: string;
              protocol?: string;
              devServerUrl?: string;
            };
            accepted = parsed.action === "activate"
              && parsed.appKey === singleInstanceAppKey
              && parsed.protocol === DESKTOP_LOCAL_CONTROL_PROTOCOL;
            requestedDevServerUrl = typeof parsed.devServerUrl === "string"
              ? parsed.devServerUrl.trim()
              : "";
          } catch {
            accepted = false;
          }

          if (accepted) {
            try {
              if (channel === "dev" && requestedDevServerUrl) {
                activeDevServerUrl = requestedDevServerUrl;
              }
              await refreshMainView(window, channel);
            } catch (error) {
              console.warn("Failed to refresh the activated desktop main view.", error);
            }
          }

          return {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
            body: JSON.stringify({
              accepted,
              protocol: DESKTOP_LOCAL_CONTROL_PROTOCOL,
            }),
          };
        },
      });
      const rpc = defineElectrobunRPC<DesktopRendererRPC, "bun">("bun", {
        maxRequestTime: Infinity,
        handlers: {
          requests: {
            getWindowState: () => ({ maximized: window ? isEffectivelyMaximized(window) : false }),
            windowControl: ({ action, dragPointer, resizePointer }) =>
              handleWindowAction(window, action, dragPointer, resizePointer),
            refreshMainView: () => refreshMainView(window, channel),
            chooseDirectory: (options) => chooseDirectory(options?.startingFolder),
            saveTextFileWithDialog: (input) => saveTextFileWithDialog(input),
            openPathInFileManager: ({ path }) => openPathInFileManager(path),
            openExternalUrl: ({ url }) => openExternalUrl(url),
            "browser.createTab": () => resolveDesktopBrowserPort(host).createTab(),
            "browser.activateTab": ({ tabId }) => resolveDesktopBrowserPort(host).activateTab(tabId),
            "browser.closeTab": ({ tabId }) => resolveDesktopBrowserPort(host).closeTab(tabId),
            "browser.getSnapshot": () => resolveDesktopBrowserPort(host).getSnapshot(),
            "browser.navigate": ({ tabId, url }) => resolveDesktopBrowserPort(host).navigate(tabId, url),
            "browser.goBack": ({ tabId }) => resolveDesktopBrowserPort(host).goBack(tabId),
            "browser.goForward": ({ tabId }) => resolveDesktopBrowserPort(host).goForward(tabId),
            "browser.refresh": ({ tabId }) => resolveDesktopBrowserPort(host).refresh(tabId),
            "browser.extract": ({ tabId }) => resolveDesktopBrowserPort(host).extract(tabId),
            "browser.screenshot": ({ tabId }) => resolveDesktopBrowserPort(host).screenshot(tabId),
            "browser.interact": ({ tabId, request }) =>
              resolveDesktopBrowserPort(host).interact(tabId, request),
            checkDesktopAppUpdate: () => checkDesktopAppUpdate(),
            installDesktopAppUpdate: (input) => installDesktopAppUpdate(input),
            listDesktopConversationSessions: (query) =>
              resolveDesktopConversationQueryPort(host).listSessions(query ?? {}),
            getDesktopConversationSession: ({ sessionId }) =>
              resolveDesktopConversationQueryPort(host).getSession(sessionId),
            getDesktopConversationSessionDetail: ({ sessionId }) =>
              resolveDesktopConversationQueryPort(host).getSessionDetail(sessionId),
            listDesktopConversationCapabilities: (query) =>
              resolveDesktopConversationQueryPort(host).listCapabilities(query),
            getDesktopConversationWorkspaceSettings: (input) =>
              resolveDesktopConversationQueryPort(host).getWorkspaceSettings(input),
            createDesktopConversationSession: (input) =>
              resolveDesktopConversationCommandPort(host).createSession(input),
            renameDesktopConversationSession: (input) =>
              resolveDesktopConversationCommandPort(host).renameSession(input),
            hideDesktopConversationSession: ({ sessionId }) =>
              resolveDesktopConversationCommandPort(host).hideSession(sessionId),
            saveDesktopConversationWorkspaceSettings: (input) =>
              resolveDesktopConversationCommandPort(host).saveWorkspaceSettings(input),
            sendDesktopConversationMessage: (input) =>
              resolveDesktopConversationCommandPort(host).sendMessage(input),
            stopDesktopConversationMessage: (input) =>
              resolveDesktopConversationCommandPort(host).stopMessage(input),
            answerDesktopConversationInteraction: (input) =>
              resolveDesktopConversationCommandPort(host).answerInteraction(input),
            rejectDesktopConversationInteraction: (input) =>
              resolveDesktopConversationCommandPort(host).rejectInteraction(input),
            executeDesktopAiOneShot: (input) =>
              resolveDesktopAiOneShotPort(host).execute(input),
            getRuntimeLogs: (query) => resolveRuntimeLogsQueryPort(host).query(query ?? {}),
            getRuntimeLogsSummary: (query) => resolveRuntimeLogsQueryPort(host).summary(query ?? {}),
            writeRuntimeLog: (input) => resolveRuntimeLogWriterPort(host).write(input),
            clearRuntimeLogs: () => {
              const deleted = resolveRuntimeLogsQueryPort(host).clear();
              void createRuntimeLogsRpcLogger(host).warn("Desktop runtime logs cleared", {
                context: {
                  by: "rpc",
                  deleted,
                },
              });
              return { deleted };
            },
            clearRuntimeLogsBefore: (query) => clearRuntimeLogsBefore(host, query),
            getDesktopWechatState: () => resolveDesktopWechatQueryPort(host).getState(),
            saveDesktopWechatConfig: (input) => resolveDesktopWechatCommandPort(host).saveConfig(input),
            startDesktopWechatQrLogin: (input) => resolveDesktopWechatCommandPort(host).startQrLogin(input),
            pollDesktopWechatQrLogin: (input) => resolveDesktopWechatCommandPort(host).pollQrLogin(input),
            setDesktopWechatAccountStatus: ({ accountId, input }) =>
              resolveDesktopWechatCommandPort(host).setAccountStatus(accountId, input),
            clearDesktopWechatAccountConversations: ({ accountId }) =>
              resolveDesktopWechatCommandPort(host).clearAccountConversations(accountId),
            removeDesktopWechatAccount: ({ accountId }) =>
              resolveDesktopWechatCommandPort(host).removeAccount(accountId),
            getDesktopFeishuState: () => resolveDesktopFeishuQueryPort(host).getState(),
            saveDesktopFeishuPersonalConfig: (input) =>
              resolveDesktopFeishuCommandPort(host).savePersonalConfig(input),
            clearDesktopFeishuPersonalConfig: () =>
              resolveDesktopFeishuCommandPort(host).clearPersonalConfig(),
            saveDesktopFeishuDeveloperConfig: (input) =>
              resolveDesktopFeishuCommandPort(host).saveDeveloperConfig(input),
            beginDesktopFeishuDeveloperAuthorization: (input) =>
              resolveDesktopFeishuCommandPort(host).beginDeveloperAuthorization(input),
            refreshDesktopFeishuDeveloperToken: () =>
              resolveDesktopFeishuCommandPort(host).refreshDeveloperToken(),
            clearDesktopFeishuSmartAssistantConfig: () =>
              resolveDesktopFeishuCommandPort(host).clearSmartAssistantConfig(),
            clearDesktopFeishuConfig: () =>
              resolveDesktopFeishuCommandPort(host).clearConfig(),
            getDesktopFeishuBotState: () => resolveDesktopFeishuQueryPort(host).getBotState(),
            saveDesktopFeishuBotConfig: (input) =>
              resolveDesktopFeishuCommandPort(host).saveBotConfig(input),
            clearDesktopFeishuBotConfig: () =>
              resolveDesktopFeishuCommandPort(host).clearBotConfig(),
            getDesktopFeishuDocsCapabilities: () =>
              resolveDesktopFeishuQueryPort(host).getDocsCapabilities(),
            getDesktopFeishuDocTree: (input) =>
              resolveDesktopFeishuQueryPort(host).getDocTree(input),
            ...createDesktopFeishuDocTreeRuntimeRequestHandlers(host),
            getDesktopFeishuDocContent: ({ docId }) =>
              resolveDesktopFeishuQueryPort(host).getDocContent(docId),
            getDesktopFeishuDocMediaPreviewUrls: ({ fileTokens }) =>
              resolveDesktopFeishuQueryPort(host).getDocMediaPreviewUrls({ fileTokens }),
            getDesktopFeishuDocWhiteboardPreviewUrls: ({ whiteboardTokens }) =>
              resolveDesktopFeishuQueryPort(host).getDocWhiteboardPreviewUrls({ whiteboardTokens }),
            openDesktopFeishuWorkspaceDoc: ({ workspaceId, docId }) =>
              resolveDesktopFeishuCommandPort(host).openWorkspaceDoc({ workspaceId, docId }),
            openDesktopFeishuDocIR: (input) =>
              resolveDesktopFeishuQueryPort(host).openDocIR(input),
            pullDesktopFeishuDocIR: (input) =>
              resolveDesktopFeishuCommandPort(host).pullDocIR(input),
            pushDesktopFeishuDocIR: (input) =>
              resolveDesktopFeishuCommandPort(host).pushDocIR(input),
            getDesktopFeishuWorkspaceDocLocalDraft: ({ workspaceId, docId }) =>
              resolveDesktopFeishuQueryPort(host).getWorkspaceDocLocalDraft({ workspaceId, docId }),
            inspectDesktopFeishuWorkspaceDocPermissions: ({ workspaceId, docId }) =>
              resolveDesktopFeishuQueryPort(host).inspectWorkspaceDocPermissions({ workspaceId, docId }),
            saveDesktopFeishuWorkspaceDocLocalDraft: (input) =>
              resolveDesktopFeishuCommandPort(host).saveWorkspaceDocLocalDraft(input),
            pullDesktopFeishuWorkspaceDoc: ({ workspaceId, docId }) =>
              resolveDesktopFeishuCommandPort(host).pullWorkspaceDoc({ workspaceId, docId }),
            pushDesktopFeishuWorkspaceDoc: (input) =>
              resolveDesktopFeishuCommandPort(host).pushWorkspaceDoc(input),
            executeDesktopFeishuSmartAssistantAction: (input) =>
              resolveDesktopFeishuCommandPort(host).executeSmartAssistantAction(input),
            getDesktopWorkspaceFileTree: ({ workspaceId, path }) =>
              resolveDesktopWorkspaceQueryPort(host).getFileTree(workspaceId, path),
            getDesktopWorkspaceFileContent: ({ workspaceId, path }) =>
              resolveDesktopWorkspaceQueryPort(host).getFileContent(workspaceId, path),
            writeDesktopWorkspaceTextFile: ({ workspaceId, path, content }) =>
              resolveDesktopWorkspaceCommandPort(host).writeTextFile(workspaceId, path, content),
            getDesktopUiDesignerState: (query) =>
              resolveDesktopUiDesignerQueryPort(host).getState(query),
            saveDesktopUiDesignerDesignPackage: (input) =>
              resolveDesktopUiDesignerCommandPort(host).saveDesignPackage(input),
            getDesktopGitIgnore: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitIgnore(workspaceId),
            getDesktopGitSettings: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitSettings(workspaceId),
            getDesktopGitChanges: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitChanges(workspaceId),
            getDesktopGitReview: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitReview(workspaceId),
            getDesktopGitReviewDetail: ({ workspaceId, query }) =>
              resolveDesktopGitQueryPort(host).getGitReviewDetail(workspaceId, query),
            compareDesktopGitRefs: ({ workspaceId, query }) =>
              resolveDesktopGitQueryPort(host).compareGitRefs(workspaceId, query),
            getDesktopGitBranches: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitBranches(workspaceId),
            getDesktopGitStashes: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitStashes(workspaceId),
            getDesktopGitWorktrees: ({ workspaceId }) =>
              resolveDesktopGitQueryPort(host).getGitWorktrees(workspaceId),
            getDesktopGitHistory: ({ workspaceId, query }) =>
              resolveDesktopGitQueryPort(host).getGitHistory(workspaceId, query),
            getDesktopGitHistoryDetail: ({ workspaceId, hash }) =>
              resolveDesktopGitQueryPort(host).getGitHistoryDetail(workspaceId, hash),
            getDesktopGitModuleSnapshot: ({ workspaceId, query }) =>
              resolveDesktopGitQueryPort(host).getGitModuleSnapshot(workspaceId, query),
            getDesktopGitHunks: ({ workspaceId, query }) =>
              resolveDesktopGitQueryPort(host).getGitHunks(workspaceId, query),
            saveDesktopGitIgnore: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).saveGitIgnore(workspaceId, input),
            saveDesktopGitSettings: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).saveGitSettings(workspaceId, input),
            initDesktopGitRepository: ({ workspaceId }) =>
              resolveDesktopGitCommandPort(host).initGitRepository(workspaceId),
            stageDesktopGitChanges: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).stageGitChanges(workspaceId, input),
            unstageDesktopGitChanges: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).unstageGitChanges(workspaceId, input),
            discardDesktopGitChanges: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).discardGitChanges(workspaceId, input),
            commitDesktopGitChanges: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).commitGitChanges(workspaceId, input),
            generateDesktopGitCommitMessage: ({ workspaceId, query }) =>
              resolveDesktopGitQueryPort(host).generateGitCommitMessage(workspaceId, query),
            createDesktopGitStash: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).createGitStash(workspaceId, input),
            applyDesktopGitStash: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).applyGitStash(workspaceId, input),
            popDesktopGitStash: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).popGitStash(workspaceId, input),
            dropDesktopGitStash: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).dropGitStash(workspaceId, input),
            createDesktopGitBranch: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).createGitBranch(workspaceId, input),
            createDesktopGitTag: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).createGitTag(workspaceId, input),
            createDesktopGitWorktree: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).createGitWorktree(workspaceId, input),
            removeDesktopGitWorktree: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).removeGitWorktree(workspaceId, input),
            pruneDesktopGitWorktrees: ({ workspaceId }) =>
              resolveDesktopGitCommandPort(host).pruneGitWorktrees(workspaceId),
            checkoutDesktopGitBranch: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).checkoutGitBranch(workspaceId, input),
            mergeDesktopGitBranchIntoCurrent: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).mergeGitBranchIntoCurrent(workspaceId, input),
            rebaseDesktopGitBranchIntoCurrent: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).rebaseCurrentGitBranch(workspaceId, input),
            renameDesktopGitBranch: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).renameGitBranch(workspaceId, input),
            deleteDesktopGitBranch: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).deleteGitBranch(workspaceId, input),
            fetchDesktopGitRemote: ({ workspaceId }) =>
              resolveDesktopGitCommandPort(host).fetchGitRemote(workspaceId),
            pullDesktopGitRemote: ({ workspaceId }) =>
              resolveDesktopGitCommandPort(host).pullGitRemote(workspaceId),
            pushDesktopGitRemote: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).pushGitRemote(workspaceId, input),
            revertDesktopGitCommit: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).revertGitCommit(workspaceId, input),
            cherryPickDesktopGitCommit: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).cherryPickGitCommit(workspaceId, input),
            resetDesktopGitCommit: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).resetGitCommit(workspaceId, input),
            stageDesktopGitHunks: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).stageGitHunks(workspaceId, input),
            unstageDesktopGitHunks: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).unstageGitHunks(workspaceId, input),
            discardDesktopGitHunks: ({ workspaceId, input }) =>
              resolveDesktopGitCommandPort(host).discardGitHunks(workspaceId, input),
            listDesktopWorkspaces: (query) => resolveDesktopWorkspaceQueryPort(host).list(query ?? {}),
            listDesktopTaskWorkspaces: () => resolveDesktopTasksQueryPort(host).listWorkspaces(),
            listDesktopTaskCenter: (query) => resolveDesktopTasksQueryPort(host).listTaskCenter(query ?? {}),
            listDesktopTasks: (query) => resolveDesktopTasksQueryPort(host).list(query ?? {}),
            listDesktopTerminalSessions: (query) => resolveDesktopTerminalsQueryPort(host).list(query ?? {}),
            listDesktopMemoryUnits: (params) =>
              resolveDesktopMemoryQueryPort(host).listUnits({
                workspaceId: params?.workspaceId,
                ...(params?.query ?? {}),
              }),
            getDesktopMemoryProjection: (params) =>
              resolveDesktopMemoryQueryPort(host).getProjection({
                workspaceId: params?.workspaceId,
                ...toDesktopMemoryProjectionInput(params?.query),
              }),
            appendDesktopMemory: ({ workspaceId, input }) =>
              resolveDesktopMemoryCommandPort(host).append({
                ...input,
                workspaceId: input.workspaceId ?? workspaceId,
              }),
            patchDesktopMemoryUnit: ({ workspaceId, unitId, input }) =>
              resolveDesktopMemoryCommandPort(host).patch({
                workspaceId,
                unitId,
                patch: input,
              }),
            removeDesktopMemoryUnit: ({ workspaceId, unitId }) =>
              resolveDesktopMemoryCommandPort(host).remove({ workspaceId, unitId }),
            searchDesktopMemory: ({ workspaceId, query }) =>
              resolveDesktopMemoryQueryPort(host).search({
                workspaceId,
                ...query,
              }),
            listDesktopMemoryTraces: async (params) => ({
              items: await resolveDesktopMemoryQueryPort(host).listRetrievalTraces({
                workspaceId: params?.workspaceId,
                ...(params?.query ?? {}),
              }),
            }),
            getDesktopMemoryRuntimeContext: (params) =>
              resolveDesktopMemoryQueryPort(host).getRuntimeContext(params ?? {}),
            previewDesktopMemoryMaintenance: (params) =>
              resolveDesktopMemoryCommandPort(host).previewMaintenance({
                workspaceId: params?.workspaceId,
                ...toDesktopMemoryMaintenanceInput(params?.input),
              }),
            applyDesktopMemoryMaintenance: ({ workspaceId, runId }) =>
              resolveDesktopMemoryCommandPort(host).applyMaintenance({ workspaceId, runId }),
            pullDesktopMemoryWorkingSet: ({ workspaceId, query }) =>
              resolveDesktopMemoryQueryPort(host).pullWorkingSet({
                workspaceId,
                ...query,
              }),
            pushDesktopMemoryWorkingSet: ({ workspaceId, input }) =>
              resolveDesktopMemoryCommandPort(host).pushWorkingSet({
                workspaceId,
                ...input,
              }),
            getDesktopTask: ({ workspaceId, taskId }) =>
              resolveDesktopTasksQueryPort(host).get(workspaceId, taskId),
            getDesktopTaskDetail: ({ workspaceId, taskId, runLimit, runOffset }) =>
              resolveDesktopTasksQueryPort(host).getDetail({
                workspaceId,
                taskId,
                runLimit,
                runOffset,
              }),
            listDesktopTaskRuns: ({ workspaceId, taskId, limit, offset }) =>
              resolveDesktopTasksQueryPort(host).listRuns({
                workspaceId,
                taskId,
                limit,
                offset,
              }),
            runDesktopTaskNow: ({ workspaceId, taskId }) =>
              resolveDesktopTasksCommandPort(host).runNow(workspaceId, taskId),
            cancelDesktopTask: ({ workspaceId, taskId }) =>
              resolveDesktopTasksCommandPort(host).cancel(workspaceId, taskId),
            retryDesktopTask: ({ workspaceId, taskId }) =>
              resolveDesktopTasksCommandPort(host).retry(workspaceId, taskId),
            pauseDesktopTaskSchedule: ({ workspaceId, taskId }) =>
              resolveDesktopTasksCommandPort(host).pauseSchedule(workspaceId, taskId),
            resumeDesktopTaskSchedule: ({ workspaceId, taskId }) =>
              resolveDesktopTasksCommandPort(host).resumeSchedule(workspaceId, taskId),
            getDesktopTerminalDetail: (query) =>
              resolveDesktopTerminalsQueryPort(host).getDetail(query),
            createDesktopTerminalSession: (input) =>
              resolveDesktopTerminalsCommandPort(host).create(input),
            executeDesktopTerminalInput: ({ sessionId, input }) =>
              resolveDesktopTerminalsCommandPort(host).execute(sessionId, input),
            resizeDesktopTerminalSession: ({ sessionId, input }) =>
              resolveDesktopTerminalsCommandPort(host).resize(sessionId, input),
            closeDesktopTerminalSession: ({ sessionId }) =>
              resolveDesktopTerminalsCommandPort(host).close(sessionId),
            getDesktopWorkspace: ({ workspaceId }) =>
              resolveDesktopWorkspaceQueryPort(host).get(workspaceId),
            createDesktopWorkspace: (input) =>
              resolveDesktopWorkspaceCommandPort(host).create(input),
            updateDesktopWorkspace: ({ workspaceId, input }) =>
              resolveDesktopWorkspaceCommandPort(host).update(workspaceId, input),
            removeDesktopWorkspace: async ({ workspaceId }) => {
              const result = await removeDesktopWorkspaceWithTaskCleanup({
                workspaceId,
                workspaceCommand: resolveDesktopWorkspaceCommandPort(host),
                tasksCommand: resolveDesktopTasksCommandPort(host),
              });
              return {
                removed: result.removed,
              };
            },
            listDesktopAgents: (query) => resolveDesktopAgentsQueryPort(host).list(query ?? {}),
            getDesktopAgent: ({ agentId }) => resolveDesktopAgentsQueryPort(host).get(agentId),
            getDesktopAgentBundle: ({ agentId }) =>
              resolveDesktopAgentsQueryPort(host).getBundle(agentId),
            createDesktopAgent: (input) => resolveDesktopAgentsCommandPort(host).create(input),
            updateDesktopAgent: ({ agentId, input }) =>
              resolveDesktopAgentsCommandPort(host).update(agentId, input),
            saveDesktopAgentBundle: (input) =>
              resolveDesktopAgentsCommandPort(host).saveBundle(input),
            setDesktopAgentEnabled: ({ agentId, enabled }) =>
              resolveDesktopAgentsCommandPort(host).setEnabled(agentId, enabled),
            removeDesktopAgent: ({ agentId }) =>
              resolveDesktopAgentsCommandPort(host).remove(agentId),
            previewDesktopAgentImport: (input) =>
              resolveDesktopAgentsCommandPort(host).previewImport(input),
            importDesktopAgents: (input) =>
              resolveDesktopAgentsCommandPort(host).importAgents(input),
            listDesktopModelProviders: async () => ({
              items: await resolveDesktopModelsQueryPort(host).listProviders(),
            }),
            listDesktopModelChannels: async (query) => ({
              items: await resolveDesktopModelsQueryPort(host).listChannels(query ?? {}),
            }),
            getDesktopModelsSnapshot: () => resolveDesktopModelsQueryPort(host).getSnapshot(),
            getDesktopModelRuntimeSelectionSnapshot: async (query) => ({
              item: await resolveDesktopModelsQueryPort(host).getRuntimeSelectionSnapshot(query ?? {}),
            }),
            listDesktopSkills: (query) => resolveDesktopSkillsQueryPort(host).list(query ?? {}),
            getDesktopSkill: ({ skillId }) => resolveDesktopSkillsQueryPort(host).get(skillId),
            discoverDesktopSkills: (query) => resolveDesktopSkillsQueryPort(host).discover(query ?? {}),
            getDesktopSkillsEffective: ({ workspaceId, q }) =>
              resolveDesktopSkillsQueryPort(host).getEffective(workspaceId, q),
            listDesktopSkillsMarketProviders: async () => ({
              items: resolveDesktopSkillsMarketPort(host).listProviders(),
            }),
            searchDesktopSkillsMarket: (query) =>
              resolveDesktopSkillsMarketPort(host).search(query ?? {}),
            installDesktopSkillMarket: (input) => resolveDesktopSkillsMarketPort(host).install(input),
            adoptDesktopSkill: (input) => resolveDesktopSkillsCommandPort(host).adopt(input),
            patchDesktopSkill: ({ skillId, input }) =>
              resolveDesktopSkillsCommandPort(host).patch(skillId, input),
            setDesktopSkillEnabled: ({ skillId, enabled }) =>
              resolveDesktopSkillsCommandPort(host).setEnabled(skillId, enabled),
            removeDesktopSkill: async ({ skillId }) => ({
              deleted: await resolveDesktopSkillsCommandPort(host).remove(skillId),
              skillId,
            }),
            listDesktopChannelModels: async ({ providerType, channelId }) => ({
              items: await resolveDesktopModelsQueryPort(host).listChannelModels(providerType, channelId),
            }),
            createDesktopModelChannel: ({ providerType, input }) =>
              resolveDesktopModelsCommandPort(host).createChannel(providerType, input),
            updateDesktopModelChannel: ({ providerType, channelId, input }) =>
              resolveDesktopModelsCommandPort(host).updateChannel(providerType, channelId, input),
            setDesktopModelChannelEnabled: ({ providerType, channelId, enabled }) =>
              resolveDesktopModelsCommandPort(host).setChannelEnabled(providerType, channelId, enabled),
            removeDesktopModelChannel: ({ providerType, channelId }) =>
              resolveDesktopModelsCommandPort(host).removeChannel(providerType, channelId),
            setDesktopChannelModelEnabled: ({ providerType, channelId, modelId, enabled }) =>
              resolveDesktopModelsCommandPort(host).setModelEnabled(providerType, channelId, modelId, enabled),
            batchSetDesktopChannelModelsEnabled: async ({ providerType, channelId, updates }) => ({
              items: await resolveDesktopModelsCommandPort(host).batchSetModelEnabled(
                providerType,
                channelId,
                updates,
              ),
            }),
            discoverDesktopChannelModels: ({ providerType, channelId }) =>
              resolveDesktopModelsCommandPort(host).discoverChannelModels(providerType, channelId),
            listDesktopMcp: (query) => resolveDesktopMcpQueryPort(host).list(query ?? {}),
            getDesktopMcpEffective: (params) => resolveDesktopMcpQueryPort(host).effective(params),
            listDesktopMcpRecommended: () => resolveDesktopMcpQueryPort(host).recommended(),
            createDesktopMcp: (input) => resolveDesktopMcpCommandPort(host).create(input),
            patchDesktopMcp: ({ mcpId, input }) => resolveDesktopMcpCommandPort(host).patch(mcpId, input),
            deleteDesktopMcp: ({ mcpId }) => resolveDesktopMcpCommandPort(host).delete(mcpId),
            testDesktopMcpConnection: ({ mcpId }) => resolveDesktopMcpCommandPort(host).testConnection(mcpId),
            healthCheckDesktopMcp: ({ mcpId }) => resolveDesktopMcpCommandPort(host).healthCheck(mcpId),
            fetchDesktopMcpCapabilities: ({ mcpId }) => resolveDesktopMcpCommandPort(host).capabilities(mcpId),
            listDesktopMcpHealthHistory: ({ mcpId, limit, offset }) =>
              resolveDesktopMcpQueryPort(host).healthHistory({ mcpId, limit, offset }),
            getDesktopMcpRuntimeConfig: (params) => resolveDesktopMcpQueryPort(host).runtimeConfig(params ?? {}),
            installDesktopMcpRecommended: ({ id, input }) =>
              resolveDesktopMcpCommandPort(host).installRecommended(id, input),
            listDesktopMcpMarketProviders: () => resolveDesktopMcpMarketPort(host).providers(),
            searchDesktopMcpMarket: (input) => resolveDesktopMcpMarketPort(host).search(input ?? {}),
            searchDesktopMcpMarketByRequirement: (input) =>
              resolveDesktopMcpMarketPort(host).searchByRequirement(input ?? {}),
            installDesktopMcpMarket: (input) => resolveDesktopMcpMarketPort(host).install(input),
            autoInstallDesktopMcpMarketByRequirement: (input) =>
              resolveDesktopMcpMarketPort(host).autoInstallByRequirement(input),
          },
          messages: {},
        },
      });

      resolveDesktopConversationService(host).setSessionDetailPublisher((update) => {
        rpc.send("desktopConversationSessionDetailUpdated", update);
      });
      resolveDesktopConversationService(host).setRuntimeEventsPublisher((update) => {
        rpc.send("desktopConversationRuntimeEventsUpdated", update);
      });

      const createdWindow = new BrowserWindow({
        ...options,
        rpc,
        titleBarStyle: "hidden",
        // Hidden custom chrome on Windows still needs a borderless host so
        // the renderer can own the titlebar while native maximize stays intact.
        styleMask: process.platform === "win32" ? { Borderless: true } : undefined,
        // Electrobun hidden+transparent windows on Windows can leak right-edge clicks
        // into the window behind the app. Keep transparency on other platforms.
        transparent: process.platform === "win32" ? false : true,
      });
      resetDesktopPageZoom(createdWindow);
      ensureWindowFrameVisibleAndRemember(createdWindow, {
        rememberAsNormalFrame: !isEffectivelyMaximized(createdWindow),
      });
      const rememberNormalFrame = () => {
        if (isEffectivelyMaximized(createdWindow) || createdWindow.isFullScreen()) {
          return;
        }

        lastNormalWindowFrame = createdWindow.getFrame();
      };
      createdWindow.webview.on("dom-ready", () => {
        resetDesktopPageZoom(createdWindow);
      });
      createdWindow.on("move", rememberNormalFrame);
      createdWindow.on("resize", rememberNormalFrame);
      createdWindow.on("close", () => {
        lastNormalWindowFrame = null;
      });
      window = createdWindow;
      return createdWindow;
    },
  });
} catch (error) {
  await singleInstance.dispose();
  throw error;
}

console.log("MaomiAgent Electrobun app started.");
