import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationInteractionEntry } from "#maomiagent/kernel/src/host/application";

import type {
  DesktopConversationAttachmentInput,
  DesktopConversationAttachmentKind,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
} from "../../../../shared/desktop-conversation";
import {
  UI_DESIGNER_AGENT_ID,
  UI_DESIGNER_CONTEXT_METADATA_KEY,
} from "../../../../shared/conversation/managed-execution";
import type { DesktopUiDesignerState } from "../../../../shared/desktop-ui-designer";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import {
  answerDesktopConversationInteraction,
  createDesktopConversationClient,
  DESKTOP_CONVERSATION_BRIDGE_READY_EVENT,
  DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT,
  DESKTOP_CONVERSATION_INVALIDATED_EVENT,
  DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
  hasDesktopConversationBridge,
  rejectDesktopConversationInteraction,
} from "../../../lib/desktop-conversation";
import {
  DESKTOP_MODELS_BRIDGE_READY_EVENT,
  getDesktopModelRuntimeSelectionSnapshot,
  hasDesktopModelsBridge,
} from "../../../lib/desktop-models";
import {
  DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT,
  getDesktopUiDesignerState,
  hasDesktopUiDesignerBridge,
  saveDesktopUiDesignerDesignPackage,
} from "../../../lib/desktop-ui-designer";
import {
  DESKTOP_WORKSPACE_BRIDGE_READY_EVENT,
  getDesktopWorkspaceFileContent,
  hasDesktopWorkspaceBridge,
} from "../../../lib/desktop-workspace";
import { getNormalWorkspaces } from "../../../services/workspace-query-service";
import {
  useConversationWorkspaceSettings,
  waitForConversationWorkspaceSettingsSaves,
} from "../../chat/components/conversation-workspace-settings-storage";
import {
  mergeDesktopConversationRuntimeEvents,
} from "../../chat/hooks/desktop-conversation-runtime-events";
import type {
  ChatComposerAttachment,
  ChatComposerModelOption,
  ChatComposerSelectOptionGroup,
} from "../../chat/types";
import {
  buildDesktopRuntimeModelOptionGroups,
  buildDesktopRuntimeModelOptions,
  resolveDesktopRuntimeSelectedValue,
} from "../../models/services/runtime-selection";
import type { UiDesignerInteractionSchema } from "../components/stage-dialog";
import { normalizeStageResult } from "../services/stage-result-normalizer";
import {
  requestStageResult,
  requestStageSchema,
} from "../services/stage-schema-service";
import { resolveStageViewModels } from "../services/stage-view-model-resolver";

type UiDesignerDesignFiles = {
  designSpecMarkdown: string;
  stackJson: string;
  scopeJson: string;
  themeJson: string;
  patternsJson: string;
  layoutsJson: string;
  pagesJson: string;
  sourcesMarkdown: string;
};

type UiDesignerContextFile = {
  path: string;
  content: string;
};

type UiDesignerContextPayload = {
  agentId: typeof UI_DESIGNER_AGENT_ID;
  surface: "ui-designer";
  workspaceId?: string;
  workspaceName?: string;
  workspaceDirectoryPath?: string;
  designPackagePath?: string;
  designRoot?: string;
  hasDesignSpec?: boolean;
  shouldSendKickoff?: boolean;
  lockReason?: string;
  readiness?: DesktopUiDesignerState["readiness"];
  preview?: DesktopUiDesignerState["preview"];
  focusBlock?: string;
  files: UiDesignerContextFile[];
};

type UseUiDesignerShellStateInput = {
  active: boolean;
};

const SESSION_DETAIL_SEND_POLL_INTERVAL_MS = 180;
const SESSION_DETAIL_FALLBACK_GRACE_MS = 450;
const SESSION_DETAIL_FALLBACK_SILENCE_WINDOW_MS = 600;
const UI_DESIGNER_SCOPE_BOOTSTRAP_INTERACTION_ID = "ui-designer-scope-bootstrap";
const UI_DESIGNER_STACK_BOOTSTRAP_INTERACTION_ID = "ui-designer-stack-bootstrap";
const UI_DESIGNER_THEME_BOOTSTRAP_INTERACTION_ID = "ui-designer-theme-bootstrap";
const UI_DESIGNER_PAGES_BOOTSTRAP_INTERACTION_ID = "ui-designer-pages-bootstrap";
const UI_DESIGNER_SPEC_BOOTSTRAP_INTERACTION_ID = "ui-designer-spec-bootstrap";

function compareWorkspaces(left: DesktopWorkspaceItem, right: DesktopWorkspaceItem) {
  if (left.isPinned !== right.isPinned) {
    return left.isPinned ? -1 : 1;
  }

  return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
}

function compareSessions(left: DesktopConversationSessionItem, right: DesktopConversationSessionItem) {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || left.sessionId.localeCompare(right.sessionId, "en", { sensitivity: "base" });
}

