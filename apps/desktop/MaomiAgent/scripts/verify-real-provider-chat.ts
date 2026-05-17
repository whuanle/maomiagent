import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { DesktopAiRuntimeService } from "../src/bun/modules/ai";
import { DesktopAiExecutionProfileMaterializer } from "../src/bun/modules/ai/implementation/services/desktop-ai-execution-profile-materializer";
import { DesktopConfigurationService } from "../src/bun/modules/configuration";
import { DesktopConversationService, DesktopConversationStore, type DesktopConversationSessionDetail } from "../src/bun/modules/conversation";
import { DesktopDatabaseService } from "../src/bun/modules/database";
import type { DesktopRuntimeContext } from "../src/bun/modules/foundation";
import { RuntimeLogsService, RuntimeLogsStore } from "../src/bun/modules/logs";
import { DesktopModelsService } from "../src/bun/modules/models";
import { resolveDesktopConversationExecutionStrategy } from "../src/shared/conversation/managed-execution";

type CliOptions = {
  configPath: string;
  outputDir: string;
  promptSet: "hash" | "server" | "gomoku-plan" | "all";
};

type ExternalAzureConfig = {
  endpoint: string;
  key: string;
  modelId: string;
  deploymentName: string;
};

type Scenario = {
  id: string;
  prompt: string;
  composerMode?: "agent" | "plan";
};

type ScenarioResult = {
  id: string;
  prompt: string;
  route: ReturnType<typeof resolveDesktopConversationExecutionStrategy>;
  status: "passed" | "failed";
  target?: {
    providerType: string;
    channelId: string;
    modelId: string;
    protocolFamily?: string;
    apiStyle?: string;
    baseUrlHost?: string;
  };
  assistantPreview?: string;
  assistantHasCode?: boolean;
  assistantReasoningPreview?: string;
  assistantErrorPreview?: string;
  toolCallCount?: number;
  toolNames?: string[];
  pendingInteractionCount?: number;
  pendingInteractionKinds?: string[];
  runCount?: number;
  runBoundaries?: string[];
  planArtifactPreview?: string;
  planArtifactHasRequiredSections?: boolean;
  planArtifactMissingSections?: string[];
  messageSummaries?: Array<{
    role: string;
    partTypes: string[];
  }>;
  error?: string;
};

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = resolve(scriptPath, "..");
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..", "..");
const defaultConfigPath = "e:\\configs\\config.json";
const defaultOutputDir = join(repoRoot, "output", "real-provider");
const defaultPromptSet: CliOptions["promptSet"] = "all";
const channelId = "real_azure_gpt4o";
const sessionAgentId = "auto";

const SCENARIOS: Scenario[] = [
  {
    id: "hash",
    prompt: "使用 go 写一个哈希算法代码示例",
  },
  {
    id: "server",
    prompt: "使用 go 写一个 http 服务器支持静态文件",
  },
  {
    id: "gomoku-plan",
    composerMode: "plan",
    prompt: "帮我写一个五子棋程序，要求可以多人打开页面联机的，所以不能只是纯前端，可以多人组合对局和围观的，界面生成正在对战的棋局。",
  },
];

