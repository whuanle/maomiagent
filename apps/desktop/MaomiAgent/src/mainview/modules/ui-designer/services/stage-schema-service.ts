import { executeDesktopAiOneShot } from "../../../lib/desktop-ai";
import { getDesktopModelRuntimeSelectionSnapshot } from "../../../lib/desktop-models";
import { UI_DESIGNER_AGENT_ID } from "../../../../shared/conversation/managed-execution";
import type { UiDesignerInteractionField, UiDesignerInteractionSchema } from "./stage-schema-types";
import type { UiDesignerStageKey } from "./stage-view-model-resolver";

type UiDesignerStageAiContext = {
  workspaceId?: string;
  workspaceName?: string;
  workspaceDirectoryPath?: string;
  designPackagePath?: string;
  designRoot?: string;
  hasDesignSpec?: boolean;
  shouldSendKickoff?: boolean;
  lockReason?: string;
  readiness?: {
    ready?: boolean;
    missing?: string[];
  };
  focusBlock?: string;
  files: Array<{
    path: string;
    content: string;
  }>;
};

type RequestStageSchemaInput = {
  stageKey: UiDesignerStageKey;
  context: UiDesignerStageAiContext;
  selectedChannelId?: string;
  selectedModelId?: string;
};

type RequestStageResultInput = {
  stageKey: UiDesignerStageKey;
  values: Record<string, unknown>;
  context: UiDesignerStageAiContext;
  selectedChannelId?: string;
  selectedModelId?: string;
};

type StageSchemaFieldDraft = {
  key: string;
  label: string;
  kind: UiDesignerInteractionField["kind"];
  required: boolean;
  placeholder: string;
  defaultText: string;
  defaultBoolean: boolean;
  defaultValues: string[];
  options: Array<{
    label: string;
    value: string;
  }>;
};

type StageSchemaDraft = {
  stageKey: string;
  title: string;
  description: string;
  submitLabel: string;
  cancelLabel: string;
  allowSkip: boolean;
  fields: StageSchemaFieldDraft[];
};

type StageArtifactDraft = {
  key: string;
  format: "json" | "markdown";
  content: string;
};

type StageResultDraft = {
  stageKey: string;
  summary: string;
  detail: {
    notes: string;
    highlights: string[];
  };
  artifact: StageArtifactDraft;
  nextSuggestedStage: string;
};

const STAGE_TITLE_MAP: Record<UiDesignerStageKey, string> = {
  projectScope: "项目范围确认",
  stack: "技术栈确认",
  theme: "视觉与交互基线",
  patterns: "组件模式确认",
  layouts: "布局设计",
  pages: "页面与模块确认",
  spec: "设计规格整理",
};

const STAGE_GOAL_MAP: Record<UiDesignerStageKey, string> = {
  projectScope: "明确项目形态、业务类型、目标平台、当前目标与交付范围。",
  stack: "明确技术路线、运行平台、核心框架、UI 方案与工程约束。",
  theme: "明确风格方向、色彩倾向、界面密度、视觉关键词与交互原则。",
  patterns: "明确表单、筛选区、表格、弹窗与反馈状态等组件模式。",
  layouts: "明确导航结构、页面骨架、内容布局、详情策略与响应策略。",
  pages: "明确页面模板、核心模块、主任务流与页面关系。",
  spec: "整理设计规格书的章节覆盖、交付物与待补充内容。",
};

const STAGE_ARTIFACT_KEY_MAP: Record<UiDesignerStageKey, "scope" | "stack" | "theme" | "patterns" | "layouts" | "pages" | "spec"> = {
  projectScope: "scope",
  stack: "stack",
  theme: "theme",
  patterns: "patterns",
  layouts: "layouts",
  pages: "pages",
  spec: "spec",
};

const STAGE_ARTIFACT_FORMAT_MAP: Record<UiDesignerStageKey, "json" | "markdown"> = {
  projectScope: "json",
  stack: "json",
  theme: "json",
  patterns: "json",
  layouts: "json",
  pages: "json",
  spec: "markdown",
};

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readText(item)).filter(Boolean)
    : [];
}