function resolveNextWorkspaceId(
  items: DesktopWorkspaceItem[],
  currentWorkspaceId: string | undefined,
) {
  if (items.length === 0) {
    return undefined;
  }

  if (currentWorkspaceId && items.some((item) => item.workspaceId === currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  return items[0]?.workspaceId;
}

function resolveNextSessionId(
  items: DesktopConversationSessionItem[],
  currentSessionId: string | undefined,
) {
  if (items.length === 0) {
    return undefined;
  }

  if (currentSessionId && items.some((item) => item.sessionId === currentSessionId)) {
    return currentSessionId;
  }

  return items[0]?.sessionId;
}

function resolveActiveSessionId(
  items: DesktopConversationSessionItem[],
  currentSessionId: string | undefined,
) {
  const activeItems = items.filter((item) => item.status !== "archived");
  return resolveNextSessionId(activeItems, currentSessionId);
}

function delay(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUiDesignerSession(item: DesktopConversationSessionItem) {
  const metadata = isRecord(item.metadata) ? item.metadata : undefined;
  return metadata?.surface === "ui-designer" || metadata?.moduleId === "ui-designer";
}

function hasConfirmedProjectScope(scope: Record<string, unknown>) {
  return typeof scope.projectType === "string"
    && scope.projectType.trim().length > 0
    && typeof scope.businessType === "string"
    && scope.businessType.trim().length > 0;
}

function hasConfirmedStack(stack: Record<string, unknown>) {
  return typeof stack.framework === "string"
    && stack.framework.trim().length > 0
    && typeof stack.uiLibrary === "string"
    && stack.uiLibrary.trim().length > 0;
}

function hasConfirmedTheme(theme: Record<string, unknown>) {
  return typeof theme.style === "string" && theme.style.trim().length > 0;
}

function hasConfirmedPages(pages: Record<string, unknown>) {
  return Array.isArray(pages.templates) && pages.templates.length > 0;
}

function resolveRecommendedStack(scope: Record<string, unknown>) {
  const projectType = typeof scope.projectType === "string" ? scope.projectType.trim() : "";
  const businessType = typeof scope.businessType === "string" ? scope.businessType.trim() : "";

  if (projectType === "桌面应用") {
    return {
      framework: "React",
      uiLibrary: "Ant Design",
      packageManager: "pnpm",
      buildTool: "Vite",
      responsive: false,
      target: "可直接开发",
    };
  }

  if (projectType === "简单原型") {
    return {
      framework: "React",
      uiLibrary: "Ant Design",
      packageManager: "pnpm",
      buildTool: "Vite",
      responsive: true,
      target: "原型优先",
    };
  }

  if (businessType === "商城") {
    return {
      framework: "Next.js",
      uiLibrary: "Ant Design",
      packageManager: "pnpm",
      buildTool: "Next.js",
      responsive: true,
      target: "可直接开发",
    };
  }

  if (businessType === "后台系统") {
    return {
      framework: "React",
      uiLibrary: "Ant Design",
      packageManager: "pnpm",
      buildTool: "Vite",
      responsive: true,
      target: "可直接开发",
    };
  }

  return {
    framework: "React",
    uiLibrary: "Ant Design",
    packageManager: "pnpm",
    buildTool: "Vite",
    responsive: true,
    target: "可直接开发",
  };
}

function hasMeaningfulDesignSpec(markdown: string) {
  const normalized = markdown.trim();
  if (!normalized) {
    return false;
  }

  return normalized.includes("## 项目范围")
    || normalized.includes("项目类型：")
    || normalized.includes("页面模板：");
}

function buildUiDesignerSourcesMarkdown(input: {
  referenceLinks: string[];
  deliverables: string[];
  notes: string | null;
}) {
  const lines = [
    "# References",
    "",
    "## 参考链接",
    ...(input.referenceLinks.length > 0
      ? input.referenceLinks.map((item) => `- ${item}`)
      : ["- 待补充"]),
    "",
    "## 交付清单",
    ...(input.deliverables.length > 0
      ? input.deliverables.map((item) => `- ${item}`)
      : ["- 设计规格书"]),
  ];

  if (input.notes) {
    lines.push("", "## 备注", input.notes);
  }

  return `${lines.join("\n")}\n`;
}

function buildUiDesignerDesignSpecMarkdown(input: {
  scope: Record<string, unknown>;
  stack: Record<string, unknown>;
  theme: Record<string, unknown>;
  pages: Record<string, unknown>;
  referenceLinks: string[];
  deliverables: string[];
  notes: string | null;
}) {
  const pageTemplates = Array.isArray(input.pages.templates)
    ? input.pages.templates.map((item) => String(item)).filter(Boolean)
    : [];
  const pageModules = Array.isArray(input.pages.modules)
    ? input.pages.modules.map((item) => String(item)).filter(Boolean)
    : [];

  const lines = [
    "# UI Design Spec",
    "",
    "## 项目范围",
    `- 项目类型：${normalizeNonEmptyString(input.scope.projectType) ?? "待补充"}`,
    `- 业务类型：${normalizeNonEmptyString(input.scope.businessType) ?? "待补充"}`,
    "",
    "## 技术栈",
    `- framework: ${normalizeNonEmptyString(input.stack.framework) ?? "待补充"}`,
    `- uiLibrary: ${normalizeNonEmptyString(input.stack.uiLibrary) ?? "待补充"}`,
    `- packageManager: ${normalizeNonEmptyString(input.stack.packageManager) ?? "待补充"}`,
    `- buildTool: ${normalizeNonEmptyString(input.stack.buildTool) ?? "待补充"}`,
    `- target: ${normalizeNonEmptyString(input.stack.target) ?? "待补充"}`,
    `- responsive: ${input.stack.responsive === true ? "需要" : input.stack.responsive === false ? "不需要" : "待补充"}`,
    "",
    "## 视觉与交互基线",
    `- style: ${normalizeNonEmptyString(input.theme.style) ?? "待补充"}`,
    `- colorTendency: ${normalizeNonEmptyString(input.theme.colorTendency) ?? "待补充"}`,
    `- density: ${normalizeNonEmptyString(input.theme.density) ?? "待补充"}`,
    "",
    "## 页面与模块",
    `- 页面模板：${pageTemplates.length > 0 ? pageTemplates.join("、") : "待补充"}`,
    `- 业务模块：${pageModules.length > 0 ? pageModules.join("、") : "待补充"}`,
    "",
    "## 交付范围",
    ...(input.deliverables.length > 0
      ? input.deliverables.map((item) => `- ${item}`)
      : ["- 设计规格书"]),
    "",
    "## 参考资料",
    ...(input.referenceLinks.length > 0
      ? input.referenceLinks.map((item) => `- ${item}`)
      : ["- 待补充"]),
  ];

  if (input.notes) {
    lines.push("", "## 备注", input.notes);
  }

  return `${lines.join("\n")}\n`;
}

function buildSessionSummaryFromDetail(
  detail: DesktopConversationSessionDetail,
  current?: DesktopConversationSessionItem,
): DesktopConversationSessionItem {
  return {
    sessionId: detail.sessionId,
    workspaceId: detail.workspaceId,
    title: detail.title,
    status: detail.status,
    parentSessionId: detail.parentSessionId,
    archivedAt: detail.archivedAt,
    lastRunId: detail.runs.at(-1)?.id ?? current?.lastRunId ?? detail.lastRunId,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    metadata: detail.metadata ? { ...detail.metadata } : undefined,
  };
}

function parseJsonObject(text: string) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeNonEmptyString(entry))
    .filter((entry): entry is string => entry !== null);
}

function readQuestionAnswerValues(response: unknown, questionId: string) {
  const answers = isRecord(response) && Array.isArray(response.answers)
    ? response.answers as Array<{ questionId?: unknown; values?: unknown }>
    : [];
  const matched = answers.find((item) => item.questionId === questionId);
  return readStringArray(matched?.values);
}

function readFirstQuestionAnswerValue(response: unknown, questionId: string) {
  return readQuestionAnswerValues(response, questionId)[0];
}

const DEFAULT_DESIGN_FILES: UiDesignerDesignFiles = {
  designSpecMarkdown: "",
  stackJson: "{}",
  scopeJson: "{}",
  themeJson: "{}",
  patternsJson: "{}",
  layoutsJson: "{}",
  pagesJson: "{}",
  sourcesMarkdown: "",
};

const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const UI_DESIGNER_DESIGN_FILE_PATHS = {
  designSpecMarkdown: "design/design-spec.md",
  stackJson: "design/stack.json",
  scopeJson: "design/scope.json",
  themeJson: "design/theme.json",
  patternsJson: "design/patterns.json",
  layoutsJson: "design/layouts.json",
  pagesJson: "design/pages.json",
  sourcesMarkdown: "design/sources.md",
} as const;

const UI_DESIGNER_CONTEXT_FILE_CHAR_LIMIT = 5000;

const UI_DESIGNER_CONTEXT_FILE_LABELS: Record<keyof UiDesignerDesignFiles, string> = {
  designSpecMarkdown: UI_DESIGNER_DESIGN_FILE_PATHS.designSpecMarkdown,
  stackJson: UI_DESIGNER_DESIGN_FILE_PATHS.stackJson,
  scopeJson: UI_DESIGNER_DESIGN_FILE_PATHS.scopeJson,
  themeJson: UI_DESIGNER_DESIGN_FILE_PATHS.themeJson,
  patternsJson: UI_DESIGNER_DESIGN_FILE_PATHS.patternsJson,
  layoutsJson: UI_DESIGNER_DESIGN_FILE_PATHS.layoutsJson,
  pagesJson: UI_DESIGNER_DESIGN_FILE_PATHS.pagesJson,
  sourcesMarkdown: UI_DESIGNER_DESIGN_FILE_PATHS.sourcesMarkdown,
};

const REDESIGN_PROMPTS: Record<string, string> = {
  projectScope: "请先重新确认项目范围。先确认项目类型，再确认业务类型；优先给出可选项，并允许用户补充一句说明。",
  stack: "请基于当前设计包重新整理技术栈方案，只更新技术栈结论，保持生成范围、主题、组件模式、布局和页面模板稳定。请明确前端框架、UI 组件库、构建工具和相关依赖。",
  scope: "请基于当前设计包重新确认生成范围清单，只更新范围结论，保持技术栈、主题、组件模式、布局和页面模板稳定。请只保留当前真正需要的部分。",
  theme: "请基于当前设计包重新整理视觉与交互基线，只更新风格方向、色彩倾向、密度和主要视觉结论，保持技术栈、生成范围、组件模式、布局和页面模板稳定。",
  patterns: "请基于当前设计包重新设计局部组件与组件模式，只更新组件模式结论，保持技术栈、生成范围、主题、布局和页面模板稳定。请覆盖表单、筛选栏、表格、弹窗和抽屉。",
  layouts: "请基于当前设计包重新设计整体布局与局部布局，只更新布局结论，保持技术栈、生成范围、主题、组件模式和页面模板稳定。请说明导航、侧边栏和页面容器策略。",
  pages: "请基于当前设计包重新确认页面模板和业务模块，优先使用勾选清单加补充说明的方式，只更新页面与模块结论，保持技术栈、生成范围、主题、组件模式和布局稳定。",
  sources: "请基于当前设计包补充资料来源，只更新资料与参考信息，保持技术栈、生成范围、主题、组件模式、布局和页面模板稳定。请列出需要保留的参考链接、组件库文档和 starter 仓库信息。",
  i18n: "请基于当前设计包重新确认多语言方案，只更新多语言结论，保持其他设计结论稳定。请明确默认语言、资源组织和界面文案规范。",
  spec: "请基于当前设计包重新整理设计规格书，只修正规格书表达，保持已经确认的技术栈、主题、组件模式、布局和页面模板结论稳定。",
};

function buildUiDesignerSessionMetadata() {
  return {
    surface: "ui-designer",
    moduleId: "ui-designer",
    conversationSettings: {
      managedExecutionEnabled: false,
      thinkingEnabled: false,
    },
  } satisfies Record<string, unknown>;
}

function buildUiDesignerSendMetadata(context?: UiDesignerContextPayload) {
  return {
    conversationSettings: {
      thinkingEnabled: false,
    },
    ...(context ? { [UI_DESIGNER_CONTEXT_METADATA_KEY]: context } : {}),
  } satisfies Record<string, unknown>;
}

function buildComposerAttachmentInputs(attachments: ChatComposerAttachment[]): DesktopConversationAttachmentInput[] {
  return attachments.map((attachment) => ({
    attachmentId: attachment.id,
    kind: attachment.kind,
    fileName: attachment.name,
    dataBase64: attachment.dataBase64,
    ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    ...(typeof attachment.sizeBytes === "number" ? { sizeBytes: attachment.sizeBytes } : {}),
  }));
}

function truncateUiDesignerContextText(value: string) {
  const normalized = value.trim();
  if (normalized.length <= UI_DESIGNER_CONTEXT_FILE_CHAR_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, UI_DESIGNER_CONTEXT_FILE_CHAR_LIMIT)}\n...[truncated]`;
}

function buildUiDesignerContext(input: {
  workspaceId?: string;
  selectedWorkspace?: DesktopWorkspaceItem;
  designerState: DesktopUiDesignerState | null;
  designFiles: UiDesignerDesignFiles;
  focusBlock?: string;
}): UiDesignerContextPayload {
  const files = Object.entries(UI_DESIGNER_CONTEXT_FILE_LABELS).flatMap(([key, path]) => {
    const content = truncateUiDesignerContextText(input.designFiles[key as keyof UiDesignerDesignFiles] ?? "");
    return content ? [{ path, content }] : [];
  });

  return {
    agentId: UI_DESIGNER_AGENT_ID,
    surface: "ui-designer",
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...(input.selectedWorkspace?.name ? { workspaceName: input.selectedWorkspace.name } : {}),
    ...(input.selectedWorkspace?.directoryPath ? { workspaceDirectoryPath: input.selectedWorkspace.directoryPath } : {}),
    ...(input.designerState?.designPackagePath ? { designPackagePath: input.designerState.designPackagePath } : {}),
    ...(input.designerState?.designRoot ? { designRoot: input.designerState.designRoot } : {}),
    ...(input.designerState ? { hasDesignSpec: input.designerState.hasDesignSpec } : {}),
    ...(input.designerState ? { shouldSendKickoff: input.designerState.shouldSendKickoff } : {}),
    ...(input.designerState?.lockReason ? { lockReason: input.designerState.lockReason } : {}),
    ...(input.designerState?.readiness ? { readiness: input.designerState.readiness } : {}),
    ...(input.designerState?.preview ? { preview: input.designerState.preview } : {}),
    ...(input.focusBlock ? { focusBlock: input.focusBlock } : {}),
    files,
  };
}

function resolveResetKickoffPrompt(state: DesktopUiDesignerState | null) {
  const normalized = state?.kickoffPrompt?.trim();
  if (normalized) {
    return normalized;
  }

  return "继续基于当前设计包工作，请从未完成阶段继续推进。";
}

function resolveComposerAttachmentExtension(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return normalizedName.match(/\.([^.]+)$/)?.[1] ?? "";
}

function resolveComposerAttachmentName(file: File) {
  const normalizedName = file.name.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType.startsWith("image/")) {
    const subtype = normalizedType.slice("image/".length).split(/[+;]/, 1)[0] || "png";
    return `image.${subtype}`;
  }

  if (normalizedType) {
    const subtype = normalizedType.split("/", 2)[1]?.split(/[+;]/, 1)[0] ?? "bin";
    return `attachment.${subtype}`;
  }

  return "attachment";
}

function buildComposerAttachmentId(file: File, resolvedName: string) {
  return `${resolvedName}:${file.size}:${file.lastModified}`;
}

function canPreviewComposerAttachment(file: File, resolvedName: string) {
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType.startsWith("image/")) {
    return true;
  }

  return IMAGE_ATTACHMENT_EXTENSIONS.has(resolveComposerAttachmentExtension(resolvedName));
}

function createComposerAttachmentPreviewUrl(file: File, resolvedName: string) {
  if (!canPreviewComposerAttachment(file, resolvedName)) {
    return undefined;
  }

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return undefined;
  }

  try {
    return URL.createObjectURL(file);
  } catch {
    return undefined;
  }
}

function resolveComposerAttachmentKind(
  file: Pick<File, "type">,
  resolvedName: string,
): DesktopConversationAttachmentKind {
  const normalizedType = file.type.trim().toLowerCase();
  if (normalizedType.startsWith("image/")) {
    return "image";
  }

  if (normalizedType.startsWith("audio/")) {
    return "audio";
  }

  if (normalizedType.startsWith("video/")) {
    return "video";
  }

  return IMAGE_ATTACHMENT_EXTENSIONS.has(resolveComposerAttachmentExtension(resolvedName))
    ? "image"
    : "file";
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable in the current runtime."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error(`Failed to read attachment: ${file.name || "attachment"}`));
    };
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Unexpected attachment payload for ${file.name || "attachment"}`));
        return;
      }

      const separatorIndex = reader.result.indexOf(",");
      resolve(separatorIndex >= 0 ? reader.result.slice(separatorIndex + 1) : reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function revokeComposerAttachmentPreviewUrl(attachment: Pick<ChatComposerAttachment, "previewUrl"> | undefined) {
  const previewUrl = attachment?.previewUrl?.trim();
  if (!previewUrl || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
    return;
  }

  URL.revokeObjectURL(previewUrl);
}

async function normalizeComposerAttachment(file: File): Promise<ChatComposerAttachment> {
  const resolvedName = resolveComposerAttachmentName(file);
  const previewUrl = createComposerAttachmentPreviewUrl(file, resolvedName);

  try {
    const dataBase64 = await readFileAsBase64(file);
    return {
      id: buildComposerAttachmentId(file, resolvedName),
      kind: resolveComposerAttachmentKind(file, resolvedName),
      name: resolvedName,
      dataBase64,
      ...(typeof file.size === "number" && Number.isFinite(file.size) ? { sizeBytes: Math.max(0, file.size) } : {}),
      ...(file.type ? { mimeType: file.type } : {}),
      ...(previewUrl ? { previewUrl } : {}),
    };
  } catch (error) {
    if (previewUrl) {
      revokeComposerAttachmentPreviewUrl({ previewUrl });
    }
    throw error;
  }
}

export function useUiDesignerShellState(input: UseUiDesignerShellStateInput) {
  const { active } = input;
  const conversationClient = useMemo(() => createDesktopConversationClient({
    createSession: {
      selectedAgentId: UI_DESIGNER_AGENT_ID,
      metadata: buildUiDesignerSessionMetadata(),
    },
    sendMessage: {
      selectedAgentId: UI_DESIGNER_AGENT_ID,
      metadata: buildUiDesignerSendMetadata(),
    },
  }), []);
  const [bridgeAvailable, setBridgeAvailable] = useState(
    () => hasDesktopWorkspaceBridge()
      && hasDesktopConversationBridge()
      && hasDesktopUiDesignerBridge(),
  );
  const [modelsBridgeAvailable, setModelsBridgeAvailable] = useState(
    () => hasDesktopModelsBridge(),
  );
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingDesignerState, setLoadingDesignerState] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [resettingConversation, setResettingConversation] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [replyingInteractionId, setReplyingInteractionId] = useState<string | null>(null);
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<DesktopWorkspaceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [designerState, setDesignerState] = useState<DesktopUiDesignerState | null>(null);
  const [sessions, setSessions] = useState<DesktopConversationSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<DesktopConversationSessionDetail | null>(null);
  const [designFiles, setDesignFiles] = useState<UiDesignerDesignFiles>(DEFAULT_DESIGN_FILES);
  const [previewMode, setPreviewMode] = useState<"preview-app" | "generated-app">("preview-app");
  const [draftMessage, setDraftMessage] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ChatComposerAttachment[]>([]);
  const composerAttachmentsRef = useRef<ChatComposerAttachment[]>([]);
  const runtimeEventActivityBySessionIdRef = useRef<Record<string, number>>({});
  const stoppingSessionIdRef = useRef<string | null>(null);
  const selectedSessionIdRef = useRef<string | undefined>(undefined);
  const selectedSessionDetailRef = useRef<DesktopConversationSessionDetail | null>(null);
  const [composerModelOptions, setComposerModelOptions] = useState<ChatComposerModelOption[]>([]);
  const [composerModelSelectOptions, setComposerModelSelectOptions] = useState<ChatComposerSelectOptionGroup[]>([]);
  const [selectedComposerModelValue, setSelectedComposerModelValueState] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stageDialogState, setStageDialogState] = useState<{
    stageKey: string | null;
    schema: UiDesignerInteractionSchema | null;
    submitting: boolean;
  }>({
    stageKey: null,
    schema: null,
    submitting: false,
  });

  const selectedWorkspace = useMemo(
    () => workspaces.find((item) => item.workspaceId === workspaceId),
    [workspaceId, workspaces],
  );
  const selectedSession = useMemo(
    () => sessions.find((item) => item.sessionId === selectedSessionId),
    [selectedSessionId, sessions],
  );
  const {
    settings: workspaceSettings,
    saveSettings: saveWorkspaceSettings,
  } = useConversationWorkspaceSettings(workspaceId);

  const stack = useMemo(() => parseJsonObject(designFiles.stackJson), [designFiles.stackJson]);
  const scope = useMemo(() => parseJsonObject(designFiles.scopeJson), [designFiles.scopeJson]);
  const theme = useMemo(() => parseJsonObject(designFiles.themeJson), [designFiles.themeJson]);
  const patterns = useMemo(() => parseJsonObject(designFiles.patternsJson), [designFiles.patternsJson]);
  const layouts = useMemo(() => parseJsonObject(designFiles.layoutsJson), [designFiles.layoutsJson]);
  const pages = useMemo(() => parseJsonObject(designFiles.pagesJson), [designFiles.pagesJson]);
  const sourcesMarkdown = designFiles.sourcesMarkdown;
  const stageViewModels = useMemo(() => resolveStageViewModels({
    scope,
    stack,
    theme,
    patterns,
    layouts,
    pages,
    designSpecMarkdown: designFiles.designSpecMarkdown,
    sourcesMarkdown,
  }), [
    designFiles.designSpecMarkdown,
    layouts,
    pages,
    patterns,
    scope,
    sourcesMarkdown,
    stack,
    theme,
  ]);
  const bootstrapMessageCount = selectedSessionDetail?.messages.length ?? 0;
  const bootstrapPendingCount = selectedSessionDetail?.pendingInteractions.length ?? 0;
  const scopeBootstrapInteraction = useMemo<ConversationInteractionEntry | null>(() => {
    if (!selectedSessionId || hasConfirmedProjectScope(scope)) {
      return null;
    }

    if (bootstrapMessageCount > 0 || bootstrapPendingCount > 0) {
      return null;
    }

    const now = Date.now();
    return {
      interactionId: UI_DESIGNER_SCOPE_BOOTSTRAP_INTERACTION_ID,
      sessionId: selectedSessionId,
      runId: "bootstrap",
      kind: "question",
      status: "pending",
      request: {
        kind: "question",
        title: "先确认项目范围",
        description: "先确认项目类型和业务类型，再继续技术栈确认。",
        items: [
          {
            id: "project_type",
            header: "项目类型",
            question: "这次先做什么形态？",
            allowCustom: true,
            options: [
              { value: "桌面应用", label: "桌面应用", description: "适合桌面端原生工作台" },
              { value: "Web 应用", label: "Web 应用", description: "适合浏览器访问或管理后台" },
              { value: "小程序", label: "小程序", description: "适合微信或轻量触达场景" },
              { value: "移动端", label: "移动端", description: "适合 App 或 H5 移动体验" },
              { value: "简单原型", label: "简单原型", description: "先出结构和页面，不急着落地开发" },
            ],
          },
          {
            id: "business_type",
            header: "业务类型",
            question: "这次主要是什么系统？",
            allowCustom: true,
            options: [
              { value: "后台系统", label: "后台系统", description: "偏管理、配置、列表和表单操作" },
              { value: "商城", label: "商城", description: "偏商品、订单、营销和交易链路" },
              { value: "官网", label: "官网", description: "偏品牌展示、介绍和转化入口" },
              { value: "内容平台", label: "内容平台", description: "偏信息流、内容发布和检索" },
              { value: "工具产品", label: "工具产品", description: "偏效率工具和任务流程" },
            ],
          },
        ],
        confirmLabel: "确认范围",
        rejectLabel: "稍后再说",
        metadata: {
          toolName: "ui_designer_scope_bootstrap",
        },
      },
      createdAt: now,
      updatedAt: now,
      metadata: {
        surface: "ui-designer",
        localInteraction: true,
      },
    } as ConversationInteractionEntry;
  }, [bootstrapMessageCount, bootstrapPendingCount, scope, selectedSessionId]);
  const stackBootstrapInteraction = useMemo<ConversationInteractionEntry | null>(() => {
    if (!selectedSessionId || !hasConfirmedProjectScope(scope) || hasConfirmedStack(stack)) {
      return null;
    }

    if (bootstrapMessageCount > 0 || bootstrapPendingCount > 0) {
      return null;
    }

    const recommended = resolveRecommendedStack(scope);
    const now = Date.now();
    return {
      interactionId: UI_DESIGNER_STACK_BOOTSTRAP_INTERACTION_ID,
      sessionId: selectedSessionId,
      runId: "bootstrap",
      kind: "form",
      status: "pending",
      request: {
        kind: "form",
        title: "继续确认技术栈",
        description: "基于刚确认的项目范围，先把技术栈定住。可以直接采用推荐项，也可以改成你熟悉的方案。",
        submitLabel: "确认技术栈",
        rejectLabel: "稍后再说",
        fields: [
          {
            key: "framework",
            label: "前端框架",
            kind: "select",
            required: true,
            value: recommended.framework,
            options: [
              { value: "React", label: "React" },
              { value: "Vue", label: "Vue" },
              { value: "Next.js", label: "Next.js" },
              { value: "Electron + React", label: "Electron + React" },
            ],
          },
          {
            key: "uiLibrary",
            label: "UI 组件库",
            kind: "select",
            required: true,
            value: recommended.uiLibrary,
            options: [
              { value: "Ant Design", label: "Ant Design" },
              { value: "Element Plus", label: "Element Plus" },
              { value: "Naive UI", label: "Naive UI" },
              { value: "MUI", label: "MUI" },
            ],
          },
          {
            key: "packageManager",
            label: "包管理器",
            kind: "select",
            required: true,
            value: recommended.packageManager,
            options: [
              { value: "pnpm", label: "pnpm" },
              { value: "npm", label: "npm" },
              { value: "yarn", label: "yarn" },
            ],
          },
          {
            key: "target",
            label: "当前目标",
            kind: "select",
            required: true,
            value: recommended.target,
            options: [
              { value: "原型优先", label: "原型优先" },
              { value: "可直接开发", label: "可直接开发" },
            ],
          },
          {
            key: "responsive",
            label: "需要响应式适配",
            kind: "boolean",
            required: true,
            value: recommended.responsive,
            trueLabel: "需要",
            falseLabel: "不需要",
          },
        ],
        metadata: {
          toolName: "ui_designer_stack_bootstrap",
        },
      },
      createdAt: now,
      updatedAt: now,
      metadata: {
        surface: "ui-designer",
        localInteraction: true,
      },
    } as ConversationInteractionEntry;
  }, [
    bootstrapMessageCount,
    bootstrapPendingCount,
    scope,
    selectedSessionId,
    stack,
  ]);
  const themeBootstrapInteraction = useMemo<ConversationInteractionEntry | null>(() => {
    if (
      !selectedSessionId
      || !hasConfirmedProjectScope(scope)
      || !hasConfirmedStack(stack)
      || hasConfirmedTheme(theme)
    ) {
      return null;
    }

    if (bootstrapMessageCount > 0 || bootstrapPendingCount > 0) {
      return null;
    }

    const now = Date.now();
    return {
      interactionId: UI_DESIGNER_THEME_BOOTSTRAP_INTERACTION_ID,
      sessionId: selectedSessionId,
      runId: "bootstrap",
      kind: "question",
      status: "pending",
      request: {
        kind: "question",
        title: "继续确认视觉与交互基线",
        description: "先收敛整体风格方向、色彩倾向和界面密度，再继续页面与模块确认。",
        items: [
          {
            id: "style",
            header: "风格方向",
            question: "整体更偏哪种感觉？",
            allowCustom: true,
            options: [
              { value: "专业稳重", label: "专业稳重", description: "适合后台系统和企业场景" },
              { value: "轻盈现代", label: "轻盈现代", description: "适合工具和效率产品" },
              { value: "电商导向", label: "电商导向", description: "适合商城和营销导向页面" },
              { value: "极简原型", label: "极简原型", description: "适合先快速确认信息结构" },
            ],
          },
          {
            id: "color_tendency",
            header: "色彩倾向",
            question: "色彩先怎么定？",
            allowCustom: true,
            options: [
              { value: "浅色中性", label: "浅色中性", description: "白底、浅灰、克制强调色" },
              { value: "品牌主色", label: "品牌主色", description: "围绕主品牌色构建设计系统" },
              { value: "高对比强调", label: "高对比强调", description: "更突出操作和视觉节奏" },
            ],
          },
          {
            id: "density",
            header: "界面密度",
            question: "界面信息密度偏哪种？",
            options: [
              { value: "信息密集", label: "信息密集", description: "适合后台、表格、配置场景" },
              { value: "平衡", label: "平衡", description: "兼顾效率和易读性" },
              { value: "留白更多", label: "留白更多", description: "更适合展示和引导型页面" },
            ],
          },
        ],
        confirmLabel: "确认风格基线",
        rejectLabel: "稍后再说",
        metadata: {
          toolName: "ui_designer_theme_bootstrap",
        },
      },
      createdAt: now,
      updatedAt: now,
      metadata: {
        surface: "ui-designer",
        localInteraction: true,
      },
    } as ConversationInteractionEntry;
  }, [
    bootstrapMessageCount,
    bootstrapPendingCount,
    scope,
    selectedSessionId,
    stack,
    theme,
  ]);
  const pagesBootstrapInteraction = useMemo<ConversationInteractionEntry | null>(() => {
    if (
      !selectedSessionId
      || !hasConfirmedProjectScope(scope)
      || !hasConfirmedStack(stack)
      || !hasConfirmedTheme(theme)
      || hasConfirmedPages(pages)
    ) {
      return null;
    }

    if (bootstrapMessageCount > 0 || bootstrapPendingCount > 0) {
      return null;
    }

    const businessType = typeof scope.businessType === "string" ? scope.businessType.trim() : "";
    const templateDefaults = businessType === "后台系统"
      ? ["登录页", "列表页", "详情页", "设置页"]
      : businessType === "商城"
        ? ["首页", "商品列表页", "商品详情页", "订单页"]
        : ["登录页", "列表页", "详情页"];
    const moduleDefaults = businessType === "后台系统"
      ? ["用户", "权限", "数据报表"]
      : businessType === "商城"
        ? ["商品", "订单", "营销"]
        : ["内容", "账户"];
    const now = Date.now();

    return {
      interactionId: UI_DESIGNER_PAGES_BOOTSTRAP_INTERACTION_ID,
      sessionId: selectedSessionId,
      runId: "bootstrap",
      kind: "form",
      status: "pending",
      request: {
        kind: "form",
        title: "继续确认页面模板与业务模块",
        description: "把要产出的页面模板和核心业务模块先勾出来，后面规格书和页面生成都会基于这份清单。",
        submitLabel: "确认页面与模块",
        rejectLabel: "稍后再说",
        fields: [
          {
            key: "templates",
            label: "页面模板",
            kind: "multiselect",
            required: true,
            allowCustom: true,
            value: templateDefaults,
            options: [
              { value: "登录页", label: "登录页" },
              { value: "首页", label: "首页" },
              { value: "列表页", label: "列表页" },
              { value: "详情页", label: "详情页" },
              { value: "编辑页", label: "编辑页" },
              { value: "设置页", label: "设置页" },
              { value: "商品列表页", label: "商品列表页" },
              { value: "商品详情页", label: "商品详情页" },
              { value: "订单页", label: "订单页" },
            ],
          },
          {
            key: "modules",
            label: "业务模块",
            kind: "multiselect",
            required: true,
            allowCustom: true,
            value: moduleDefaults,
            options: [
              { value: "用户", label: "用户" },
              { value: "权限", label: "权限" },
              { value: "商品", label: "商品" },
              { value: "订单", label: "订单" },
              { value: "营销", label: "营销" },
              { value: "内容", label: "内容" },
              { value: "数据报表", label: "数据报表" },
              { value: "账户", label: "账户" },
            ],
          },
        ],
        metadata: {
          toolName: "ui_designer_pages_bootstrap",
        },
      },
      createdAt: now,
      updatedAt: now,
      metadata: {
        surface: "ui-designer",
        localInteraction: true,
      },
    } as ConversationInteractionEntry;
  }, [
    bootstrapMessageCount,
    bootstrapPendingCount,
    pages,
    scope,
    selectedSessionId,
    stack,
    theme,
  ]);
  const specBootstrapInteraction = useMemo<ConversationInteractionEntry | null>(() => {
    if (
      !selectedSessionId
      || !hasConfirmedProjectScope(scope)
      || !hasConfirmedStack(stack)
      || !hasConfirmedTheme(theme)
      || !hasConfirmedPages(pages)
      || hasMeaningfulDesignSpec(designFiles.designSpecMarkdown)
    ) {
      return null;
    }

    if (bootstrapMessageCount > 0 || bootstrapPendingCount > 0) {
      return null;
    }

    const now = Date.now();
    return {
      interactionId: UI_DESIGNER_SPEC_BOOTSTRAP_INTERACTION_ID,
      sessionId: selectedSessionId,
      runId: "bootstrap",
      kind: "form",
      status: "pending",
      request: {
        kind: "form",
        title: "继续整理设计规格与参考资料",
        description: "把参考资料链接和这轮要交付的内容先整理好，我会据此补全设计规格书。",
        submitLabel: "确认并整理规格",
        rejectLabel: "稍后再说",
        fields: [
          {
            key: "referenceLinks",
            label: "参考资料链接",
            kind: "textarea",
            required: true,
            placeholder: "每行一个链接，例如：https://ant.design",
            value: "",
          },
          {
            key: "deliverables",
            label: "本轮交付内容",
            kind: "multiselect",
            required: true,
            value: ["设计规格书", "参考资料清单"],
            options: [
              { value: "设计规格书", label: "设计规格书" },
              { value: "参考资料清单", label: "参考资料清单" },
              { value: "页面模板清单", label: "页面模板清单" },
              { value: "视觉基线说明", label: "视觉基线说明" },
            ],
          },
          {
            key: "notes",
            label: "补充说明",
            kind: "textarea",
            required: false,
            placeholder: "例如：先做低保真，后续再补品牌视觉细节",
            value: "",
          },
        ],
        metadata: {
          toolName: "ui_designer_spec_bootstrap",
        },
      },
      createdAt: now,
      updatedAt: now,
      metadata: {
        surface: "ui-designer",
        localInteraction: true,
      },
    } as ConversationInteractionEntry;
  }, [
    bootstrapMessageCount,
    bootstrapPendingCount,
    designFiles.designSpecMarkdown,
    pages,
    scope,
    selectedSessionId,
    stack,
    theme,
  ]);
  const selectedSessionSummaryChannelId = typeof selectedSession?.metadata?.selectedChannelId === "string"
    && selectedSession.metadata.selectedChannelId.trim()
    ? selectedSession.metadata.selectedChannelId.trim()
    : undefined;
  const selectedSessionSummaryModelId = typeof selectedSession?.metadata?.selectedModelId === "string"
    && selectedSession.metadata.selectedModelId.trim()
    ? selectedSession.metadata.selectedModelId.trim()
    : undefined;
  const selectedSessionDetailChannelId = typeof selectedSessionDetail?.metadata?.selectedChannelId === "string"
    && selectedSessionDetail.metadata.selectedChannelId.trim()
    ? selectedSessionDetail.metadata.selectedChannelId.trim()
    : undefined;
  const selectedSessionDetailModelId = typeof selectedSessionDetail?.metadata?.selectedModelId === "string"
    && selectedSessionDetail.metadata.selectedModelId.trim()
    ? selectedSessionDetail.metadata.selectedModelId.trim()
    : undefined;

  const canSwitchWorkspace = !designerState?.lockReason
    && !creatingSession
    && !resettingConversation
    && !sendingMessage
    && designerState?.preview.status !== "starting";
  const canResetConversation = Boolean(workspaceId)
    && Boolean(selectedSessionId)
    && !designerState?.lockReason
    && !creatingSession
    && !resettingConversation
    && !sendingMessage
    && designerState?.preview.status !== "starting";

  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(() => {
    stoppingSessionIdRef.current = stoppingSessionId;
  }, [stoppingSessionId]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    selectedSessionDetailRef.current = selectedSessionDetail;
  }, [selectedSessionDetail]);

  useEffect(() => () => {
    composerAttachmentsRef.current.forEach((attachment) => revokeComposerAttachmentPreviewUrl(attachment));
  }, []);

  const clearComposerAttachments = useCallback(() => {
    setComposerAttachments((current) => {
      current.forEach((attachment) => revokeComposerAttachmentPreviewUrl(attachment));
      return [];
    });
  }, []);

  const applySessionDetail = useCallback((detail: DesktopConversationSessionDetail) => {
    setSelectedSessionDetail((current) => current?.sessionId === detail.sessionId || detail.sessionId === selectedSessionIdRef.current
      ? detail
      : current);
    setSessions((current) => {
      const existing = current.find((item) => item.sessionId === detail.sessionId);
      const nextSummary = buildSessionSummaryFromDetail(detail, existing);
      const nextItems = current.some((item) => item.sessionId === detail.sessionId)
        ? current.map((item) => item.sessionId === detail.sessionId ? nextSummary : item)
        : [nextSummary, ...current];
      return [...nextItems].sort(compareSessions);
    });
  }, []);

  const reloadWorkspaces = useCallback(async () => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingWorkspaces(true);
    setErrorMessage(null);
    try {
      const nextItems = (await getNormalWorkspaces({ limit: 200, offset: 0 })).sort(compareWorkspaces);
      setWorkspaces(nextItems);
      setWorkspaceId((current) => resolveNextWorkspaceId(nextItems, current));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [active, bridgeAvailable]);

  const reloadDesignFiles = useCallback(async (nextWorkspaceId: string) => {
    const result = await Promise.all([
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.designSpecMarkdown),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.stackJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.scopeJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.themeJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.patternsJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.layoutsJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.pagesJson),
      getDesktopWorkspaceFileContent(nextWorkspaceId, UI_DESIGNER_DESIGN_FILE_PATHS.sourcesMarkdown),
    ]);

    const nextFiles = {
      designSpecMarkdown: result[0].content,
      stackJson: result[1].content,
      scopeJson: result[2].content,
      themeJson: result[3].content,
      patternsJson: result[4].content,
      layoutsJson: result[5].content,
      pagesJson: result[6].content,
      sourcesMarkdown: result[7].content,
    };

    setDesignFiles(nextFiles);
  }, []);

  const reloadDesignerState = useCallback(async (nextWorkspaceId: string) => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingDesignerState(true);
    setErrorMessage(null);
    try {
      const nextState = await getDesktopUiDesignerState({ workspaceId: nextWorkspaceId });
      setDesignerState(nextState);
      setPreviewMode(nextState.preview.mode);
      await reloadDesignFiles(nextWorkspaceId);
    } catch (error) {
      setDesignerState(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDesignerState(false);
    }
  }, [active, bridgeAvailable, reloadDesignFiles]);

  const reloadSessions = useCallback(async (
    nextWorkspaceId: string,
    preferredSessionId?: string,
  ) => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingSessions(true);
    setErrorMessage(null);
    try {
      const response = await conversationClient.listSessions({
        workspaceId: nextWorkspaceId,
        status: "all",
        limit: 200,
        offset: 0,
      });
      const nextItems = response.items
        .filter(isUiDesignerSession)
        .sort(compareSessions);
      setSessions(nextItems);
      setSelectedSessionId((current) =>
        resolveActiveSessionId(nextItems, preferredSessionId ?? current));
    } catch (error) {
      setSessions([]);
      setSelectedSessionId(undefined);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSessions(false);
    }
  }, [active, bridgeAvailable]);

  const reloadSelectedSessionDetail = useCallback(async (nextSessionId: string) => {
    if (!active || !bridgeAvailable) {
      return;
    }

    setLoadingSessionDetail(true);
    setErrorMessage(null);
    try {
      setSelectedSessionDetail(await conversationClient.getSessionDetail(nextSessionId));
    } catch (error) {
      setSelectedSessionDetail(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSessionDetail(false);
    }
  }, [active, bridgeAvailable]);

  const startSessionDetailFallbackPolling = useCallback((
    sessionId: string,
    onDetail: (detail: DesktopConversationSessionDetail) => void,
  ) => {
    if (!sessionId) {
      return () => undefined;
    }

    let stopped = false;

    void (async () => {
      const startedAt = Date.now();

      while (!stopped) {
        const now = Date.now();
        const lastRuntimeEventAt = runtimeEventActivityBySessionIdRef.current[sessionId] ?? 0;
        const withinGracePeriod = now - startedAt < SESSION_DETAIL_FALLBACK_GRACE_MS;
        const recentRuntimeActivity = lastRuntimeEventAt > 0
          && now - lastRuntimeEventAt < SESSION_DETAIL_FALLBACK_SILENCE_WINDOW_MS;
        const stopRequested = stoppingSessionIdRef.current === sessionId;
        if (withinGracePeriod || recentRuntimeActivity || stopRequested) {
          await delay(SESSION_DETAIL_SEND_POLL_INTERVAL_MS);
          continue;
        }

        try {
          const detail = await conversationClient.getSessionDetail(sessionId);
          if (detail) {
            onDetail(detail);
            if (detail.status !== "active") {
              break;
            }
          }
        } catch {
          // Ignore transient polling failures; runtime events or the final mutation response will recover state.
        }

        if (stopped) {
          break;
        }

        await delay(SESSION_DETAIL_SEND_POLL_INTERVAL_MS);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [conversationClient]);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeAvailable(
        hasDesktopWorkspaceBridge()
        && hasDesktopConversationBridge()
        && hasDesktopUiDesignerBridge(),
      );
      setModelsBridgeAvailable(hasDesktopModelsBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeState);
    window.addEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, syncBridgeState);
    window.addEventListener(DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT, syncBridgeState);
    window.addEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, syncBridgeState);
    return () => {
      window.removeEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeState);
      window.removeEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, syncBridgeState);
      window.removeEventListener(DESKTOP_UI_DESIGNER_BRIDGE_READY_EVENT, syncBridgeState);
      window.removeEventListener(DESKTOP_MODELS_BRIDGE_READY_EVENT, syncBridgeState);
    };
  }, []);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    void reloadWorkspaces();
  }, [active, bridgeAvailable, reloadWorkspaces]);

  useEffect(() => {
    if (!active || !workspaceId || !bridgeAvailable) {
      setDesignerState(null);
      setSessions([]);
      setSelectedSessionId(undefined);
      setSelectedSessionDetail(null);
      return;
    }

    void reloadDesignerState(workspaceId);
    void reloadSessions(workspaceId);
  }, [active, bridgeAvailable, reloadDesignerState, reloadSessions, workspaceId]);

  useEffect(() => {
    if (!active || !selectedSessionId || !bridgeAvailable) {
      setSelectedSessionDetail(null);
      return;
    }

    void reloadSelectedSessionDetail(selectedSessionId);
  }, [active, bridgeAvailable, reloadSelectedSessionDetail, selectedSessionId]);

  const createSession = useCallback(async (input?: {
    kickoffMessage?: string;
    prefillDraft?: string;
  }) => {
    if (!workspaceId) {
      return null;
    }

    setCreatingSession(true);
    setErrorMessage(null);
    try {
      await waitForConversationWorkspaceSettingsSaves(workspaceId);
      const context = buildUiDesignerContext({
        workspaceId,
        selectedWorkspace,
        designerState,
        designFiles,
      });
      const response = await conversationClient.createSession({
        workspaceId,
        title: "UI 设计方案",
        metadata: {
          [UI_DESIGNER_CONTEXT_METADATA_KEY]: context,
        },
      });
      await reloadSessions(workspaceId, response.item.sessionId);
      setSelectedSessionId(response.item.sessionId);
      await reloadSelectedSessionDetail(response.item.sessionId);
      clearComposerAttachments();

      const kickoffMessage = input?.kickoffMessage?.trim();
      if (kickoffMessage) {
        await conversationClient.sendMessage({
          workspaceId,
          sessionId: response.item.sessionId,
          text: kickoffMessage,
          metadata: buildUiDesignerSendMetadata(context),
        });
        await reloadSelectedSessionDetail(response.item.sessionId);
        await reloadSessions(workspaceId, response.item.sessionId);
        return response.item;
      }

      setDraftMessage(input?.prefillDraft?.trim() ?? "");
      return response.item;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setCreatingSession(false);
    }
  }, [
    clearComposerAttachments,
    conversationClient,
    designFiles,
    designerState,
    reloadSelectedSessionDetail,
    reloadSessions,
    selectedWorkspace,
    workspaceId,
  ]);

  const reloadComposerModels = useCallback(async (detail?: DesktopConversationSessionDetail | null) => {
    if (!modelsBridgeAvailable || !workspaceId) {
      setComposerModelOptions([]);
      setComposerModelSelectOptions([]);
      setSelectedComposerModelValueState(undefined);
      return;
    }

    try {
      const resolvedDetailChannelId = detail?.workspaceId === workspaceId
        ? (typeof detail.metadata?.selectedChannelId === "string" && detail.metadata.selectedChannelId.trim()
          ? detail.metadata.selectedChannelId.trim()
          : undefined)
        : undefined;
      const resolvedDetailModelId = detail?.workspaceId === workspaceId
        ? (typeof detail.metadata?.selectedModelId === "string" && detail.metadata.selectedModelId.trim()
          ? detail.metadata.selectedModelId.trim()
          : undefined)
        : undefined;
      const storedSelectedChannelId = workspaceSettings.selectedChannelId?.trim() || undefined;
      const storedSelectedModelId = workspaceSettings.selectedModelId?.trim() || undefined;
      const selectedChannelId = resolvedDetailChannelId
        ?? selectedSessionDetailChannelId
        ?? selectedSessionSummaryChannelId
        ?? (storedSelectedChannelId && storedSelectedModelId ? storedSelectedChannelId : undefined);
      const selectedModelId = resolvedDetailModelId
        ?? selectedSessionDetailModelId
        ?? selectedSessionSummaryModelId
        ?? (storedSelectedChannelId && storedSelectedModelId ? storedSelectedModelId : undefined);
      let response;
      try {
        response = await getDesktopModelRuntimeSelectionSnapshot({
          workspaceId,
          selectedChannelId,
          selectedModelId,
        });
      } catch (error) {
        if (!selectedChannelId && !selectedModelId) {
          throw error;
        }

        response = await getDesktopModelRuntimeSelectionSnapshot({
          workspaceId,
        });
      }
      const runtimeOptions = buildDesktopRuntimeModelOptions({
        snapshot: response.item,
        selectedChannelId,
        selectedModelId,
      });
      const nextOptions = runtimeOptions.map((item) => ({
        value: item.value,
        label: item.label,
        channelId: item.channelId,
        modelId: item.modelId,
        providerType: item.providerType,
        contextWindow: item.contextWindow,
        maxOutputTokens: item.maxOutputTokens,
        disabled: item.disabled,
        searchText: item.searchText,
      } satisfies ChatComposerModelOption));
      const nextSelectOptions = buildDesktopRuntimeModelOptionGroups(runtimeOptions);
      const resolvedValue = resolveDesktopRuntimeSelectedValue({
        snapshot: response.item,
        selectedChannelId: response.item.resolvedSelection.channelId,
        selectedModelId: response.item.resolvedSelection.modelId,
      });
      const defaultValue = resolveDesktopRuntimeSelectedValue({
        snapshot: response.item,
        selectedChannelId: response.item.defaultSelection.channelId,
        selectedModelId: response.item.defaultSelection.modelId,
      });

      setComposerModelOptions(nextOptions);
      setComposerModelSelectOptions(nextSelectOptions);
      setSelectedComposerModelValueState((currentValue) => {
        if (currentValue && nextOptions.some((item) => item.value === currentValue)) {
          return currentValue;
        }
        if (resolvedValue && nextOptions.some((item) => item.value === resolvedValue)) {
          return resolvedValue;
        }
        if (defaultValue && nextOptions.some((item) => item.value === defaultValue)) {
          return defaultValue;
        }
        return nextOptions[0]?.value;
      });
    } catch {
      setComposerModelOptions([]);
      setComposerModelSelectOptions([]);
      setSelectedComposerModelValueState(undefined);
    }
  }, [
    modelsBridgeAvailable,
    selectedSessionDetailChannelId,
    selectedSessionDetailModelId,
    selectedSessionSummaryChannelId,
    selectedSessionSummaryModelId,
    workspaceId,
    workspaceSettings.selectedChannelId,
    workspaceSettings.selectedModelId,
  ]);

  useEffect(() => {
    if (!active) {
      return;
    }

    void reloadComposerModels(selectedSessionDetail);
  }, [active, reloadComposerModels, selectedSessionDetail]);

  useEffect(() => {
    if (modelsBridgeAvailable) {
      return;
    }

    setComposerModelOptions([]);
    setComposerModelSelectOptions([]);
    setSelectedComposerModelValueState(undefined);
  }, [modelsBridgeAvailable]);

  useEffect(() => {
    if (!active || !workspaceId) {
      return;
    }

    const handleSessionInvalidated = () => {
      void reloadSessions(workspaceId, selectedSessionId);
      if (selectedSessionId) {
        void reloadSelectedSessionDetail(selectedSessionId);
      }
    };

    window.addEventListener(DESKTOP_CONVERSATION_INVALIDATED_EVENT, handleSessionInvalidated);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_INVALIDATED_EVENT, handleSessionInvalidated);
    };
  }, [active, reloadSelectedSessionDetail, reloadSessions, selectedSessionId, workspaceId]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    const handleConversationDetailUpdated = (event: Event) => {
      const detailUpdate = (event as CustomEvent<DesktopConversationSessionDetailUpdateEvent | undefined>).detail;
      if (!detailUpdate) {
        return;
      }

      if (
        detailUpdate.detail.workspaceId !== workspaceId
        && detailUpdate.detail.sessionId !== selectedSessionIdRef.current
      ) {
        return;
      }

      applySessionDetail(detailUpdate.detail);
      setLoadingSessionDetail(false);
      if (detailUpdate.detail.sessionId === selectedSessionIdRef.current) {
        setSendingMessage(detailUpdate.detail.status === "active" && stoppingSessionIdRef.current !== detailUpdate.detail.sessionId);
        if (detailUpdate.detail.status !== "active") {
          setStoppingSessionId((current) => current === detailUpdate.detail.sessionId ? null : current);
          void reloadDesignerState(detailUpdate.detail.workspaceId);
        }
      }
    };

    window.addEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_DETAIL_UPDATED_EVENT, handleConversationDetailUpdated);
    };
  }, [active, applySessionDetail, bridgeAvailable, reloadDesignerState, workspaceId]);

  useEffect(() => {
    if (!active || !bridgeAvailable) {
      return;
    }

    if (!workspaceId) {
      return;
    }

    const handleConversationRuntimeEventsUpdated = (event: Event) => {
      const runtimeUpdate = (event as CustomEvent<DesktopConversationRuntimeEventsUpdateEvent | undefined>).detail;
      if (!runtimeUpdate) {
        return;
      }

      runtimeEventActivityBySessionIdRef.current[runtimeUpdate.sessionId] = Date.now();

      const matchesWorkspace = runtimeUpdate.workspaceId === workspaceId;
      const matchesSelectedSession = runtimeUpdate.sessionId === selectedSessionIdRef.current;
      if (!matchesWorkspace && !matchesSelectedSession) {
        return;
      }

      if (matchesSelectedSession) {
        const currentDetail = selectedSessionDetailRef.current;
        if (currentDetail) {
          const merged = mergeDesktopConversationRuntimeEvents(currentDetail, runtimeUpdate.events);
          if (!merged.requiresReload) {
            applySessionDetail(merged.detail);
            setLoadingSessionDetail(false);
            setSendingMessage(merged.detail.status === "active" && stoppingSessionIdRef.current !== runtimeUpdate.sessionId);
            if (merged.detail.status !== "active") {
              setStoppingSessionId((current) => current === runtimeUpdate.sessionId ? null : current);
              void reloadDesignerState(merged.detail.workspaceId);
            }
            return;
          }
        }

        if (stoppingSessionIdRef.current !== runtimeUpdate.sessionId) {
          setSendingMessage(true);
        }
        void reloadSelectedSessionDetail(runtimeUpdate.sessionId);
        return;
      }

      void reloadSessions(workspaceId, selectedSessionIdRef.current);
    };

    window.addEventListener(
      DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
      handleConversationRuntimeEventsUpdated,
    );
    return () => {
      window.removeEventListener(
        DESKTOP_CONVERSATION_RUNTIME_EVENTS_UPDATED_EVENT,
        handleConversationRuntimeEventsUpdated,
      );
    };
  }, [active, applySessionDetail, bridgeAvailable, reloadDesignerState, reloadSelectedSessionDetail, reloadSessions, workspaceId]);

  useEffect(() => {
    if (!active || !workspaceId || !designerState || loadingSessions || creatingSession || selectedSessionId) {
      return;
    }

    if (sessions.some((item) => item.status !== "archived")) {
      return;
    }

    void createSession({
      prefillDraft: "",
    });
  }, [
    active,
    createSession,
    creatingSession,
    designerState,
    loadingSessions,
    selectedSessionId,
    sessions,
    workspaceId,
  ]);

  const selectWorkspace = useCallback((nextWorkspaceId: string) => {
    if (!nextWorkspaceId) {
      return;
    }

    if (!canSwitchWorkspace && nextWorkspaceId !== workspaceId) {
      return;
    }

    setWorkspaceId(nextWorkspaceId);
  }, [canSwitchWorkspace, workspaceId]);

  const selectSession = useCallback((nextSessionId: string) => {
    if (!nextSessionId) {
      return;
    }

    setSelectedSessionId(nextSessionId);
  }, []);

  const resetConversation = useCallback(async () => {
    if (!workspaceId || !selectedSessionId || resettingConversation) {
      return;
    }

    const sessionToHide = selectedSessionId;
    setResettingConversation(true);
    setErrorMessage(null);
    setSelectedSessionDetail(null);
    setSelectedSessionId(undefined);
    clearComposerAttachments();
    try {
      const created = await createSession({
        prefillDraft: "",
      });
      if (created) {
        void conversationClient.hideSession(sessionToHide)
          .then(() => reloadSessions(workspaceId, created.sessionId))
          .catch((error) => {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          });
      } else {
        setSelectedSessionId(sessionToHide);
        await reloadSessions(workspaceId, sessionToHide);
      }
    } catch (error) {
      setSelectedSessionId(sessionToHide);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setResettingConversation(false);
    }
  }, [clearComposerAttachments, conversationClient, createSession, designerState, reloadSessions, resettingConversation, selectedSessionId, workspaceId]);

  const attachComposerFiles = useCallback((files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void (async () => {
      const results = await Promise.allSettled(files.map((file) => normalizeComposerAttachment(file)));
      const normalized: ChatComposerAttachment[] = [];
      let firstError: unknown;

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.name.trim()) {
            normalized.push(result.value);
          } else {
            revokeComposerAttachmentPreviewUrl(result.value);
          }
          continue;
        }

        if (firstError === undefined) {
          firstError = result.reason;
        }
      }

      if (firstError !== undefined) {
        setErrorMessage(firstError instanceof Error ? firstError.message : String(firstError));
      }

      if (normalized.length === 0) {
        return;
      }

      setComposerAttachments((current) => {
        const nextById = new Map(current.map((item) => [item.id, item]));
        for (const item of normalized) {
          if (nextById.has(item.id)) {
            revokeComposerAttachmentPreviewUrl(item);
            continue;
          }

          nextById.set(item.id, item);
        }
        return [...nextById.values()];
      });
    })();
  }, []);

  const removeComposerAttachment = useCallback((attachmentId: string) => {
    const normalizedId = attachmentId.trim();
    if (!normalizedId) {
      return;
    }

    setComposerAttachments((current) => {
      const target = current.find((item) => item.id === normalizedId);
      revokeComposerAttachmentPreviewUrl(target);
      return current.filter((item) => item.id !== normalizedId);
    });
  }, []);

  const sendMessage = useCallback(async () => {
    if (!workspaceId || !selectedSessionId || sendingMessage) {
      return;
    }

    const text = draftMessage.trim();
    const attachments = buildComposerAttachmentInputs(composerAttachments);

    if (!text && attachments.length === 0) {
      return;
    }

    const selectedModel = composerModelOptions.find((item) => item.value === selectedComposerModelValue);
    const context = buildUiDesignerContext({
      workspaceId,
      selectedWorkspace,
      designerState,
      designFiles,
    });

    setSendingMessage(true);
    setErrorMessage(null);
    try {
      await waitForConversationWorkspaceSettingsSaves(workspaceId);
      setDraftMessage("");
      clearComposerAttachments();
      const targetSessionId = selectedSessionId;
      const stopPolling = startSessionDetailFallbackPolling(targetSessionId, (detail) => {
        applySessionDetail(detail);
        setSendingMessage(detail.status === "active");
        if (detail.status !== "active") {
          void reloadDesignerState(workspaceId);
        }
      });

      const messagePromise = conversationClient.sendMessage({
        workspaceId,
        sessionId: selectedSessionId,
        ...(text ? { text } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        metadata: buildUiDesignerSendMetadata(context),
        ...(selectedModel
          ? {
              selectedChannelId: selectedModel.channelId,
              selectedModelId: selectedModel.modelId,
            }
          : {}),
      });

      void messagePromise.then((response) => {
        stopPolling();
        applySessionDetail(response.detail);
        void reloadSessions(workspaceId, response.detail.sessionId);
        void reloadDesignerState(workspaceId);
      }).catch((error) => {
        stopPolling();
        setSendingMessage(false);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setSendingMessage(false);
      return;
    } finally {
      // Runtime events and the final detail update now control the visible sending state.
    }
  }, [
    applySessionDetail,
    clearComposerAttachments,
    composerAttachments,
    composerModelOptions,
    conversationClient,
    designFiles,
    designerState,
    draftMessage,
    reloadDesignerState,
    selectedComposerModelValue,
    selectedWorkspace,
    selectedSessionId,
    sendingMessage,
    startSessionDetailFallbackPolling,
    workspaceId,
  ]);

  const stopMessage = useCallback(async () => {
    if (!selectedSessionId || !sendingMessage || stoppingSessionId === selectedSessionId) {
      return;
    }

    setStoppingSessionId(selectedSessionId);
    setErrorMessage(null);
    try {
      const response = await conversationClient.stopMessage({
        sessionId: selectedSessionId,
      });
      applySessionDetail(response.detail);
      await reloadSessions(response.detail.workspaceId, response.detail.sessionId);
      await reloadDesignerState(response.detail.workspaceId);
      setSendingMessage(response.detail.status === "active");
      setStoppingSessionId(null);
    } catch (error) {
      setStoppingSessionId(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [
    applySessionDetail,
    conversationClient,
    reloadDesignerState,
    reloadSessions,
    selectedSessionId,
    sendingMessage,
    stoppingSessionId,
  ]);

  const answerInteraction = useCallback(async (interactionId: string, response: unknown) => {
    const normalizedInteractionId = interactionId.trim();
    if (!normalizedInteractionId || !selectedSessionId) {
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_SCOPE_BOOTSTRAP_INTERACTION_ID) {
      const projectType = readFirstQuestionAnswerValue(response, "project_type");
      const businessType = readFirstQuestionAnswerValue(response, "business_type");

      if (!workspaceId || !projectType || !businessType) {
        return;
      }

      setReplyingInteractionId(normalizedInteractionId);
      setErrorMessage(null);
      try {
        const nextScope = {
          ...scope,
          projectType,
          businessType,
        };
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: {
            scopeJson: JSON.stringify(nextScope, null, 2),
          },
        });
        setDesignerState(saved.state);
        setPreviewMode(saved.state.preview.mode);
        await reloadDesignFiles(workspaceId);
        setDraftMessage(`已确认项目范围：项目类型为${projectType}，业务类型为${businessType}。请继续进行技术栈确认，优先给出推荐选项，并允许我补充。`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
      }
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_STACK_BOOTSTRAP_INTERACTION_ID) {
      const values = isRecord(response) && isRecord(response.values)
        ? response.values as Record<string, unknown>
        : {};
      const framework = typeof values.framework === "string" ? values.framework.trim() : "";
      const uiLibrary = typeof values.uiLibrary === "string" ? values.uiLibrary.trim() : "";
      const packageManager = typeof values.packageManager === "string" ? values.packageManager.trim() : "";
      const target = typeof values.target === "string" ? values.target.trim() : "";
      const responsive = values.responsive === true;

      if (!workspaceId || !framework || !uiLibrary) {
        return;
      }

      setReplyingInteractionId(normalizedInteractionId);
      setErrorMessage(null);
      try {
        const nextStack = {
          ...stack,
          framework,
          uiLibrary,
          packageManager,
          buildTool: framework === "Next.js" ? "Next.js" : "Vite",
          target,
          responsive,
        };
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: {
            stackJson: JSON.stringify(nextStack, null, 2),
          },
        });
        setDesignerState(saved.state);
        setPreviewMode(saved.state.preview.mode);
        await reloadDesignFiles(workspaceId);
        setDraftMessage(`已确认技术栈：${framework} + ${uiLibrary}。请继续基于这个技术栈整理视觉与交互基线，优先先确认风格方向、色彩倾向和界面密度。`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
      }
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_THEME_BOOTSTRAP_INTERACTION_ID) {
      const style = readFirstQuestionAnswerValue(response, "style");
      const colorTendency = readFirstQuestionAnswerValue(response, "color_tendency");
      const density = readFirstQuestionAnswerValue(response, "density");

      if (!workspaceId || !style) {
        return;
      }

      setReplyingInteractionId(normalizedInteractionId);
      setErrorMessage(null);
      try {
        const nextTheme = {
          ...theme,
          style,
          colorTendency: colorTendency ?? "",
          density: density ?? "",
        };
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: {
            themeJson: JSON.stringify(nextTheme, null, 2),
          },
        });
        setDesignerState(saved.state);
        setPreviewMode(saved.state.preview.mode);
        await reloadDesignFiles(workspaceId);
        setDraftMessage(`已确认视觉与交互基线：${style}${colorTendency ? `，${colorTendency}` : ""}${density ? `，${density}` : ""}。请继续确认页面模板和业务模块，优先用勾选清单方式整理。`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
      }
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_PAGES_BOOTSTRAP_INTERACTION_ID) {
      const values = isRecord(response) && isRecord(response.values)
        ? response.values as Record<string, unknown>
        : {};
      const templates = readStringArray(values.templates);
      const modules = readStringArray(values.modules);

      if (!workspaceId || templates.length === 0) {
        return;
      }

      setReplyingInteractionId(normalizedInteractionId);
      setErrorMessage(null);
      try {
        const nextPages = {
          ...pages,
          templates,
          modules,
        };
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: {
            pagesJson: JSON.stringify(nextPages, null, 2),
          },
        });
        setDesignerState(saved.state);
        setPreviewMode(saved.state.preview.mode);
        await reloadDesignFiles(workspaceId);
        setDraftMessage(`已确认页面与模块：页面模板包含${templates.join("、")}${modules.length > 0 ? `，业务模块包含${modules.join("、")}` : ""}。请继续整理设计规格书，并补齐仍然缺失的内容。`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
      }
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_SPEC_BOOTSTRAP_INTERACTION_ID) {
      const values = isRecord(response) && isRecord(response.values)
        ? response.values as Record<string, unknown>
        : {};
      const referenceLinks = typeof values.referenceLinks === "string"
        ? values.referenceLinks
          .split(/\r?\n/)
          .map((item) => normalizeNonEmptyString(item))
          .filter((item): item is string => item !== null)
        : [];
      const deliverables = readStringArray(values.deliverables);
      const notes = normalizeNonEmptyString(values.notes);

      if (!workspaceId || referenceLinks.length === 0 || deliverables.length === 0) {
        return;
      }

      setReplyingInteractionId(normalizedInteractionId);
      setErrorMessage(null);
      try {
        const nextSourcesMarkdown = buildUiDesignerSourcesMarkdown({
          referenceLinks,
          deliverables,
          notes,
        });
        const nextDesignSpecMarkdown = buildUiDesignerDesignSpecMarkdown({
          scope,
          stack,
          theme,
          pages,
          referenceLinks,
          deliverables,
          notes,
        });
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: {
            sourcesMarkdown: nextSourcesMarkdown,
            designSpecMarkdown: nextDesignSpecMarkdown,
          },
        });
        setDesignerState(saved.state);
        setPreviewMode(saved.state.preview.mode);
        await reloadDesignFiles(workspaceId);
        setDraftMessage(`已整理设计规格书和参考资料，参考链接包含${referenceLinks.join("、")}。接下来可以继续细化组件模式、布局方案，或者直接开始生成页面。`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
      }
      return;
    }

    setReplyingInteractionId(normalizedInteractionId);
    setErrorMessage(null);
    const stopPolling = startSessionDetailFallbackPolling(selectedSessionId, (detail) => {
      applySessionDetail(detail);
      setSendingMessage(detail.status === "active");
      if (detail.status !== "active") {
        void reloadDesignerState(detail.workspaceId);
      }
    });

    try {
      const result = await answerDesktopConversationInteraction({
        sessionId: selectedSessionId,
        interactionId: normalizedInteractionId,
        response,
      });
      stopPolling();
      applySessionDetail(result.detail);
      await reloadSessions(result.detail.workspaceId, result.detail.sessionId);
      await reloadComposerModels(result.detail);
      await reloadDesignerState(result.detail.workspaceId);
    } catch (error) {
      stopPolling();
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
    }
  }, [
    applySessionDetail,
    reloadComposerModels,
    reloadDesignFiles,
    reloadDesignerState,
    reloadSessions,
    selectedSessionId,
    scope,
    stack,
    theme,
    pages,
    startSessionDetailFallbackPolling,
    workspaceId,
  ]);

  const rejectInteraction = useCallback(async (interactionId: string) => {
    const normalizedInteractionId = interactionId.trim();
    if (!normalizedInteractionId || !selectedSessionId) {
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_SCOPE_BOOTSTRAP_INTERACTION_ID) {
      setDraftMessage("请先告诉我你想做什么系统，我会先帮你确认项目范围，再继续技术栈。");
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_STACK_BOOTSTRAP_INTERACTION_ID) {
      setDraftMessage("请先告诉我你偏好的前端框架和 UI 组件库，我会先帮你确认技术栈，再继续视觉与交互基线。");
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_THEME_BOOTSTRAP_INTERACTION_ID) {
      setDraftMessage("请先告诉我你想要的整体风格、色彩倾向和界面密度，我会先帮你确认视觉与交互基线。");
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_PAGES_BOOTSTRAP_INTERACTION_ID) {
      setDraftMessage("请先告诉我需要哪些页面模板和业务模块，我会先帮你确认页面与模块清单。");
      return;
    }

    if (normalizedInteractionId === UI_DESIGNER_SPEC_BOOTSTRAP_INTERACTION_ID) {
      setDraftMessage("请先告诉我参考资料链接和这轮要交付的内容，我会先帮你整理设计规格书。");
      return;
    }

    setReplyingInteractionId(normalizedInteractionId);
    setErrorMessage(null);
    const stopPolling = startSessionDetailFallbackPolling(selectedSessionId, (detail) => {
      applySessionDetail(detail);
      setSendingMessage(detail.status === "active");
      if (detail.status !== "active") {
        void reloadDesignerState(detail.workspaceId);
      }
    });

    try {
      const result = await rejectDesktopConversationInteraction({
        sessionId: selectedSessionId,
        interactionId: normalizedInteractionId,
      });
      stopPolling();
      applySessionDetail(result.detail);
      await reloadSessions(result.detail.workspaceId, result.detail.sessionId);
      await reloadComposerModels(result.detail);
      await reloadDesignerState(result.detail.workspaceId);
    } catch (error) {
      stopPolling();
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setReplyingInteractionId((current) => current === normalizedInteractionId ? null : current);
    }
  }, [
    applySessionDetail,
    reloadComposerModels,
    reloadDesignerState,
    reloadSessions,
    selectedSessionId,
    startSessionDetailFallbackPolling,
  ]);

  const setSelectedComposerModelValue = useCallback((value: string | undefined) => {
    const restorePersistedWorkspaceSelection = () => {
      const persistedValue = composerModelOptions.find((item) =>
        item.channelId === workspaceSettings.selectedChannelId
        && item.modelId === workspaceSettings.selectedModelId)
        ?.value;
      setSelectedComposerModelValueState((current) => current === persistedValue ? current : persistedValue);
    };

    setSelectedComposerModelValueState((current) => current === value ? current : value);

    const selectedModel = composerModelOptions.find((item) => item.value === value);
    if (!selectedModel) {
      if (workspaceSettings.selectedChannelId || workspaceSettings.selectedModelId) {
        void saveWorkspaceSettings({
          selectedChannelId: undefined,
          selectedModelId: undefined,
        }, {
          syncExistingSessions: false,
        }).catch((error) => {
          restorePersistedWorkspaceSelection();
          setErrorMessage(error instanceof Error ? error.message : String(error));
        });
      }
      return;
    }

    if (
      workspaceSettings.selectedChannelId === selectedModel.channelId
      && workspaceSettings.selectedModelId === selectedModel.modelId
    ) {
      return;
    }

    void saveWorkspaceSettings({
      selectedChannelId: selectedModel.channelId,
      selectedModelId: selectedModel.modelId,
    }, {
      syncExistingSessions: false,
    }).catch((error) => {
      restorePersistedWorkspaceSelection();
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });
  }, [
    composerModelOptions,
    saveWorkspaceSettings,
    workspaceSettings.selectedChannelId,
    workspaceSettings.selectedModelId,
  ]);

  const queueRedesignPrompt = useCallback((blockKey: string) => {
    const nextDraft = REDESIGN_PROMPTS[blockKey];
    if (!nextDraft) {
      return;
    }

    setDraftMessage(nextDraft);
  }, []);

  const openStageDialog = useCallback(async (stageKey: string) => {
    try {
      const schema = await requestStageSchema(stageKey as Parameters<typeof requestStageSchema>[0]);
      setStageDialogState({
        stageKey,
        schema,
        submitting: false,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const closeStageDialog = useCallback(() => {
    setStageDialogState({
      stageKey: null,
      schema: null,
      submitting: false,
    });
  }, []);

  const submitStageDialog = useCallback(async (values: Record<string, unknown>) => {
    if (!workspaceId || !stageDialogState.stageKey) {
      return;
    }

    setStageDialogState((current) => current.schema
      ? { ...current, submitting: true }
      : current);

    try {
      const stageResult = await requestStageResult({
        stageKey: stageDialogState.stageKey as Parameters<typeof requestStageResult>[0]["stageKey"],
        values,
      });
      const normalized = normalizeStageResult(stageResult);

      if (Object.keys(normalized.files).length > 0) {
        const saved = await saveDesktopUiDesignerDesignPackage({
          workspaceId,
          files: normalized.files,
        });
        setDesignerState(saved.state);
        setPreviewMode(saved.state.preview.mode);
        await reloadDesignFiles(workspaceId);
      }

      setStageDialogState({
        stageKey: null,
        schema: null,
        submitting: false,
      });
    } catch (error) {
      setStageDialogState((current) => current.schema
        ? { ...current, submitting: false }
        : current);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [reloadDesignFiles, stageDialogState.stageKey, workspaceId]);

  return {
    bridgeAvailable,
    canResetConversation,
    canSwitchWorkspace,
    composerAttachments,
    composerModelOptions,
    composerModelSelectOptions,
    creatingSession,
    designFiles,
    designerState,
    draftMessage,
    errorMessage,
    loadingDesignerState,
    loadingSessionDetail,
    loadingSessions,
    loadingWorkspaces,
    modelsBridgeAvailable,
    layouts,
    patterns,
    pages,
    previewMode,
    queueRedesignPrompt,
    resettingConversation,
    replyingInteractionId,
    scopeBootstrapInteraction,
    stackBootstrapInteraction,
    themeBootstrapInteraction,
    pagesBootstrapInteraction,
    specBootstrapInteraction,
    scope,
    selectedSession,
    selectedComposerModelValue,
    selectedSessionDetail,
    selectedWorkspace,
    sendingMessage,
    stageDialogState,
    stageViewModels,
    stoppingMessage: Boolean(selectedSessionId && stoppingSessionId === selectedSessionId),
    sourcesMarkdown,
    stack,
    theme,
    workspaceSettings,
    workspaceId,
    workspaces,
    createSession,
    reloadDesignerState,
    reloadSessions,
    reloadWorkspaces,
    selectWorkspace,
    attachComposerFiles,
    closeStageDialog,
    openStageDialog,
    removeComposerAttachment,
    resetConversation,
    answerInteraction,
    rejectInteraction,
    sendMessage,
    stopMessage,
    submitStageDialog,
    setDraftMessage,
    setPreviewMode,
    setSelectedComposerModelValue,
  };
}

export type UiDesignerShellState = ReturnType<typeof useUiDesignerShellState>;