function printHelp() {
  process.stdout.write([
    "Usage: bun scripts/verify-real-provider-chat.ts [options]",
    "",
    "Options:",
    "  --config <path>      External config JSON path. Defaults to e:\\configs\\config.json.",
    "  --output-dir <path>  Directory for the JSON report.",
    "  --prompt-set <set>   hash | server | all. Defaults to all.",
    "  --help               Show this help text.",
    "",
  ].join("\n"));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    configPath: defaultConfigPath,
    outputDir: defaultOutputDir,
    promptSet: defaultPromptSet,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--config") {
      options.configPath = argv[index + 1]?.trim() || options.configPath;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      options.outputDir = argv[index + 1]?.trim() || options.outputDir;
      index += 1;
      continue;
    }

    if (arg === "--prompt-set") {
      const value = argv[index + 1]?.trim();
      if (value === "hash" || value === "server" || value === "gomoku-plan" || value === "all") {
        options.promptSet = value;
      } else {
        throw new Error(`Unsupported prompt set: ${value ?? ""}`);
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readRequiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required config field: ${label}`);
  }
  return value.trim();
}

function loadAzureConfig(configPath: string): ExternalAzureConfig {
  const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  const ai = parsed.AI as Record<string, unknown> | undefined;
  const gpt4o = ai?.["gpt-4o"] as Record<string, unknown> | undefined;
  if (!gpt4o) {
    throw new Error(`Missing AI.gpt-4o configuration in ${configPath}`);
  }

  return {
    endpoint: readRequiredText(gpt4o.Endpoint, "AI.gpt-4o.Endpoint"),
    key: readRequiredText(gpt4o.Key, "AI.gpt-4o.Key"),
    modelId: readRequiredText(gpt4o.ModelId, "AI.gpt-4o.ModelId"),
    deploymentName: readRequiredText(gpt4o.DeploymentName, "AI.gpt-4o.DeploymentName"),
  };
}

function tryReadAzureResourceName(endpoint: string): string | undefined {
  try {
    const url = new URL(endpoint);
    const match = url.hostname.match(/^([^.]+)\.openai\.azure\.com$/i);
    return match?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function createRuntimeContext(input: {
  tempRoot: string;
  modelsStatePath: string;
  modelsCatalogPath: string;
}): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.real-provider-test",
    appName: "MaomiAgent Real Provider Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    window: {
      title: "MaomiAgent Real Provider Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: join(input.tempRoot, "logs.sqlite"),
            },
            workspace: {
              path: join(input.tempRoot, "workspace.sqlite"),
            },
            conversation: {
              path: join(input.tempRoot, "conversation.sqlite"),
            },
          },
        },
        models: {
          state: {
            path: input.modelsStatePath,
          },
          catalog: {
            path: input.modelsCatalogPath,
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

function cleanupTempRoot(root: string) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch (error) {
    if (!isBusyCleanupError(error)) {
      throw error;
    }
  }
}

function isBusyCleanupError(error: unknown): error is { code: string } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown };
  return record.code === "EBUSY" || record.code === "EPERM";
}

function selectScenarios(promptSet: CliOptions["promptSet"]) {
  if (promptSet === "all") {
    return SCENARIOS.filter((item) => item.id !== "gomoku-plan");
  }
  return SCENARIOS.filter((item) => item.id === promptSet);
}

type PlanArtifactSectionCheck = {
  id: string;
  label: string;
  patterns: readonly RegExp[];
};

const PLAN_ARTIFACT_CORE_SECTION_CHECKS: readonly PlanArtifactSectionCheck[] = [
  {
    id: "goals_constraints",
    label: "Goals/Constraints",
    patterns: [/\b(goals?|objectives?|constraints?|requirements?)\b/iu, /(目标|约束|要求|范围)/u],
  },
  {
    id: "implementation_steps",
    label: "Implementation Steps",
    patterns: [/\b(implementation steps|development steps|execution phases|milestones?)\b/iu, /(实施步骤|开发步骤|实现步骤|执行阶段|阶段划分|里程碑)/u],
  },
  {
    id: "task_breakdown",
    label: "Task Breakdown",
    patterns: [/\b(task breakdown|work breakdown|tasks?|todos?)\b/iu, /(任务拆解|任务规划|子任务|工作拆解|待办)/u],
  },
  {
    id: "validation",
    label: "Validation",
    patterns: [/\b(validation|verification|test plan|testing)\b/iu, /(验证|验收|测试方案|测试计划|回归验证)/u],
  },
];

const PLAN_ARTIFACT_DESIGN_SECTION_CHECKS: readonly PlanArtifactSectionCheck[] = [
  {
    id: "architecture",
    label: "Architecture",
    patterns: [/\b(architecture|architectural|system design)\b/iu, /(架构设计|系统架构|技术架构|总体设计)/u],
  },
  {
    id: "module_design",
    label: "Module Design",
    patterns: [/\b(module design|module breakdown|component design|service design)\b/iu, /(模块设计|模块拆分|模块划分|组件设计|服务设计)/u],
  },
  {
    id: "impact_scope",
    label: "Affected Surfaces / Ownership",
    patterns: [/\b(affected files?|affected surfaces?|touchpoints?|ownership|boundaries|state ownership|data flow|interfaces?|contracts?)\b/iu, /(影响文件|影响面|涉及文件|涉及模块|触点|职责边界|责任边界|状态归属|数据流|接口|契约)/u],
  },
];

function extractPlanArtifact(detail: DesktopConversationSessionDetail) {
  const metadata = detail.metadata as Record<string, unknown> | undefined;
  const planState = metadata?.planState as Record<string, unknown> | undefined;
  return typeof planState?.content === "string"
    ? planState.content.trim()
    : "";
}

function validatePlanArtifact(value: string) {
  const content = value.trim();
  const missingCore = PLAN_ARTIFACT_CORE_SECTION_CHECKS.filter((check) =>
    !check.patterns.some((pattern) => pattern.test(content)));
  const matchedDesign = PLAN_ARTIFACT_DESIGN_SECTION_CHECKS.filter((check) =>
    check.patterns.some((pattern) => pattern.test(content)));
  const missing = matchedDesign.length > 0
    ? missingCore
    : [...missingCore, ...PLAN_ARTIFACT_DESIGN_SECTION_CHECKS];

  return {
    isComplete: missing.length === 0,
    missingSections: missing.map((check) => check.id),
    missingSectionLabels: missing.map((check) => check.label),
  };
}

function extractAssistantText(detail: DesktopConversationSessionDetail) {
  const textParts: string[] = [];
  const reasoningParts: string[] = [];
  const errorParts: string[] = [];

  for (const message of detail.messages) {
    if (message.role !== "assistant") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type === "text") {
        textParts.push(part.text);
      }
      if (part.type === "reasoning") {
        reasoningParts.push(part.text);
      }
      if (part.type === "error") {
        errorParts.push(part.error.message);
      }
    }
  }

  return {
    text: textParts.join("").trim(),
    reasoning: reasoningParts.join("").trim(),
    errors: errorParts.join("\n").trim(),
  };
}

function summarizeMessages(detail: DesktopConversationSessionDetail) {
  return detail.messages.map((message) => ({
    role: message.role,
    partTypes: message.parts.map((part) => part.type),
  }));
}

function summarizeRunBoundaries(detail: DesktopConversationSessionDetail) {
  return detail.runs.map((run) => run.boundary?.kind ?? "unknown");
}

function previewText(value: string, length = 600) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function hasGoLikeContent(value: string) {
  return /```go|package\s+main|func\s+main|http\.FileServer|sha256|md5|fnv/i.test(value);
}

async function prepareModelsService(input: {
  configuration: DesktopConfigurationService;
  logger: ReturnType<RuntimeLogsService["createLogger"]>;
  azure: ExternalAzureConfig;
}) {
  const modelsService = new DesktopModelsService(input.configuration, input.logger);
  const selectedModelId = input.azure.deploymentName;
  const resourceName = tryReadAzureResourceName(input.azure.endpoint);

  await modelsService.createChannel("azure", {
    channelId,
    name: "Real Azure GPT-4o",
    enabled: true,
    metadata: {
      env: {
        AZURE_API_KEY: input.azure.key,
      },
      ...(resourceName
        ? {
            config: {
              resourceName,
            },
          }
        : {}),
    },
    ...(!resourceName ? { baseUrl: input.azure.endpoint } : {}),
  });

  await modelsService.setModelEnabled("azure", channelId, selectedModelId, true);

  return {
    modelsService,
    selectedModelId,
  };
}

async function runScenario(input: {
  scenario: Scenario;
  service: DesktopConversationService;
  modelsService: DesktopModelsService;
  selectedModelId: string;
  workspaceRoot: string;
}) : Promise<ScenarioResult> {
  const workspaceId = join(input.workspaceRoot, input.scenario.id);
  mkdirSync(workspaceId, { recursive: true });

  const route = resolveDesktopConversationExecutionStrategy({
    text: input.scenario.prompt,
    selectedAgentId: sessionAgentId,
    ...(input.scenario.composerMode ? { composerMode: input.scenario.composerMode } : {}),
  });

  try {
    const target = await input.modelsService.resolveRuntimeTarget({
      workspaceId,
      selectedChannelId: channelId,
      selectedModelId: input.selectedModelId,
    });
    const created = await input.service.createSession({
      workspaceId,
      title: `Real provider ${input.scenario.id}`,
      selectedAgentId: sessionAgentId,
    });
    const response = await input.service.sendMessage({
      sessionId: created.item.sessionId,
      text: input.scenario.prompt,
      ...(input.scenario.composerMode ? { composerMode: input.scenario.composerMode } : {}),
      selectedAgentId: sessionAgentId,
      selectedChannelId: channelId,
      selectedModelId: input.selectedModelId,
      workspaceId,
    });

    const { text, reasoning, errors } = extractAssistantText(response.detail);
    const planArtifact = extractPlanArtifact(response.detail);
    const planValidation = validatePlanArtifact(planArtifact);
    const baseUrlHost = target.serviceConfig.baseUrl
      ? new URL(target.serviceConfig.baseUrl).host
      : undefined;
    const runBoundaries = summarizeRunBoundaries(response.detail);
    const messageSummaries = summarizeMessages(response.detail);
    const passed = input.scenario.composerMode === "plan"
      ? route.executionMode === "interactive"
        && route.runMode === "normal"
        && planArtifact.length > 0
        && planValidation.isComplete
        && text.length > 0
      : route.executionMode === "interactive"
        && route.runMode === "normal"
        && response.detail.toolCalls.length === 0
        && response.detail.pendingInteractions.length === 0
        && text.length > 0;

    return {
      id: input.scenario.id,
      prompt: input.scenario.prompt,
      route,
      status: passed ? "passed" : "failed",
      target: {
        providerType: target.providerType,
        channelId: target.channelId,
        modelId: target.modelId,
        protocolFamily: target.protocolFamily,
        apiStyle: target.apiStyle,
        ...(baseUrlHost ? { baseUrlHost } : {}),
      },
      assistantPreview: previewText(text),
      assistantHasCode: hasGoLikeContent(text),
      ...(reasoning ? { assistantReasoningPreview: previewText(reasoning, 240) } : {}),
      ...(errors ? { assistantErrorPreview: previewText(errors, 240) } : {}),
      toolCallCount: response.detail.toolCalls.length,
      toolNames: response.detail.toolCalls.map((item) => item.toolName),
      pendingInteractionCount: response.detail.pendingInteractions.length,
      pendingInteractionKinds: response.detail.pendingInteractions.map((item) => item.request.kind),
      runCount: response.detail.runs.length,
      runBoundaries,
      ...(planArtifact
        ? {
            planArtifactPreview: previewText(planArtifact, 800),
            planArtifactHasRequiredSections: planValidation.isComplete,
            planArtifactMissingSections: planValidation.missingSections,
          }
        : {}),
      messageSummaries,
      ...(passed ? {} : { error: "Scenario checks failed" }),
    };
  } catch (error) {
    return {
      id: input.scenario.id,
      prompt: input.scenario.prompt,
      route,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tempRoot = mkdtempSync(join(tmpdir(), "maomi-real-provider-chat-"));
  const outputDir = resolve(options.outputDir);
  const modelsStatePath = join(tempRoot, "providers-state.json");
  const modelsCatalogPath = join(appRoot, "data", "models.json");
  const workspaceRoot = join(tempRoot, "blank-workspaces");

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  const azure = loadAzureConfig(resolve(options.configPath));
  const configuration = new DesktopConfigurationService(createRuntimeContext({
    tempRoot,
    modelsStatePath,
    modelsCatalogPath,
  }));
  const database = new DesktopDatabaseService(configuration);
  const logger = new RuntimeLogsService(
    new RuntimeLogsStore(database.getConnection("runtimeLogs")),
  ).createLogger({
    source: "desktop",
    module: "desktop.real-provider-chat-check",
  });

  const { modelsService, selectedModelId } = await prepareModelsService({
    configuration,
    logger,
    azure,
  });
  const materializer = new DesktopAiExecutionProfileMaterializer(modelsService);
  const aiRuntime = new DesktopAiRuntimeService();
  const service = new DesktopConversationService(
    new DesktopConversationStore(database.getConnection("conversation")),
    logger,
    {
      conversationDbPath: database.getConnection("conversation").path,
      agents: {
        async list() {
          return {
            items: [],
            meta: {
              total: 0,
              limit: 0,
              offset: 0,
              hasMore: false,
            },
          };
        },
      },
      aiRuntime,
      materializer,
      turnNoActivityTimeoutMs: 180000,
    },
  );

  const scenarios = selectScenarios(options.promptSet);
  const results: ScenarioResult[] = [];

  try {
    for (const scenario of scenarios) {
      process.stdout.write(`Running scenario: ${scenario.id}\n`);
      results.push(await runScenario({
        scenario,
        service,
        modelsService,
        selectedModelId,
        workspaceRoot,
      }));
    }
  } finally {
    service.dispose();
    database.dispose();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    configPath: resolve(options.configPath),
    promptSet: options.promptSet,
    channelId,
    modelId: selectedModelId,
    providerType: "azure",
    results,
  };
  const reportPath = join(outputDir, `desktop-chat-real-provider-${options.promptSet}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  for (const result of results) {
    process.stdout.write(`${result.id}: ${result.status}\n`);
    if (result.error) {
      process.stdout.write(`  error: ${result.error}\n`);
      continue;
    }
    process.stdout.write(`  toolCalls=${result.toolCallCount ?? 0}, pendingInteractions=${result.pendingInteractionCount ?? 0}, hasCode=${result.assistantHasCode ? "yes" : "no"}\n`);
    if (typeof result.planArtifactHasRequiredSections === "boolean") {
      process.stdout.write(`  structuredPlan=${result.planArtifactHasRequiredSections ? "yes" : "no"}`);
      if (result.planArtifactMissingSections?.length) {
        process.stdout.write(` missing=${result.planArtifactMissingSections.join(",")}\n`);
      } else {
        process.stdout.write("\n");
      }
    }
  }
  process.stdout.write(`Report written to ${reportPath}\n`);

  cleanupTempRoot(tempRoot);

  if (results.some((item) => item.status !== "passed")) {
    process.exitCode = 1;
  }
}

await main();