function escapeJsonForPrompt(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function resolveUpstreamAiErrorMessage(rawMessage: unknown) {
  const message = readText(rawMessage);
  if (!message) {
    return "";
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("usage limit")
    || normalized.includes("quota")
    || normalized.includes("rate limit")
    || normalized.includes("exceeded")
    || normalized.includes("余额不足")
    || normalized.includes("额度")
    || normalized.includes("配额")
    || normalized.includes("超出限制")
  ) {
    return "当前模型额度已用尽，请切换可用模型或等待配额刷新。";
  }

  return "";
}

function extractJsonObject(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("AI 未返回可用内容。");
  }

  const upstreamErrorMessage = resolveUpstreamAiErrorMessage(normalized);
  if (upstreamErrorMessage) {
    throw new Error(upstreamErrorMessage);
  }

  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("AI 返回内容不是有效 JSON。");
    }

    return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function ensureStageKey(value: unknown, expectedStageKey: UiDesignerStageKey) {
  const normalized = readText(value);
  if (normalized && normalized !== expectedStageKey) {
    throw new Error(`AI 返回了不匹配的阶段标识：${normalized}`);
  }
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const label = readText((item as { label?: unknown })?.label);
    const optionValue = readText((item as { value?: unknown })?.value);
    return label && optionValue ? [{ label, value: optionValue }] : [];
  });
}

export function normalizeStageSchemaResponse(
  value: unknown,
  stageKey: UiDesignerStageKey,
): UiDesignerInteractionSchema {
  const parsed = value && typeof value === "object" ? value as StageSchemaDraft : {} as StageSchemaDraft;
  ensureStageKey(parsed.stageKey, stageKey);
  const title = readText(parsed.title) || STAGE_TITLE_MAP[stageKey];
  const description = readText(parsed.description);
  const submitLabel = readText(parsed.submitLabel) || "确认";
  const cancelLabel = readText(parsed.cancelLabel) || "取消";
  const fields: UiDesignerInteractionField[] = Array.isArray(parsed.fields) ? parsed.fields.reduce<UiDesignerInteractionField[]>((current, field) => {
    const key = readText(field.key);
    const label = readText(field.label);
    const kind = field.kind;
    if (!key || !label) {
      return current;
    }

    if (kind !== "text" && kind !== "textarea" && kind !== "singleSelect" && kind !== "multiSelect" && kind !== "boolean") {
      return current;
    }

    const options = normalizeOptions(field.options);
    if ((kind === "singleSelect" || kind === "multiSelect") && options.length === 0) {
      return current;
    }

    if (kind === "text" || kind === "textarea") {
      current.push({
        key,
        label,
        kind,
        required: field.required === true,
        placeholder: readText(field.placeholder) || undefined,
        defaultValue: readText(field.defaultText) || undefined,
      } satisfies UiDesignerInteractionField);
      return current;
    }

    if (kind === "singleSelect") {
      const defaultValue = readText(field.defaultText);
      current.push({
        key,
        label,
        kind,
        required: field.required === true,
        placeholder: readText(field.placeholder) || undefined,
        defaultValue: defaultValue || undefined,
        options,
      } satisfies UiDesignerInteractionField);
      return current;
    }

    if (kind === "multiSelect") {
      const defaultValue = readStringList(field.defaultValues);
      current.push({
        key,
        label,
        kind,
        required: field.required === true,
        placeholder: readText(field.placeholder) || undefined,
        defaultValue,
        options,
      } satisfies UiDesignerInteractionField);
      return current;
    }

    current.push({
      key,
      label,
      kind: "boolean",
      required: field.required === true,
      defaultValue: field.defaultBoolean === true,
    } satisfies UiDesignerInteractionField);
    return current;
  }, []) : [];

  if (fields.length === 0) {
    const upstreamErrorMessage = resolveUpstreamAiErrorMessage([
      parsed.title,
      parsed.description,
      parsed.submitLabel,
      parsed.cancelLabel,
    ].map((item) => readText(item)).filter(Boolean).join("\n"));
    if (upstreamErrorMessage) {
      throw new Error(upstreamErrorMessage);
    }

    throw new Error("AI 未返回可渲染的阶段表单。");
  }

  return {
    stageKey,
    title,
    ...(description ? { description } : {}),
    submitLabel,
    cancelLabel,
    allowSkip: parsed.allowSkip === true,
    fields,
  };
}

export function normalizeStageResultResponse(
  value: unknown,
  stageKey: UiDesignerStageKey,
) {
  const parsed = value && typeof value === "object" ? value as StageResultDraft : {} as StageResultDraft;
  ensureStageKey(parsed.stageKey, stageKey);

  const artifactKey = readText(parsed.artifact?.key) || STAGE_ARTIFACT_KEY_MAP[stageKey];
  const artifactFormat = parsed.artifact?.format === "markdown" ? "markdown" : "json";
  const artifactContent = readText(parsed.artifact?.content);
  const expectedArtifactKey = STAGE_ARTIFACT_KEY_MAP[stageKey];
  const expectedArtifactFormat = STAGE_ARTIFACT_FORMAT_MAP[stageKey];
  if (artifactKey !== expectedArtifactKey) {
    throw new Error(`AI 返回了错误的阶段产物类型：${artifactKey}`);
  }
  if (artifactFormat !== expectedArtifactFormat) {
    throw new Error(`AI 返回了错误的阶段产物格式：${artifactFormat}`);
  }
  if (!artifactContent) {
    throw new Error("AI 未返回阶段产物内容。");
  }

  const artifacts: Record<string, unknown> = {
    [artifactKey]: artifactFormat === "markdown"
      ? artifactContent
      : extractJsonObject(artifactContent),
  };

  const nextSuggestedStage = readText(parsed.nextSuggestedStage);
  return {
    stageKey,
    summary: readText(parsed.summary) || `${STAGE_TITLE_MAP[stageKey]}已更新`,
    detail: {
      notes: readText(parsed.detail?.notes),
      highlights: readStringList(parsed.detail?.highlights),
    },
    artifacts,
    ...(nextSuggestedStage ? { nextSuggestedStage } : {}),
  };
}

async function resolveModelSelection(input: {
  workspaceId: string;
  selectedChannelId?: string;
  selectedModelId?: string;
}) {
  const response = await getDesktopModelRuntimeSelectionSnapshot({
    scope: "workspace",
    workspaceId: input.workspaceId,
    ...(input.selectedChannelId ? { selectedChannelId: input.selectedChannelId } : {}),
    ...(input.selectedModelId ? { selectedModelId: input.selectedModelId } : {}),
  });
  const channelId = response.item.resolvedSelection.channelId ?? response.item.defaultSelection.channelId;
  const modelId = response.item.resolvedSelection.modelId ?? response.item.defaultSelection.modelId;

  if (!channelId || !modelId) {
    throw new Error("当前工作区还没有可用的 AI 模型，无法生成阶段表单。");
  }

  return {
    selectedChannelId: channelId,
    selectedModelId: modelId,
  };
}

function buildContextPrompt(context: UiDesignerStageAiContext) {
  const lines = [
    `工作区：${context.workspaceName || context.workspaceId}`,
    `目录：${context.workspaceDirectoryPath || "未设置"}`,
    `设计包：${context.designPackagePath || "未准备"}`,
    `设计根目录：${context.designRoot || "未准备"}`,
    `已有设计规格：${context.hasDesignSpec === true ? "是" : "否"}`,
    `是否应发送 kickoff：${context.shouldSendKickoff === true ? "是" : "否"}`,
    `锁定原因：${context.lockReason || "无"}`,
    `准备状态：${context.readiness?.ready === true ? "ready" : "not-ready"}`,
    `缺失项：${context.readiness?.missing?.length ? context.readiness.missing.join("、") : "无"}`,
    "",
    "当前设计文件：",
    ...context.files.flatMap((file) => [
      `### ${file.path}`,
      file.content.trim() || "(empty)",
      "",
    ]),
  ];

  return lines.join("\n");
}

function buildStageSchemaPrompt(stageKey: UiDesignerStageKey, context: UiDesignerStageAiContext) {
  return [
    `阶段：${STAGE_TITLE_MAP[stageKey]} (${stageKey})`,
    `阶段目标：${STAGE_GOAL_MAP[stageKey]}`,
    "",
    "请根据当前设计包，生成一个适合模态窗体填写的阶段表单。",
    "要求：",
    "1. 字段数量控制在 2 到 6 个之间，只问当前阶段真正缺失或不确定的信息。",
    "2. 优先使用简短字段标签，避免把技术路线默认写死成前端方案。",
    "3. 如果是桌面程序场景，允许出现 WPF、WinUI、Avalonia、Electron、Tauri、Qt 等选项。",
    "4. 当信息已经足够明确时，不要重复追问。",
    "5. singleSelect 或 multiSelect 必须提供 options。",
    "6. cancelLabel 通常返回“取消”，submitLabel 需贴合当前阶段。",
    "",
    buildContextPrompt(context),
  ].join("\n");
}

function buildStageResultPrompt(
  stageKey: UiDesignerStageKey,
  context: UiDesignerStageAiContext,
  values: Record<string, unknown>,
) {
  const artifactKey = STAGE_ARTIFACT_KEY_MAP[stageKey];
  const artifactFormat = STAGE_ARTIFACT_FORMAT_MAP[stageKey];
  return [
    `阶段：${STAGE_TITLE_MAP[stageKey]} (${stageKey})`,
    `阶段目标：${STAGE_GOAL_MAP[stageKey]}`,
    `当前阶段唯一允许更新的产物：${artifactKey} (${artifactFormat})`,
    "",
    "请根据当前设计包上下文和用户刚提交的表单值，生成当前阶段的最终结构化结论。",
    "要求：",
    "1. 只更新当前阶段产物，不要改动其他阶段。",
    artifactFormat === "json"
      ? "2. artifact.content 必须是可直接 JSON.parse 的对象 JSON 字符串。"
      : "2. artifact.content 必须是最终可保存的 Markdown 文本。",
    "3. summary 要简短，detail.notes 要解释本阶段结论，detail.highlights 用短句列重点。",
    "4. 如果用户填写的是桌面原生技术路线，不要强行输出 React / Ant Design。",
    "",
    "本次表单提交：",
    escapeJsonForPrompt(values),
    "",
    buildContextPrompt(context),
  ].join("\n");
}

function buildStageSchemaOutputMode() {
  return {
    kind: "json_schema" as const,
    schema: {
      type: "object",
      properties: {
        stageKey: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        submitLabel: { type: "string" },
        cancelLabel: { type: "string" },
        allowSkip: { type: "boolean" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              label: { type: "string" },
              kind: {
                type: "string",
                enum: ["text", "textarea", "singleSelect", "multiSelect", "boolean"],
              },
              required: { type: "boolean" },
              placeholder: { type: "string" },
              defaultText: { type: "string" },
              defaultBoolean: { type: "boolean" },
              defaultValues: {
                type: "array",
                items: { type: "string" },
              },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "string" },
                  },
                  required: ["label", "value"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "key",
              "label",
              "kind",
              "required",
              "placeholder",
              "defaultText",
              "defaultBoolean",
              "defaultValues",
              "options",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["stageKey", "title", "description", "submitLabel", "cancelLabel", "allowSkip", "fields"],
      additionalProperties: false,
    },
  };
}

function buildStageResultOutputMode(stageKey: UiDesignerStageKey) {
  return {
    kind: "json_schema" as const,
    schema: {
      type: "object",
      properties: {
        stageKey: { type: "string" },
        summary: { type: "string" },
        detail: {
          type: "object",
          properties: {
            notes: { type: "string" },
            highlights: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["notes", "highlights"],
          additionalProperties: false,
        },
        artifact: {
          type: "object",
          properties: {
            key: { type: "string", enum: [STAGE_ARTIFACT_KEY_MAP[stageKey]] },
            format: { type: "string", enum: [STAGE_ARTIFACT_FORMAT_MAP[stageKey]] },
            content: { type: "string" },
          },
          required: ["key", "format", "content"],
          additionalProperties: false,
        },
        nextSuggestedStage: {
          type: "string",
          enum: ["", "projectScope", "stack", "theme", "patterns", "layouts", "pages", "spec"],
        },
      },
      required: ["stageKey", "summary", "detail", "artifact", "nextSuggestedStage"],
      additionalProperties: false,
    },
  };
}

export async function requestStageSchema(input: RequestStageSchemaInput): Promise<UiDesignerInteractionSchema> {
  const workspaceId = readText(input.context.workspaceId);
  if (!workspaceId) {
    throw new Error("当前工作区不可用，无法生成阶段表单。");
  }
  const selection = await resolveModelSelection({
    workspaceId,
    selectedChannelId: input.selectedChannelId,
    selectedModelId: input.selectedModelId,
  });
  const response = await executeDesktopAiOneShot({
    scope: "workspace",
    workspaceId,
    selectedChannelId: selection.selectedChannelId,
    selectedModelId: selection.selectedModelId,
    agentId: UI_DESIGNER_AGENT_ID,
    outputMode: buildStageSchemaOutputMode(),
    messages: [{
      role: "user",
      content: buildStageSchemaPrompt(input.stageKey, input.context),
    }],
  });

  if (response.error) {
    throw new Error(resolveUpstreamAiErrorMessage(response.error.message) || response.error.message);
  }

  return normalizeStageSchemaResponse(extractJsonObject(response.content), input.stageKey);
}

export async function requestStageResult(input: RequestStageResultInput) {
  const workspaceId = readText(input.context.workspaceId);
  if (!workspaceId) {
    throw new Error("当前工作区不可用，无法生成阶段结果。");
  }
  const selection = await resolveModelSelection({
    workspaceId,
    selectedChannelId: input.selectedChannelId,
    selectedModelId: input.selectedModelId,
  });
  const response = await executeDesktopAiOneShot({
    scope: "workspace",
    workspaceId,
    selectedChannelId: selection.selectedChannelId,
    selectedModelId: selection.selectedModelId,
    agentId: UI_DESIGNER_AGENT_ID,
    outputMode: buildStageResultOutputMode(input.stageKey),
    messages: [{
      role: "user",
      content: buildStageResultPrompt(input.stageKey, input.context, input.values),
    }],
  });

  if (response.error) {
    throw new Error(resolveUpstreamAiErrorMessage(response.error.message) || response.error.message);
  }

  return normalizeStageResultResponse(extractJsonObject(response.content), input.stageKey);
}
