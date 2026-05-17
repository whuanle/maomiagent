import { DownOutlined, LeftOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  Segmented,
  Spin,
  Typography,
} from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  DesktopGitChangeItem,
  DesktopGitChangeStatus,
  DesktopGitHistoryDetailFile,
  DesktopGitHistoryDetailResult,
  DesktopGitHistoryItem,
  DesktopGitHistoryResult,
  DesktopGitModuleSnapshotResult,
  DesktopGitReviewItem,
} from "../../../../shared/desktop-git";
import type {
  DesktopWorkspaceFileContentResult,
  DesktopWorkspaceFileTreeNode,
} from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import {
  getDesktopGitHistory,
  getDesktopGitHistoryDetail,
  getDesktopGitReviewDetail,
} from "../../../lib/desktop-git";
import { executeDesktopAiOneShot } from "../../../lib/desktop-ai";
import { getDesktopModelRuntimeSelectionSnapshot } from "../../../lib/desktop-models";
import {
  getDesktopWorkspaceFileContent,
  getDesktopWorkspaceFileTree,
} from "../../../lib/desktop-workspace";
import type { GitPageCopy } from "../i18n";
import { WorkspaceDiffChanges } from "./diff-changes";
import { GitDiffPreview } from "./diff-preview";
import { WorkspaceFileIcon } from "./file-icon";
import { resolveWorkspaceReviewStatusClass, splitWorkspaceReviewDirectory } from "./review-model";
import {
  buildGitChangeTree,
  buildGitSectionEntries,
  type GitChangeTreeNode,
  type GitSectionEntry,
  LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD,
} from "./view-model";
import { useWorkspaceInspectorFileTree } from "../../chat/components/use-workspace-inspector-file-tree";
import {
  buildWorkspaceInspectorTreeFilter,
  buildWorkspaceInspectorVisibleNodes,
} from "../../chat/components/workspace-inspector-tree-model";

const { Paragraph, Text } = Typography;
const GIT_EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const STAGED_REVIEW_TARGET_KEY = "__staged__";
const MAX_HEURISTIC_DIFF_CHURN = 1200;
const MAX_HEURISTIC_PATCH_LENGTH = 240_000;
const MAX_WORKSPACE_ANALYSIS_CONTENT_LENGTH = 180_000;
const MAX_AI_REVIEW_FINDINGS_PER_FILE = 3;
const AI_REVIEW_WORKER_COUNT = 2;

type GitAiReviewMode = "git" | "workspace";
type GitAiReviewPanelStage = "commits" | "files";
type GitAiReviewSeverity = "high" | "medium" | "low";
type GitAiReviewCategory = "security" | "quality" | "tests" | "maintainability" | "diff";

type GitAiReviewFinding = {
  id: string;
  path: string;
  title: string;
  summary: string;
  suggestion: string;
  severity: GitAiReviewSeverity;
  category: GitAiReviewCategory;
  status: DesktopGitChangeStatus;
  lineNumber?: number;
  evidence?: string;
  additions: number;
  deletions: number;
};

type Props = {
  language: LanguageCode;
  workspaceId: string;
  copy: GitPageCopy;
  snapshot: DesktopGitModuleSnapshotResult | null;
  loading: boolean;
  selectedReviewFilePath?: string;
  onSelectedReviewFilePathChange?: (path?: string) => void;
  selectedReviewFindingId?: string;
  onSelectedReviewFindingIdChange?: (id?: string) => void;
};

type GitAiReviewCopy = {
  searchPlaceholder: string;
  modeGit: string;
  modeWorkspace: string;
  startReview: string;
  rerunReview: string;
  exportMarkdown: string;
  reviewLoadFailed: string;
  exportFailed: string;
  emptyNoReview: string;
  emptyNoSelection: string;
  workspaceTreeEmpty: string;
  overallAnalysisHint: string;
  noDiagnostics: string;
  workspaceBinaryUnsupported: string;
  workspacePreviewLoading: string;
  workspacePreviewFailed: string;
  workspacePreviewTruncated: string;
  workspaceAnalyzedFiles: (value: number) => string;
  workspaceAnalyzing: (completed: number, total: number) => string;
  workspaceAnalysisFailed: (failed: number) => string;
  refreshFailed: string;
  detailSuggestion: string;
  detailEvidence: string;
  detailLine: (value: number) => string;
  severityText: (value: GitAiReviewSeverity) => string;
  categoryText: (value: GitAiReviewCategory) => string;
  findingsCount: (value: number) => string;
  filesCount: (value: number) => string;
  summaryHigh: string;
  summaryMedium: string;
  summaryLow: string;
  commitListTitle: string;
  commitChangesTitle: string;
  backToCommits: string;
  selectCommitHint: string;
  startGitReviewHint: string;
  startWorkspaceReviewHint: string;
  aiCommentsTitle: string;
  workspaceResultsTitle: string;
  codePaneTitleGit: string;
  codePaneTitleWorkspace: string;
  workspaceReportPartialHint: string;
};

type GitAiReviewPathSummary = {
  reviewed: boolean;
  findingCount: number;
  highestSeverity?: GitAiReviewSeverity;
};

type ReviewExecutionMode = "ai" | "mixed" | "heuristic";

type ReviewModelSelection = {
  selectedChannelId: string;
  selectedModelId: string;
  label: string;
};

type ReviewLoadOutput<T> = {
  results: Record<string, T>;
  findingsByPath: Record<string, GitAiReviewFinding[]>;
  reviewedPaths: string[];
  failed: number;
  firstError: string | null;
  mode: ReviewExecutionMode;
  modelLabel?: string;
  fallbackCount: number;
};

type CommitTreeEntry = GitSectionEntry & {
  file: DesktopGitHistoryDetailFile;
};

function createAiReviewCopy(language: LanguageCode): GitAiReviewCopy {
  if (language === "en-US") {
    return {
      searchPlaceholder: "Search commits or file paths",
      modeGit: "Git review",
      modeWorkspace: "Project analysis",
      startReview: "Run review",
      rerunReview: "Run again",
      exportMarkdown: "Export Markdown",
      reviewLoadFailed: "Failed to load review data",
      exportFailed: "Failed to export markdown report",
      emptyNoReview: "No files available for review.",
      emptyNoSelection: "Select a file on the left to inspect details.",
      workspaceTreeEmpty: "No files in the current workspace.",
      overallAnalysisHint: "Run project analysis, then select a file on the left to inspect review results.",
      noDiagnostics: "No high-signal diagnostics were inferred for this file.",
      workspaceBinaryUnsupported: "This file cannot be previewed inline.",
      workspacePreviewLoading: "Loading file preview",
      workspacePreviewFailed: "Failed to load file preview",
      workspacePreviewTruncated: "Preview is truncated for large files.",
      workspaceAnalyzedFiles: (value) => `${value} files analyzed`,
      workspaceAnalyzing: (completed, total) => `Analyzing ${completed} / ${total}`,
      workspaceAnalysisFailed: (failed) => `${failed} files failed to load during analysis`,
      refreshFailed: "Refresh failed",
      detailSuggestion: "Suggested focus",
      detailEvidence: "Evidence",
      detailLine: (value) => `Line ${value}`,
      severityText: (value) => value === "high" ? "High" : value === "medium" ? "Medium" : "Low",
      categoryText: (value) => {
        if (value === "security") {
          return "Security";
        }
        if (value === "quality") {
          return "Quality";
        }
        if (value === "tests") {
          return "Tests";
        }
        if (value === "maintainability") {
          return "Maintainability";
        }
        return "Diff";
      },
      findingsCount: (value) => `${value} findings`,
      filesCount: (value) => `${value} files`,
      summaryHigh: "High risk",
      summaryMedium: "Medium risk",
      summaryLow: "Low risk",
      commitListTitle: "Commit list",
      commitChangesTitle: "Commit changes",
      backToCommits: "Back to commits",
      selectCommitHint: "Select a commit on the left, then run review for that commit.",
      startGitReviewHint: "Run review after selecting a commit to generate AI comments for that commit.",
      startWorkspaceReviewHint: "Run project analysis after selecting the files you want to inspect.",
      aiCommentsTitle: "AI comments",
      workspaceResultsTitle: "Review results",
      codePaneTitleGit: "Commit code",
      codePaneTitleWorkspace: "Code",
      workspaceReportPartialHint: "The workspace report is generated from the current workspace scan. Files that fail to load are skipped.",
    };
  }

  return {
    searchPlaceholder: "搜索提交或文件路径",
    modeGit: "Git 审查",
    modeWorkspace: "全项目分析",
    startReview: "开始审查",
    rerunReview: "重新审查",
    exportMarkdown: "导出 Markdown",
    reviewLoadFailed: "加载审查数据失败",
    exportFailed: "导出 Markdown 报告失败",
    emptyNoReview: "当前没有可审查的文件。",
    emptyNoSelection: "从左侧选择文件查看详情。",
    workspaceTreeEmpty: "当前工作区没有文件。",
    overallAnalysisHint: "先开始全项目分析，再从左侧选择文件查看审查结果。",
    noDiagnostics: "当前文件没有推导出高信号诊断。",
    workspaceBinaryUnsupported: "当前文件暂不支持内联预览。",
    workspacePreviewLoading: "正在加载文件预览",
    workspacePreviewFailed: "加载文件预览失败",
    workspacePreviewTruncated: "文件较大，当前只显示截断预览。",
    workspaceAnalyzedFiles: (value) => `已分析 ${value} 个文件`,
    workspaceAnalyzing: (completed, total) => `正在分析 ${completed} / ${total}`,
    workspaceAnalysisFailed: (failed) => `分析过程中有 ${failed} 个文件读取失败`,
    refreshFailed: "刷新失败",
    detailSuggestion: "建议聚焦",
    detailEvidence: "触发依据",
    detailLine: (value) => `第 ${value} 行`,
    severityText: (value) => value === "high" ? "高" : value === "medium" ? "中" : "低",
    categoryText: (value) => {
      if (value === "security") {
        return "安全";
      }
      if (value === "quality") {
        return "质量";
      }
      if (value === "tests") {
        return "测试";
      }
      if (value === "maintainability") {
        return "可维护性";
      }
      return "差异";
    },
    findingsCount: (value) => `发现 ${value} 项`,
    filesCount: (value) => `${value} 个文件`,
    summaryHigh: "高风险",
    summaryMedium: "中风险",
    summaryLow: "低风险",
    commitListTitle: "提交列表",
    commitChangesTitle: "提交变更",
    backToCommits: "返回提交列表",
    selectCommitHint: "先从左侧选择一个提交，再对该提交开始审查。",
    startGitReviewHint: "选择一个提交后点击开始审查，AI 会针对这个提交生成评论。",
    startWorkspaceReviewHint: "左侧先选文件，再点击开始审查生成全项目审查结果。",
    aiCommentsTitle: "AI 评论",
    workspaceResultsTitle: "审查列表",
    codePaneTitleGit: "提交代码",
    codePaneTitleWorkspace: "代码",
    workspaceReportPartialHint: "全项目报告基于当前工作区扫描结果生成，读取失败的文件会被跳过。",
  };
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function comparePathLabels(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN-u-co-pinyin", {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizePatchLines(value: string) {
  return value.replace(/\r\n?/gu, "\n").split("\n");
}

function collectAddedLines(item: DesktopGitReviewItem) {
  const addedLines: Array<{ lineNumber?: number; text: string }> = [];
  let beforeLineNumber: number | undefined;
  let afterLineNumber: number | undefined;

  for (const line of normalizePatchLines(item.patch)) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
    if (hunkMatch) {
      beforeLineNumber = Number.parseInt(hunkMatch[1] ?? "0", 10);
      afterLineNumber = Number.parseInt(hunkMatch[2] ?? "0", 10);
      continue;
    }

    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+")) {
      addedLines.push({
        lineNumber: afterLineNumber,
        text: line.slice(1),
      });
      if (afterLineNumber !== undefined) {
        afterLineNumber += 1;
      }
      continue;
    }

    if (line.startsWith("-")) {
      if (beforeLineNumber !== undefined) {
        beforeLineNumber += 1;
      }
      continue;
    }

    if (line.startsWith(" ")) {
      if (beforeLineNumber !== undefined) {
        beforeLineNumber += 1;
      }
      if (afterLineNumber !== undefined) {
        afterLineNumber += 1;
      }
    }
  }

  return addedLines;
}

function findFirstAddedLineMatch(item: DesktopGitReviewItem, matcher: RegExp) {
  for (const line of collectAddedLines(item)) {
    if (matcher.test(line.text)) {
      return {
        lineNumber: line.lineNumber,
        text: trimText(line.text),
      };
    }
  }

  return undefined;
}

function isLikelyTestFile(path: string) {
  return /(^|\/)(__tests__\/|.*\.(test|spec)\.[^/.]+$|.*Test\.[^/.]+$)/iu.test(path);
}

function isLikelySourceFile(path: string) {
  return /(^|\/)(src|app|apps|packages|kernel)\//iu.test(path);
}

function buildFindingId(path: string, suffix: string) {
  return `${path}::${suffix}`;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function extractJsonPayload(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text.trim();
}

function normalizeAiReviewSeverity(value: unknown): GitAiReviewSeverity | undefined {
  const normalized = normalizeOptionalText(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "critical" || normalized === "high" || normalized === "blocker") {
    return "high";
  }
  if (normalized === "medium" || normalized === "med" || normalized === "warning" || normalized === "warn") {
    return "medium";
  }
  if (normalized === "low" || normalized === "minor" || normalized === "info") {
    return "low";
  }
  return undefined;
}

function normalizeAiReviewCategory(value: unknown): GitAiReviewCategory | undefined {
  const normalized = normalizeOptionalText(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["security", "secret", "privacy", "credential"].includes(normalized)) {
    return "security";
  }
  if (["quality", "correctness", "bug", "performance", "reliability"].includes(normalized)) {
    return "quality";
  }
  if (["tests", "testing", "coverage"].includes(normalized)) {
    return "tests";
  }
  if (["maintainability", "readability", "architecture", "design"].includes(normalized)) {
    return "maintainability";
  }
  if (["diff", "change"].includes(normalized)) {
    return "diff";
  }
  return undefined;
}

function resolveReviewedBadgeText(language: LanguageCode) {
  return language === "en-US" ? "Reviewed" : "已审";
}

function resolveSeverityBadgeText(language: LanguageCode, severity: GitAiReviewSeverity) {
  if (language === "en-US") {
    return severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
  }
  return severity === "high" ? "高" : severity === "medium" ? "中" : "低";
}

function buildGitAiPrompt(input: {
  item: DesktopGitReviewItem;
  language: LanguageCode;
}) {
  const title = input.language === "en-US"
    ? "You are a senior code reviewer. Review one changed file and return JSON only."
    : "你是资深代码审查工程师。请审查单个变更文件，并且只返回 JSON。";
  const rules = input.language === "en-US"
    ? [
      "Only report issues with concrete evidence from the diff.",
      `Return at most ${MAX_AI_REVIEW_FINDINGS_PER_FILE} findings.`,
      "Ignore style-only nits and speculative comments.",
      "If no material issue exists, return {\"findings\":[]}",
      "severity must be one of high, medium, low.",
      "category must be one of security, quality, tests, maintainability, diff.",
    ]
    : [
      "只报告从 diff 中能明确看出的真实问题。",
      `最多返回 ${MAX_AI_REVIEW_FINDINGS_PER_FILE} 条问题。`,
      "不要输出纯风格建议，也不要做无证据的猜测。",
      "如果没有明显问题，返回 {\"findings\":[]}",
      "severity 只能是 high、medium、low。",
      "category 只能是 security、quality、tests、maintainability、diff。",
    ];
  const schema = "{\"findings\":[{\"title\":string,\"summary\":string,\"suggestion\":string,\"severity\":\"high|medium|low\",\"category\":\"security|quality|tests|maintainability|diff\",\"lineNumber\":number|null,\"evidence\":string|null}]}";

  return [
    title,
    ...rules.map((item) => `- ${item}`),
    input.language === "en-US" ? `JSON schema: ${schema}` : `JSON 结构: ${schema}`,
    `Path: ${input.item.path}`,
    `Status: ${input.item.status}`,
    `Additions: ${input.item.additions}`,
    `Deletions: ${input.item.deletions}`,
    input.item.previousPath ? `Previous path: ${input.item.previousPath}` : null,
    "Patch:",
    input.item.patch || input.item.after || input.item.before || (input.language === "en-US" ? "[no diff available]" : "[没有可用 diff]"),
  ].filter(Boolean).join("\n");
}

function buildWorkspaceAiPrompt(input: {
  path: string;
  result: DesktopWorkspaceFileContentResult;
  language: LanguageCode;
}) {
  const title = input.language === "en-US"
    ? "You are a senior code reviewer. Review one workspace file and return JSON only."
    : "你是资深代码审查工程师。请审查单个工作区文件，并且只返回 JSON。";
  const rules = input.language === "en-US"
    ? [
      "Only report issues with concrete evidence from the code.",
      `Return at most ${MAX_AI_REVIEW_FINDINGS_PER_FILE} findings.`,
      "Ignore stylistic cleanup and weak speculation.",
      "If no material issue exists, return {\"findings\":[]}",
      "severity must be one of high, medium, low.",
      "category must be one of security, quality, tests, maintainability, diff.",
    ]
    : [
      "只报告从代码里能明确看出的真实问题。",
      `最多返回 ${MAX_AI_REVIEW_FINDINGS_PER_FILE} 条问题。`,
      "忽略纯样式整理和证据不足的猜测。",
      "如果没有明显问题，返回 {\"findings\":[]}",
      "severity 只能是 high、medium、low。",
      "category 只能是 security、quality、tests、maintainability、diff。",
    ];
  const schema = "{\"findings\":[{\"title\":string,\"summary\":string,\"suggestion\":string,\"severity\":\"high|medium|low\",\"category\":\"security|quality|tests|maintainability|diff\",\"lineNumber\":number|null,\"evidence\":string|null}]}";
  const content = resolveWorkspacePreviewContent(input.result) ?? "";

  return [
    title,
    ...rules.map((item) => `- ${item}`),
    input.language === "en-US" ? `JSON schema: ${schema}` : `JSON 结构: ${schema}`,
    `Path: ${input.path}`,
    input.result.truncated
      ? (input.language === "en-US" ? "The content below may be truncated." : "下面的内容可能已经被截断。")
      : null,
    "Code:",
    content || (input.language === "en-US" ? "[no content available]" : "[没有可用内容]"),
  ].filter(Boolean).join("\n");
}

function parseAiReviewFindings(input: {
  content: string;
  path: string;
  language: LanguageCode;
  status: DesktopGitChangeStatus;
  additions: number;
  deletions: number;
}) {
  const payload = extractJsonPayload(input.content);
  const parsed = JSON.parse(payload) as unknown;
  const items = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === "object" && Array.isArray((parsed as { findings?: unknown }).findings)
      ? (parsed as { findings: unknown[] }).findings
      : []);

  return items
    .slice(0, MAX_AI_REVIEW_FINDINGS_PER_FILE)
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const title = normalizeOptionalText(raw.title)
        ?? (input.language === "en-US" ? "Potential issue in reviewed code" : "审查中发现潜在问题");
      const summary = normalizeOptionalText(raw.summary)
        ?? (input.language === "en-US" ? "The review found a concrete risk in this file." : "审查识别到该文件中存在明确风险。");
      const suggestion = normalizeOptionalText(raw.suggestion)
        ?? (input.language === "en-US" ? "Re-check the changed logic and confirm the intended behavior." : "重新检查相关变更逻辑，并确认目标行为。" );
      const severity = normalizeAiReviewSeverity(raw.severity) ?? "medium";
      const category = normalizeAiReviewCategory(raw.category) ?? "quality";
      const evidence = normalizeOptionalText(raw.evidence);
      const lineNumber = typeof raw.lineNumber === "number" && Number.isFinite(raw.lineNumber)
        ? Math.max(1, Math.floor(raw.lineNumber))
        : undefined;

      return {
        id: buildFindingId(input.path, `ai-${index + 1}`),
        path: input.path,
        title,
        summary,
        suggestion,
        severity,
        category,
        status: input.status,
        lineNumber,
        evidence,
        additions: input.additions,
        deletions: input.deletions,
      } satisfies GitAiReviewFinding;
    })
    .filter((item): item is GitAiReviewFinding => item !== null);
}

async function resolveReviewModelSelection(workspaceId: string): Promise<ReviewModelSelection> {
  const response = await getDesktopModelRuntimeSelectionSnapshot({
    scope: "workspace",
    workspaceId,
  });
  const selectedChannelId = response.item.resolvedSelection.channelId ?? response.item.defaultSelection.channelId;
  const selectedModelId = response.item.resolvedSelection.modelId ?? response.item.defaultSelection.modelId;

  if (!selectedChannelId || !selectedModelId) {
    throw new Error("No enabled AI model is configured for review.");
  }

  return {
    selectedChannelId,
    selectedModelId,
    label: selectedModelId,
  };
}

async function reviewGitItemWithAi(input: {
  workspaceId: string;
  selection: ReviewModelSelection;
  item: DesktopGitReviewItem;
  language: LanguageCode;
}) {
  const response = await executeDesktopAiOneShot({
    scope: "workspace",
    workspaceId: input.workspaceId,
    selectedChannelId: input.selection.selectedChannelId,
    selectedModelId: input.selection.selectedModelId,
    messages: [{
      role: "user",
      content: buildGitAiPrompt({
        item: input.item,
        language: input.language,
      }),
    }],
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return parseAiReviewFindings({
    content: response.content,
    path: input.item.path,
    language: input.language,
    status: input.item.status,
    additions: input.item.additions,
    deletions: input.item.deletions,
  });
}

async function reviewWorkspaceFileWithAi(input: {
  workspaceId: string;
  selection: ReviewModelSelection;
  path: string;
  result: DesktopWorkspaceFileContentResult;
  language: LanguageCode;
}) {
  const response = await executeDesktopAiOneShot({
    scope: "workspace",
    workspaceId: input.workspaceId,
    selectedChannelId: input.selection.selectedChannelId,
    selectedModelId: input.selection.selectedModelId,
    messages: [{
      role: "user",
      content: buildWorkspaceAiPrompt({
        path: input.path,
        result: input.result,
        language: input.language,
      }),
    }],
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return parseAiReviewFindings({
    content: response.content,
    path: input.path,
    language: input.language,
    status: "modified",
    additions: 0,
    deletions: 0,
  });
}

function resolveReviewNotice(input: {
  language: LanguageCode;
  mode: ReviewExecutionMode;
  modelLabel?: string;
  fallbackCount: number;
  fallbackReason?: string | null;
}) {
  const isEn = input.language === "en-US";
  const label = input.modelLabel ?? (isEn ? "configured model" : "当前模型");

  if (input.mode === "ai") {
    return isEn ? `Reviewed by AI (${label})` : `已使用 AI 评审（${label}）`;
  }
  if (input.mode === "mixed") {
    return isEn
      ? `Reviewed by AI (${label}); ${input.fallbackCount} files used rule fallback`
      : `已使用 AI 评审（${label}），${input.fallbackCount} 个文件回退到规则分析`;
  }
  if (input.fallbackReason) {
    return isEn
      ? `AI unavailable, using rule fallback: ${input.fallbackReason}`
      : `AI 不可用，已回退到规则分析：${input.fallbackReason}`;
  }
  return isEn ? "Using rule fallback review" : "当前使用规则分析";
}

function buildGitAiReviewFindings(input: {
  items: DesktopGitReviewItem[];
  language: LanguageCode;
}): GitAiReviewFinding[] {
  const isEn = input.language === "en-US";
  const hasChangedTests = input.items.some((item) => isLikelyTestFile(item.path));
  const findings: GitAiReviewFinding[] = [];

  for (const item of input.items) {
    const fileFindings: GitAiReviewFinding[] = [];
    const largeChange = item.additions + item.deletions;
    const skipPatchHeuristics = largeChange >= MAX_HEURISTIC_DIFF_CHURN || item.patch.length >= MAX_HEURISTIC_PATCH_LENGTH;

    if (item.status === "conflict") {
      fileFindings.push({
        id: buildFindingId(item.path, "conflict"),
        path: item.path,
        title: isEn ? "Merge conflict requires manual resolution" : "存在冲突，需要先手动收口",
        summary: isEn
          ? "The file is still in conflict state. Review comments before merge are not stable until the conflict is resolved."
          : "当前文件仍处于冲突状态，冲突未收口前，其它审查结论都不稳定。",
        suggestion: isEn ? "Resolve the conflict first, then rerun review on the final diff." : "先收敛冲突，再基于最终差异重新审查。",
        severity: "high",
        category: "diff",
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    const sensitiveMatch = skipPatchHeuristics
      ? undefined
      : findFirstAddedLineMatch(item, /(api[_-]?key|secret|token|password|authorization)/iu);
    if (sensitiveMatch) {
      fileFindings.push({
        id: buildFindingId(item.path, "secret"),
        path: item.path,
        title: isEn ? "Potential credential or secret exposure" : "疑似提交了敏感凭据或密钥",
        summary: isEn
          ? "Added content contains a credential-like token. This often indicates hardcoded secrets or unsafe logging."
          : "新增内容里出现了类似密钥或令牌的字段，常见于硬编码凭据或不安全日志。",
        suggestion: isEn ? "Move the value to environment/config indirection or redact it before commit." : "优先改成环境变量、配置引用或提交前脱敏。",
        severity: "high",
        category: "security",
        status: item.status,
        lineNumber: sensitiveMatch.lineNumber,
        evidence: sensitiveMatch.text,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    const debugMatch = skipPatchHeuristics
      ? undefined
      : findFirstAddedLineMatch(item, /\b(console\.(log|debug|warn)|debugger|fmt\.Println|print\()/u);
    if (debugMatch) {
      fileFindings.push({
        id: buildFindingId(item.path, "debug"),
        path: item.path,
        title: isEn ? "Debug output still present" : "疑似残留调试输出",
        summary: isEn
          ? "Debugging statements tend to leak runtime details or create noisy production logs."
          : "调试输出容易泄露运行时细节，也会把生产日志打脏。",
        suggestion: isEn ? "Remove the statement or route it through the intended logger with an explicit level." : "移除该语句，或改成明确级别的正式日志。",
        severity: "medium",
        category: "quality",
        status: item.status,
        lineNumber: debugMatch.lineNumber,
        evidence: debugMatch.text,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    const typeBypassMatch = skipPatchHeuristics
      ? undefined
      : findFirstAddedLineMatch(item, /(:\s*any\b|\bas\s+any\b|@ts-ignore\b)/u);
    if (typeBypassMatch) {
      fileFindings.push({
        id: buildFindingId(item.path, "type-bypass"),
        path: item.path,
        title: isEn ? "Type safety was bypassed" : "类型约束被绕过",
        summary: isEn
          ? "The diff introduces any or ts-ignore. This weakens review confidence and can hide downstream regressions."
          : "本次改动引入了 any 或 ts-ignore，会削弱类型检查对回归的拦截能力。",
        suggestion: isEn ? "Prefer a narrower type, a local parser, or an explicit interface instead of a blanket bypass." : "优先改成更窄的类型、局部解析或显式接口，而不是整体绕过。",
        severity: "medium",
        category: "quality",
        status: item.status,
        lineNumber: typeBypassMatch.lineNumber,
        evidence: typeBypassMatch.text,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    const todoMatch = skipPatchHeuristics
      ? undefined
      : findFirstAddedLineMatch(item, /\b(TODO|FIXME|XXX)\b/u);
    if (todoMatch) {
      fileFindings.push({
        id: buildFindingId(item.path, "todo"),
        path: item.path,
        title: isEn ? "Temporary note was committed" : "提交中包含临时待办标记",
        summary: isEn
          ? "TODO or FIXME often indicates unfinished logic or a known gap that should be made explicit before merge."
          : "TODO 或 FIXME 往往意味着逻辑尚未闭环，合并前最好明确是否允许带着缺口进入主干。",
        suggestion: isEn ? "Either close the gap now or convert it into an explicit tracked task with clear ownership." : "要么现在补齐，要么转成带责任人的明确跟踪项。",
        severity: "medium",
        category: "maintainability",
        status: item.status,
        lineNumber: todoMatch.lineNumber,
        evidence: todoMatch.text,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    if (largeChange >= 180) {
      fileFindings.push({
        id: buildFindingId(item.path, "large-diff"),
        path: item.path,
        title: isEn ? "Large diff deserves chunked review" : "单文件改动过大，建议分块复查",
        summary: isEn
          ? "This file carries a large amount of churn, which raises the chance of mixed concerns or missed regressions."
          : "这个文件的改动体量较大，更容易混入多类变更，也更容易漏掉边界回归。",
        suggestion: isEn ? "Review the file by hunk or function boundary and confirm whether it should be split into smaller patches." : "建议按 hunk 或函数边界逐块复查，并评估是否值得拆成更小的提交。",
        severity: "medium",
        category: "maintainability",
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    if (isLikelySourceFile(item.path) && largeChange >= 80 && !hasChangedTests) {
      fileFindings.push({
        id: buildFindingId(item.path, "tests"),
        path: item.path,
        title: isEn ? "Behavior changed without nearby test evidence" : "行为改动较大，但未看到测试信号",
        summary: isEn
          ? "The current review set changes source code substantially, but there are no changed test files in the same batch."
          : "当前提交对源码改动较大，但同一批改动里没有看到测试文件变化。",
        suggestion: isEn ? "Confirm whether existing tests already cover the new path. If not, add at least one targeted regression case." : "确认现有测试是否已经覆盖；如果没有，至少补一条针对性的回归用例。",
        severity: "medium",
        category: "tests",
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    if (fileFindings.length === 0) {
      fileFindings.push({
        id: buildFindingId(item.path, "manual"),
        path: item.path,
        title: isEn ? "Manual review suggested" : "建议人工复核",
        summary: isEn
          ? "No high-signal issue was inferred automatically, but this file still deserves a quick architecture and boundary check."
          : "当前没有自动命中的高信号问题，但仍建议快速确认架构边界和调用关系。",
        suggestion: isEn ? "Check exported APIs, callsites, config references, and the minimal execution path touched by this diff." : "重点确认导出接口、调用方、配置引用和本次差异触达的最小执行路径。",
        severity: "low",
        category: "diff",
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    findings.push(...fileFindings);
  }

  const severityRank: Record<GitAiReviewSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return findings.sort((left, right) => (
    severityRank[left.severity] - severityRank[right.severity]
      || right.additions + right.deletions - (left.additions + left.deletions)
      || comparePathLabels(left.path, right.path)
      || comparePathLabels(left.title, right.title)
  ));
}

function collectContentLines(content: string) {
  return content.replace(/\r\n?/gu, "\n").split("\n").map((text, index) => ({
    lineNumber: index + 1,
    text,
  }));
}

function findFirstContentLineMatch(lines: Array<{ lineNumber: number; text: string }>, matcher: RegExp) {
  for (const line of lines) {
    if (matcher.test(line.text)) {
      return {
        lineNumber: line.lineNumber,
        text: trimText(line.text),
      };
    }
  }

  return undefined;
}

function resolveWorkspaceAnalysisContent(result: DesktopWorkspaceFileContentResult) {
  if (result.binary) {
    return "";
  }

  if (!result.truncated) {
    return result.content;
  }

  return [
    result.previewHeadContent?.trimEnd() ?? result.content.trimEnd(),
    result.previewTailContent?.trimStart() ?? "",
  ].filter(Boolean).join("\n...\n");
}

function buildWorkspaceFindingId(path: string, suffix: string) {
  return `workspace:${path}::${suffix}`;
}

function buildWorkspaceAiReviewFindings(input: {
  path: string;
  result: DesktopWorkspaceFileContentResult;
  language: LanguageCode;
}): GitAiReviewFinding[] {
  const isEn = input.language === "en-US";

  if (input.result.binary) {
    return [{
      id: buildWorkspaceFindingId(input.path, "binary"),
      path: input.path,
      title: isEn ? "Binary file requires manual inspection" : "二进制文件需要人工检查",
      summary: isEn ? "This file is binary and cannot be scanned reliably with inline text heuristics." : "当前文件是二进制内容，无法用文本启发式可靠扫描。",
      suggestion: isEn ? "Review the source artifact or generated output manually." : "建议结合源文件或产物上下文进行人工复核。",
      severity: "low",
      category: "diff",
      status: "modified",
      additions: 0,
      deletions: 0,
    }];
  }

  const content = resolveWorkspaceAnalysisContent(input.result);
  if (content.length >= MAX_WORKSPACE_ANALYSIS_CONTENT_LENGTH) {
    return [{
      id: buildWorkspaceFindingId(input.path, "oversized"),
      path: input.path,
      title: isEn ? "File is too large for inline project analysis" : "文件过大，已跳过内联项目分析",
      summary: isEn ? "Scanning the entire file inline would be too expensive for the current UI pass." : "在当前界面里全量扫描这个文件会带来过高的开销。",
      suggestion: isEn ? "Inspect this file by module boundary or narrow the scope before requesting deeper analysis." : "建议按模块边界拆开检查，或缩小范围后再做更深的分析。",
      severity: "medium",
      category: "diff",
      status: "modified",
      additions: 0,
      deletions: 0,
    }];
  }

  const lines = collectContentLines(content);
  const findings: GitAiReviewFinding[] = [];
  const sensitiveMatch = findFirstContentLineMatch(lines, /(api[_-]?key|secret|token|password|authorization)/iu);
  if (sensitiveMatch) {
    findings.push({
      id: buildWorkspaceFindingId(input.path, "secret"),
      path: input.path,
      title: isEn ? "Potential credential or secret exposure" : "疑似暴露凭据或密钥",
      summary: isEn ? "The file contains credential-like tokens or headers and should be checked for hardcoded secrets." : "文件里出现了类似凭据或授权头的信息，需要确认是否存在硬编码密钥。",
      suggestion: isEn ? "Move sensitive values behind environment or configuration indirection." : "把敏感值移到环境变量或配置引用里，不要直接写死在代码中。",
      severity: "high",
      category: "security",
      status: "modified",
      lineNumber: sensitiveMatch.lineNumber,
      evidence: sensitiveMatch.text,
      additions: 0,
      deletions: 0,
    });
  }

  const debugMatch = findFirstContentLineMatch(lines, /\b(console\.(log|debug|warn)|debugger|fmt\.Println|print\()/u);
  if (debugMatch) {
    findings.push({
      id: buildWorkspaceFindingId(input.path, "debug"),
      path: input.path,
      title: isEn ? "Debug output still present" : "存在调试输出",
      summary: isEn ? "The file still contains debugging statements that may leak runtime details or pollute logs." : "文件里仍有调试语句，容易泄露运行时细节或污染日志。",
      suggestion: isEn ? "Remove the statement or move it behind a proper logger with an explicit level." : "移除该语句，或改成带明确级别的正式日志。",
      severity: "medium",
      category: "quality",
      status: "modified",
      lineNumber: debugMatch.lineNumber,
      evidence: debugMatch.text,
      additions: 0,
      deletions: 0,
    });
  }

  const typeBypassMatch = findFirstContentLineMatch(lines, /(:\s*any\b|\bas\s+any\b|@ts-ignore\b)/u);
  if (typeBypassMatch) {
    findings.push({
      id: buildWorkspaceFindingId(input.path, "type-bypass"),
      path: input.path,
      title: isEn ? "Type safety was bypassed" : "类型约束被绕过",
      summary: isEn ? "This file uses any or ts-ignore and deserves a tighter contract." : "这个文件里存在 any 或 ts-ignore，建议收紧类型边界。",
      suggestion: isEn ? "Replace blanket bypasses with explicit interfaces or narrower local parsing." : "优先改成显式接口、局部解析或更窄的类型，而不是整体绕过。",
      severity: "medium",
      category: "quality",
      status: "modified",
      lineNumber: typeBypassMatch.lineNumber,
      evidence: typeBypassMatch.text,
      additions: 0,
      deletions: 0,
    });
  }

  const todoMatch = findFirstContentLineMatch(lines, /\b(TODO|FIXME|XXX)\b/u);
  if (todoMatch) {
    findings.push({
      id: buildWorkspaceFindingId(input.path, "todo"),
      path: input.path,
      title: isEn ? "Temporary note was committed" : "文件里存在临时待办标记",
      summary: isEn ? "TODO or FIXME indicates unresolved work that should be validated before relying on this file." : "TODO 或 FIXME 表明这里还有未收口的工作，使用前需要确认边界。",
      suggestion: isEn ? "Either close the gap or turn it into a clearly tracked follow-up task." : "要么现在补齐，要么把它转成明确跟踪的后续任务。",
      severity: "medium",
      category: "maintainability",
      status: "modified",
      lineNumber: todoMatch.lineNumber,
      evidence: todoMatch.text,
      additions: 0,
      deletions: 0,
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: buildWorkspaceFindingId(input.path, "manual"),
      path: input.path,
      title: isEn ? "Manual review suggested" : "建议人工复核",
      summary: isEn ? "No high-signal issue was inferred automatically, but the file still merits a quick architecture and boundary check." : "当前没有自动命中的高信号问题，但仍建议快速确认架构边界和调用关系。",
      suggestion: isEn ? "Review exports, callers, config references, and the minimum execution path for this file." : "重点确认导出、调用方、配置引用和最小执行路径是否闭环。",
      severity: "low",
      category: "diff",
      status: "modified",
      additions: 0,
      deletions: 0,
    });
  }

  return findings;
}

function resolveWorkspacePreviewContent(result: DesktopWorkspaceFileContentResult) {
  if (result.binary) {
    return null;
  }

  if (!result.truncated) {
    return result.content;
  }

  return [
    result.previewHeadContent?.trimEnd() ?? result.content.trimEnd(),
    result.previewTailContent?.trimStart() ?? "",
  ].filter(Boolean).join("\n...\n");
}

function resolveFindingSummaryByPath(input: {
  findings: GitAiReviewFinding[];
  reviewedPaths?: readonly string[];
}) {
  const summaries = new Map<string, GitAiReviewPathSummary>();

  for (const path of input.reviewedPaths ?? []) {
    summaries.set(path, {
      reviewed: true,
      findingCount: 0,
    });
  }

  for (const finding of input.findings) {
    const current = summaries.get(finding.path);
    if (!current) {
      summaries.set(finding.path, {
        reviewed: true,
        findingCount: 1,
        highestSeverity: finding.severity,
      });
      continue;
    }

    current.findingCount += 1;
    if (!current.highestSeverity) {
      current.highestSeverity = finding.severity;
      continue;
    }

    if (finding.severity === "high" || (finding.severity === "medium" && current.highestSeverity === "low")) {
      current.highestSeverity = finding.severity;
    }
  }

  return summaries;
}

function renderReviewMarkers(input: {
  summary?: GitAiReviewPathSummary;
  language: LanguageCode;
}) {
  if (!input.summary?.reviewed) {
    return null;
  }

  if (!input.summary.highestSeverity) {
    return <span className="git-ai-review-tree-badge is-reviewed">{resolveReviewedBadgeText(input.language)}</span>;
  }

  return (
    <>
      <span className="git-ai-review-tree-badge is-reviewed">AI</span>
      <span className={`git-ai-review-tree-badge is-${input.summary.highestSeverity}`}>{resolveSeverityBadgeText(input.language, input.summary.highestSeverity)}</span>
      <span className="git-ai-review-tree-badge is-count">{input.summary.findingCount}</span>
    </>
  );
}

type GitReviewFallbackSource = Pick<DesktopGitChangeItem, "path" | "previousPath" | "status" | "additions" | "deletions">;

function buildGitReviewFallbackItem(item: GitReviewFallbackSource): DesktopGitReviewItem {
  return {
    path: item.path,
    previousPath: item.previousPath,
    status: item.status,
    additions: item.additions,
    deletions: item.deletions,
    before: "",
    after: "",
    patch: "",
  };
}

function buildCommitReviewFallbackItem(item: DesktopGitHistoryDetailFile): DesktopGitReviewItem {
  return buildGitReviewFallbackItem(item);
}

function buildCommitTreeEntries(files: DesktopGitHistoryDetailFile[]): CommitTreeEntry[] {
  return files
    .map((file) => {
      const item: DesktopGitChangeItem = {
        path: file.path,
        previousPath: file.previousPath,
        status: file.status,
        stagedStatus: file.statusCode,
        additions: file.additions,
        deletions: file.deletions,
      };

      return {
        path: file.path,
        previousPath: file.previousPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        item,
        file,
      };
    })
    .sort((left, right) => comparePathLabels(left.path, right.path));
}

function buildInitialCollapsedDirectories(input: {
  nodes: GitChangeTreeNode[];
  activePath?: string;
  collapseAll: boolean;
}) {
  const next: Record<string, boolean> = {};
  const visit = (node: GitChangeTreeNode) => {
    if (node.type !== "directory") {
      return;
    }
    const keepOpen = input.activePath ? input.activePath === node.path || input.activePath.startsWith(`${node.path}/`) : false;
    next[node.path] = input.collapseAll && !keepOpen;
    node.children.forEach(visit);
  };
  input.nodes.forEach(visit);
  return next;
}

function resolveStatusGlyph(status: DesktopGitChangeStatus) {
  if (status === "added") {
    return "A";
  }
  if (status === "deleted") {
    return "D";
  }
  if (status === "renamed") {
    return "R";
  }
  if (status === "conflict") {
    return "!";
  }
  if (status === "untracked") {
    return "U";
  }
  return "M";
}

function resolveIndentClass(level: number) {
  return `is-level-${Math.min(level, 8)}`;
}

function matchesCommitSearch(item: DesktopGitHistoryItem, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true;
  }

  return [
    item.hash,
    item.shortHash,
    item.subject,
    item.authorName,
    item.authorEmail,
    item.authoredRelative,
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function sanitizeMarkdownReportFileName(value: string) {
  const segments = value.replaceAll("\\", "/").split("/").filter(Boolean);
  const baseName = segments[segments.length - 1] ?? value;
  const cleaned = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");

  return cleaned || "workspace";
}

function buildMarkdownReportStamp() {
  return new Date().toISOString().replace(/[:]/gu, "-").replace(/\.\d{3}Z$/u, "Z");
}

function escapeMarkdownInline(value: string) {
  return value.replace(/\\/gu, "\\\\").replace(/([`*_{}\[\]()#+.!|>~-])/gu, "\\$1");
}

function appendMarkdownFinding(lines: string[], input: {
  finding: GitAiReviewFinding;
  copy: GitAiReviewCopy;
  index: number;
  statusText: (status: DesktopGitChangeStatus) => string;
  language: LanguageCode;
}) {
  const isEn = input.language === "en-US";
  lines.push(`### ${input.index}. ${escapeMarkdownInline(input.finding.title)}`);
  lines.push(`- ${isEn ? "Severity" : "严重度"}: ${input.copy.severityText(input.finding.severity)}`);
  lines.push(`- ${isEn ? "Category" : "类型"}: ${input.copy.categoryText(input.finding.category)}`);
  lines.push(`- ${isEn ? "Status" : "状态"}: ${input.statusText(input.finding.status)}`);
  if (input.finding.lineNumber) {
    lines.push(`- ${isEn ? "Line" : "行号"}: ${input.finding.lineNumber}`);
  }
  lines.push(`- ${isEn ? "Summary" : "摘要"}: ${input.finding.summary}`);
  lines.push(`- ${isEn ? "Suggestion" : "建议"}: ${input.finding.suggestion}`);
  if (input.finding.evidence) {
    lines.push(`- ${isEn ? "Evidence" : "依据"}:`);
    lines.push("```");
    lines.push(input.finding.evidence);
    lines.push("```");
  }
  lines.push("");
}

function buildCommitMarkdownReport(input: {
  detail: DesktopGitHistoryDetailResult;
  itemsByPath: Record<string, DesktopGitReviewItem>;
  findings: GitAiReviewFinding[];
  findingsByPath: Map<string, GitAiReviewFinding[]>;
  copy: GitAiReviewCopy;
  statusText: (status: DesktopGitChangeStatus) => string;
  language: LanguageCode;
}) {
  const isEn = input.language === "en-US";
  const highCount = input.findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = input.findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = input.findings.filter((finding) => finding.severity === "low").length;
  const lines: string[] = [];

  lines.push(`# ${isEn ? "Commit AI Review Report" : "提交 AI 审查报告"}`);
  lines.push("");
  lines.push(`- ${isEn ? "Generated at" : "生成时间"}: ${new Date().toISOString()}`);
  lines.push(`- ${isEn ? "Workspace" : "工作区"}: ${input.detail.rootPath}`);
  lines.push(`- ${isEn ? "Commit" : "提交"}: ${input.detail.hash}`);
  lines.push(`- ${isEn ? "Subject" : "标题"}: ${input.detail.subject}`);
  lines.push(`- ${isEn ? "Changed files" : "变更文件"}: ${input.detail.files.length}`);
  lines.push(`- ${isEn ? "Diagnostics" : "诊断总数"}: ${input.findings.length}`);
  lines.push(`- ${isEn ? "High / Medium / Low" : "高 / 中 / 低"}: ${highCount} / ${mediumCount} / ${lowCount}`);
  lines.push("");
  lines.push(`## ${isEn ? "Files" : "文件列表"}`);
  lines.push("");

  for (const file of [...input.detail.files].sort((left, right) => comparePathLabels(left.path, right.path))) {
    const item = input.itemsByPath[file.path] ?? buildCommitReviewFallbackItem(file);
    const fileFindings = input.findingsByPath.get(file.path) ?? [];
    lines.push(`## \`${file.path}\``);
    lines.push("");
    lines.push(`- ${isEn ? "Status" : "状态"}: ${input.statusText(item.status)}`);
    if (item.previousPath) {
      lines.push(`- ${isEn ? "Renamed from" : "重命名自"}: ${item.previousPath}`);
    }
    lines.push(`- ${isEn ? "Patch churn" : "变更规模"}: +${item.additions} / -${item.deletions}`);
    lines.push(`- ${isEn ? "Diagnostics" : "诊断"}: ${fileFindings.length}`);
    lines.push("");

    if (fileFindings.length === 0) {
      lines.push(`> ${input.copy.noDiagnostics}`);
      lines.push("");
      continue;
    }

    fileFindings.forEach((finding, index) => {
      appendMarkdownFinding(lines, {
        finding,
        copy: input.copy,
        index: index + 1,
        statusText: input.statusText,
        language: input.language,
      });
    });
  }

  return lines.join("\n").trimEnd() + "\n";
}

function buildStagedMarkdownReport(input: {
  rootPath: string;
  branch?: string;
  items: GitSectionEntry[];
  itemsByPath: Record<string, DesktopGitReviewItem>;
  findings: GitAiReviewFinding[];
  findingsByPath: Map<string, GitAiReviewFinding[]>;
  copy: GitAiReviewCopy;
  statusText: (status: DesktopGitChangeStatus) => string;
  language: LanguageCode;
}) {
  const isEn = input.language === "en-US";
  const highCount = input.findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = input.findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = input.findings.filter((finding) => finding.severity === "low").length;
  const lines: string[] = [];

  lines.push(`# ${isEn ? "Staged AI Review Report" : "当前暂存 AI 审查报告"}`);
  lines.push("");
  lines.push(`- ${isEn ? "Generated at" : "生成时间"}: ${new Date().toISOString()}`);
  lines.push(`- ${isEn ? "Workspace" : "工作区"}: ${input.rootPath}`);
  if (input.branch) {
    lines.push(`- ${isEn ? "Branch" : "分支"}: ${input.branch}`);
  }
  lines.push(`- ${isEn ? "Scope" : "范围"}: ${isEn ? "Staged but uncommitted changes" : "已暂存未提交的变更"}`);
  lines.push(`- ${isEn ? "Changed files" : "变更文件"}: ${input.items.length}`);
  lines.push(`- ${isEn ? "Diagnostics" : "诊断总数"}: ${input.findings.length}`);
  lines.push(`- ${isEn ? "High / Medium / Low" : "高 / 中 / 低"}: ${highCount} / ${mediumCount} / ${lowCount}`);
  lines.push("");
  lines.push(`## ${isEn ? "Files" : "文件列表"}`);
  lines.push("");

  for (const entry of [...input.items].sort((left, right) => comparePathLabels(left.path, right.path))) {
    const item = input.itemsByPath[entry.path] ?? buildGitReviewFallbackItem(entry.item);
    const fileFindings = input.findingsByPath.get(entry.path) ?? [];
    lines.push(`## \`${entry.path}\``);
    lines.push("");
    lines.push(`- ${isEn ? "Status" : "状态"}: ${input.statusText(item.status)}`);
    if (item.previousPath) {
      lines.push(`- ${isEn ? "Renamed from" : "重命名自"}: ${item.previousPath}`);
    }
    lines.push(`- ${isEn ? "Patch churn" : "变更规模"}: +${item.additions} / -${item.deletions}`);
    lines.push(`- ${isEn ? "Diagnostics" : "诊断"}: ${fileFindings.length}`);
    lines.push("");

    if (fileFindings.length === 0) {
      lines.push(`> ${input.copy.noDiagnostics}`);
      lines.push("");
      continue;
    }

    fileFindings.forEach((finding, index) => {
      appendMarkdownFinding(lines, {
        finding,
        copy: input.copy,
        index: index + 1,
        statusText: input.statusText,
        language: input.language,
      });
    });
  }

  return lines.join("\n").trimEnd() + "\n";
}

function buildWorkspaceMarkdownReport(input: {
  rootPath: string;
  findingsByPath: Map<string, GitAiReviewFinding[]>;
  resultsByPath: Record<string, DesktopWorkspaceFileContentResult>;
  copy: GitAiReviewCopy;
  statusText: (status: DesktopGitChangeStatus) => string;
  language: LanguageCode;
}) {
  const isEn = input.language === "en-US";
  const analyzedPaths = Object.keys(input.resultsByPath).sort(comparePathLabels);
  const findings = [...input.findingsByPath.values()].flat();
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = findings.filter((finding) => finding.severity === "low").length;
  const lines: string[] = [];

  lines.push(`# ${isEn ? "Project Analysis Report" : "全项目分析报告"}`);
  lines.push("");
  lines.push(`- ${isEn ? "Generated at" : "生成时间"}: ${new Date().toISOString()}`);
  lines.push(`- ${isEn ? "Workspace" : "工作区"}: ${input.rootPath}`);
  lines.push(`- ${isEn ? "Analyzed files" : "已分析文件"}: ${analyzedPaths.length}`);
  lines.push(`- ${isEn ? "Diagnostics" : "诊断总数"}: ${findings.length}`);
  lines.push(`- ${isEn ? "High / Medium / Low" : "高 / 中 / 低"}: ${highCount} / ${mediumCount} / ${lowCount}`);
  lines.push(`- ${isEn ? "Scope note" : "范围说明"}: ${input.copy.workspaceReportPartialHint}`);
  lines.push("");

  for (const path of analyzedPaths) {
    const fileFindings = input.findingsByPath.get(path) ?? [];
    const result = input.resultsByPath[path];
    lines.push(`## \`${path}\``);
    lines.push("");
    lines.push(`- ${isEn ? "Preview" : "预览"}: ${result.binary ? (isEn ? "Binary" : "二进制") : (result.truncated ? input.copy.workspacePreviewTruncated : (isEn ? "Full text" : "完整文本"))}`);
    lines.push(`- ${isEn ? "Diagnostics" : "诊断"}: ${fileFindings.length}`);
    lines.push("");

    if (fileFindings.length === 0) {
      lines.push(`> ${input.copy.noDiagnostics}`);
      lines.push("");
      continue;
    }

    fileFindings.forEach((finding, index) => {
      appendMarkdownFinding(lines, {
        finding,
        copy: input.copy,
        index: index + 1,
        statusText: input.statusText,
        language: input.language,
      });
    });
  }

  return lines.join("\n").trimEnd() + "\n";
}

function downloadMarkdownReport(fileName: string, content: string) {
  if (typeof document === "undefined" || typeof Blob === "undefined") {
    throw new Error("Markdown download is unavailable in the current runtime.");
  }
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Object URL is unavailable in the current runtime.");
  }

  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

async function listWorkspaceAnalysisFiles(input: {
  workspaceId: string;
  isCancelled: () => boolean;
}) {
  const queue = [""];
  const seenDirectories = new Set<string>([""]);
  const files: string[] = [];

  while (queue.length > 0) {
    if (input.isCancelled()) {
      return [];
    }

    const directory = queue.shift() ?? "";
    const result = await getDesktopWorkspaceFileTree(input.workspaceId, directory || undefined);
    for (const node of result.nodes) {
      if (node.ignored) {
        continue;
      }
      if (node.type === "directory") {
        if (!seenDirectories.has(node.path)) {
          seenDirectories.add(node.path);
          queue.push(node.path);
        }
        continue;
      }
      files.push(node.path);
    }
  }

  return files.sort(comparePathLabels);
}

async function loadWorkspaceAnalysisResults(input: {
  workspaceId: string;
  filePaths: string[];
  language: LanguageCode;
  aiSelection: ReviewModelSelection | null;
  isCancelled: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}): Promise<ReviewLoadOutput<DesktopWorkspaceFileContentResult>> {
  const results: Record<string, DesktopWorkspaceFileContentResult> = {};
  const findingsByPath: Record<string, GitAiReviewFinding[]> = {};
  const reviewedPaths: string[] = [];
  let completed = 0;
  let failed = 0;
  let firstError: string | null = null;
  let aiSuccessCount = 0;
  let fallbackCount = 0;
  let nextIndex = 0;
  const workerCount = Math.min(
    input.aiSelection ? AI_REVIEW_WORKER_COUNT : 6,
    Math.max(input.filePaths.length, 1),
  );

  async function worker() {
    while (!input.isCancelled()) {
      const currentIndex = nextIndex;
      if (currentIndex >= input.filePaths.length) {
        return;
      }
      nextIndex += 1;
      const path = input.filePaths[currentIndex];
      try {
        const result = await getDesktopWorkspaceFileContent(input.workspaceId, path);
        results[path] = result;
        reviewedPaths.push(path);
        if (input.aiSelection) {
          try {
            findingsByPath[path] = await reviewWorkspaceFileWithAi({
              workspaceId: input.workspaceId,
              selection: input.aiSelection,
              path,
              result,
              language: input.language,
            });
            aiSuccessCount += 1;
          } catch {
            findingsByPath[path] = buildWorkspaceAiReviewFindings({
              path,
              result,
              language: input.language,
            });
            fallbackCount += 1;
          }
        } else {
          findingsByPath[path] = buildWorkspaceAiReviewFindings({
            path,
            result,
            language: input.language,
          });
          fallbackCount += 1;
        }
      } catch (error) {
        failed += 1;
        firstError ??= normalizeError(error);
      } finally {
        completed += 1;
        input.onProgress?.(completed, input.filePaths.length);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const mode: ReviewExecutionMode = input.aiSelection
    ? (fallbackCount > 0 ? (aiSuccessCount > 0 ? "mixed" : "heuristic") : "ai")
    : "heuristic";

  return {
    results,
    findingsByPath,
    reviewedPaths,
    failed,
    firstError,
    mode,
    modelLabel: input.aiSelection?.label,
    fallbackCount,
  };
}

async function loadCommitReviewResults(input: {
  workspaceId: string;
  baseRef: string;
  headRef: string;
  files: DesktopGitHistoryDetailFile[];
  language: LanguageCode;
  aiSelection: ReviewModelSelection | null;
  isCancelled: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}): Promise<ReviewLoadOutput<DesktopGitReviewItem>> {
  const results: Record<string, DesktopGitReviewItem> = {};
  const findingsByPath: Record<string, GitAiReviewFinding[]> = {};
  const reviewedPaths: string[] = [];
  let completed = 0;
  let failed = 0;
  let firstError: string | null = null;
  let aiSuccessCount = 0;
  let fallbackCount = 0;
  let nextIndex = 0;
  const workerCount = Math.min(
    input.aiSelection ? AI_REVIEW_WORKER_COUNT : 6,
    Math.max(input.files.length, 1),
  );

  async function worker() {
    while (!input.isCancelled()) {
      const currentIndex = nextIndex;
      if (currentIndex >= input.files.length) {
        return;
      }
      nextIndex += 1;
      const file = input.files[currentIndex];
      try {
        const result = await getDesktopGitReviewDetail(input.workspaceId, {
          path: file.path,
          baseRef: input.baseRef,
          headRef: input.headRef,
        });
        const reviewItem = result.item ?? buildCommitReviewFallbackItem(file);
        results[file.path] = reviewItem;
        reviewedPaths.push(file.path);
        if (input.aiSelection) {
          try {
            findingsByPath[file.path] = await reviewGitItemWithAi({
              workspaceId: input.workspaceId,
              selection: input.aiSelection,
              item: reviewItem,
              language: input.language,
            });
            aiSuccessCount += 1;
          } catch {
            findingsByPath[file.path] = buildGitAiReviewFindings({
              items: [reviewItem],
              language: input.language,
            });
            fallbackCount += 1;
          }
        } else {
          findingsByPath[file.path] = buildGitAiReviewFindings({
            items: [reviewItem],
            language: input.language,
          });
          fallbackCount += 1;
        }
      } catch (error) {
        failed += 1;
        firstError ??= normalizeError(error);
        const reviewItem = buildCommitReviewFallbackItem(file);
        results[file.path] = reviewItem;
        reviewedPaths.push(file.path);
        findingsByPath[file.path] = buildGitAiReviewFindings({
          items: [reviewItem],
          language: input.language,
        });
        fallbackCount += 1;
      } finally {
        completed += 1;
        input.onProgress?.(completed, input.files.length);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const mode: ReviewExecutionMode = input.aiSelection
    ? (fallbackCount > 0 ? (aiSuccessCount > 0 ? "mixed" : "heuristic") : "ai")
    : "heuristic";

  return {
    results,
    findingsByPath,
    reviewedPaths,
    failed,
    firstError,
    mode,
    modelLabel: input.aiSelection?.label,
    fallbackCount,
  };
}

async function loadStagedReviewResults(input: {
  workspaceId: string;
  files: GitSectionEntry[];
  language: LanguageCode;
  aiSelection: ReviewModelSelection | null;
  isCancelled: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}): Promise<ReviewLoadOutput<DesktopGitReviewItem>> {
  const results: Record<string, DesktopGitReviewItem> = {};
  const findingsByPath: Record<string, GitAiReviewFinding[]> = {};
  const reviewedPaths: string[] = [];
  let completed = 0;
  let failed = 0;
  let firstError: string | null = null;
  let aiSuccessCount = 0;
  let fallbackCount = 0;
  let nextIndex = 0;
  const workerCount = Math.min(
    input.aiSelection ? AI_REVIEW_WORKER_COUNT : 6,
    Math.max(input.files.length, 1),
  );

  async function worker() {
    while (!input.isCancelled()) {
      const currentIndex = nextIndex;
      if (currentIndex >= input.files.length) {
        return;
      }
      nextIndex += 1;
      const file = input.files[currentIndex];
      try {
        const result = await getDesktopGitReviewDetail(input.workspaceId, {
          path: file.path,
          scope: "staged",
        });
        const reviewItem = result.item ?? buildGitReviewFallbackItem(file.item);
        results[file.path] = reviewItem;
        reviewedPaths.push(file.path);
        if (input.aiSelection) {
          try {
            findingsByPath[file.path] = await reviewGitItemWithAi({
              workspaceId: input.workspaceId,
              selection: input.aiSelection,
              item: reviewItem,
              language: input.language,
            });
            aiSuccessCount += 1;
          } catch {
            findingsByPath[file.path] = buildGitAiReviewFindings({
              items: [reviewItem],
              language: input.language,
            });
            fallbackCount += 1;
          }
        } else {
          findingsByPath[file.path] = buildGitAiReviewFindings({
            items: [reviewItem],
            language: input.language,
          });
          fallbackCount += 1;
        }
      } catch (error) {
        failed += 1;
        firstError ??= normalizeError(error);
        const reviewItem = buildGitReviewFallbackItem(file.item);
        results[file.path] = reviewItem;
        reviewedPaths.push(file.path);
        findingsByPath[file.path] = buildGitAiReviewFindings({
          items: [reviewItem],
          language: input.language,
        });
        fallbackCount += 1;
      } finally {
        completed += 1;
        input.onProgress?.(completed, input.files.length);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const mode: ReviewExecutionMode = input.aiSelection
    ? (fallbackCount > 0 ? (aiSuccessCount > 0 ? "mixed" : "heuristic") : "ai")
    : "heuristic";

  return {
    results,
    findingsByPath,
    reviewedPaths,
    failed,
    firstError,
    mode,
    modelLabel: input.aiSelection?.label,
    fallbackCount,
  };
}

type GitTreeProps = {
  nodes: GitChangeTreeNode[];
  collapsedDirectories: Record<string, boolean>;
  activePath?: string;
  language: LanguageCode;
  summariesByPath: Map<string, GitAiReviewPathSummary>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  level?: number;
};

function GitTree(props: GitTreeProps) {
  const level = props.level ?? 0;

  return (
    <div className={level > 0 ? "git-page-change-tree is-nested" : "git-page-change-tree"}>
      {props.nodes.map((node) => {
        if (node.type === "directory") {
          const collapsed = props.collapsedDirectories[node.path];
          return (
            <div key={node.path} className="git-page-change-tree-group">
              <button
                type="button"
                className={`git-page-change-tree-row is-directory ${resolveIndentClass(level)}`}
                onClick={() => props.onToggleDirectory(node.path)}
              >
                <span className={collapsed ? "git-page-change-tree-caret" : "git-page-change-tree-caret is-open"}>
                  <DownOutlined />
                </span>
                <WorkspaceFileIcon path={node.path} className="git-page-review-file-icon" isDirectory expanded={!collapsed} />
                <span className="git-page-change-tree-label">{node.name}</span>
                <span className="git-page-change-tree-count">{node.fileCount}</span>
              </button>
              {!collapsed && node.children.length > 0 ? (
                <GitTree {...props} nodes={node.children} level={level + 1} />
              ) : null}
            </div>
          );
        }

        const summary = props.summariesByPath.get(node.path);
        const statusClassName = resolveWorkspaceReviewStatusClass(node.entry.status);
        const isActive = node.path === props.activePath;

        return (
          <div key={node.path} className={isActive ? "git-page-change-tree-row is-file is-active" : "git-page-change-tree-row is-file"}>
            <button
              type="button"
              className={`git-page-change-tree-main ${resolveIndentClass(level)}`}
              onClick={() => props.onSelectFile(node.path)}
            >
              <span className="git-page-change-tree-caret is-placeholder" />
              <WorkspaceFileIcon path={node.path} className="git-page-review-file-icon" />
              <span className="git-page-change-tree-label">{node.name}</span>
            </button>
            <div className="git-page-change-tree-utility git-ai-review-tree-utility">
              <div className="git-page-change-tree-side">
                <span className={`git-page-change-tree-status git-page-review-status ${statusClassName}`}>
                  {resolveStatusGlyph(node.entry.status)}
                </span>
                {renderReviewMarkers({
                  summary,
                  language: props.language,
                })}
                <WorkspaceDiffChanges className="git-page-change-tree-diff" changes={node.entry.item} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type WorkspaceTreeProps = {
  path: string;
  nodesByDir: Record<string, DesktopWorkspaceFileTreeNode[]>;
  expandedByPath: Record<string, boolean>;
  loadingByPath: Record<string, boolean>;
  activePath?: string;
  language: LanguageCode;
  allowed?: readonly string[];
  summariesByPath: Map<string, GitAiReviewPathSummary>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  empty: ReactNode;
  level?: number;
};

function resolveWorkspaceNodeMarker(input: {
  node: DesktopWorkspaceFileTreeNode;
  summary?: GitAiReviewPathSummary;
  language: LanguageCode;
}) {
  const reviewMarkers = renderReviewMarkers({
    summary: input.summary,
    language: input.language,
  });
  if (reviewMarkers) {
    return reviewMarkers;
  }

  if (input.node.extension) {
    return <span className="git-ai-review-tree-badge is-neutral">.{input.node.extension.slice(0, 6)}</span>;
  }

  return null;
}

function WorkspaceTree(props: WorkspaceTreeProps) {
  const level = props.level ?? 0;
  const filter = useMemo(() => buildWorkspaceInspectorTreeFilter(props.allowed), [props.allowed]);
  const nodes = useMemo(() => buildWorkspaceInspectorVisibleNodes({
    path: props.path,
    nodesByDir: props.nodesByDir,
    filter,
  }), [filter, props.nodesByDir, props.path]);
  const rootLoading = level === 0 && props.loadingByPath[props.path] === true && nodes.length === 0;

  if (rootLoading) {
    return <div className="git-ai-review-empty is-inline"><Spin size="small" /></div>;
  }

  if (level === 0 && nodes.length === 0) {
    return <div className="git-page-change-section-empty">{props.empty}</div>;
  }

  return (
    <div className={level > 0 ? "git-page-change-tree is-nested" : "git-page-change-tree"}>
      {nodes.map((node) => {
        if (node.type === "directory") {
          const collapsed = props.expandedByPath[node.path] !== true;
          return (
            <div key={node.path} className="git-page-change-tree-group">
              <button
                type="button"
                className={`git-page-change-tree-row is-directory ${resolveIndentClass(level)}`}
                onClick={() => props.onToggleDirectory(node.path)}
              >
                <span className={collapsed ? "git-page-change-tree-caret" : "git-page-change-tree-caret is-open"}>
                  <DownOutlined />
                </span>
                <WorkspaceFileIcon path={node.path} className="git-page-review-file-icon" isDirectory expanded={!collapsed} />
                <span className="git-page-change-tree-label">{node.name}</span>
              </button>
              {!collapsed ? <WorkspaceTree {...props} path={node.path} level={level + 1} /> : null}
            </div>
          );
        }

        const isActive = props.activePath === node.path;
        const marker = resolveWorkspaceNodeMarker({
          node,
          summary: props.summariesByPath.get(node.path),
          language: props.language,
        });
        return (
          <div key={node.path} className={isActive ? "git-page-change-tree-row is-file is-active" : "git-page-change-tree-row is-file"}>
            <button
              type="button"
              className={`git-page-change-tree-main ${resolveIndentClass(level)}`}
              onClick={() => props.onSelectFile(node.path)}
            >
              <span className="git-page-change-tree-caret is-placeholder" />
              <WorkspaceFileIcon path={node.path} className="git-page-review-file-icon" />
              <span className="git-page-change-tree-label">{node.name}</span>
            </button>
            <div className="git-page-change-tree-utility git-ai-review-tree-utility">
              <div className="git-page-change-tree-side">{marker}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GitAiReviewWorkbenchNext(props: Props) {
  const aiCopy = useMemo(() => createAiReviewCopy(props.language), [props.language]);
  const isEn = props.language === "en-US";
  const stagedReviewTitle = isEn ? "Current staged" : "当前暂存";
  const stagedReviewSubject = isEn ? "Staged but uncommitted changes" : "已暂存未提交的变更";
  const selectGitTargetHint = isEn
    ? "Select a commit or current staged changes on the left, then run review."
    : "先从左侧选择提交或当前暂存变更，再开始审查。";
  const [mode, setMode] = useState<GitAiReviewMode>("git");
  const [gitStage, setGitStage] = useState<GitAiReviewPanelStage>("commits");
  const [historyResult, setHistoryResult] = useState<DesktopGitHistoryResult | null>(props.snapshot?.history ?? null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedGitSource, setSelectedGitSource] = useState<"commit" | "staged" | null>(null);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [historyDetail, setHistoryDetail] = useState<DesktopGitHistoryDetailResult | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [gitReviewRunId, setGitReviewRunId] = useState(0);
  const [gitReviewTargetHash, setGitReviewTargetHash] = useState<string | null>(null);
  const [gitReviewItemsByPath, setGitReviewItemsByPath] = useState<Record<string, DesktopGitReviewItem>>({});
  const [gitReviewFindingsByPath, setGitReviewFindingsByPath] = useState<Record<string, GitAiReviewFinding[]>>({});
  const [gitReviewedPaths, setGitReviewedPaths] = useState<string[]>([]);
  const [gitReviewLoading, setGitReviewLoading] = useState(false);
  const [gitReviewProgress, setGitReviewProgress] = useState({ completed: 0, total: 0 });
  const [gitReviewError, setGitReviewError] = useState<string | null>(null);
  const [gitReviewNotice, setGitReviewNotice] = useState<string | null>(null);
  const [gitSelectedPath, setGitSelectedPath] = useState<string | undefined>(undefined);
  const [workspaceAnalysisRunId, setWorkspaceAnalysisRunId] = useState(0);
  const [workspaceFileResultByPath, setWorkspaceFileResultByPath] = useState<Record<string, DesktopWorkspaceFileContentResult>>({});
  const [workspaceFindingsByPathState, setWorkspaceFindingsByPathState] = useState<Record<string, GitAiReviewFinding[]>>({});
  const [workspaceReviewedPaths, setWorkspaceReviewedPaths] = useState<string[]>([]);
  const [workspaceAnalysisLoading, setWorkspaceAnalysisLoading] = useState(false);
  const [workspaceAnalysisProgress, setWorkspaceAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [workspaceAnalysisError, setWorkspaceAnalysisError] = useState<string | null>(null);
  const [workspaceAnalysisNotice, setWorkspaceAnalysisNotice] = useState<string | null>(null);
  const [workspaceFileLoading, setWorkspaceFileLoading] = useState(false);
  const [workspaceFileError, setWorkspaceFileError] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>(undefined);
  const stagedEntries = useMemo(
    () => buildGitSectionEntries(props.snapshot?.changes.items ?? [], "staged").map((entry) => ({
      ...entry,
      item: {
        ...entry.item,
        status: entry.status,
        additions: entry.additions,
        deletions: entry.deletions,
      },
    })),
    [props.snapshot?.changes.items],
  );
  const hasTriggeredGitReview = Boolean(
    gitReviewRunId > 0
    && (
      (selectedGitSource === "commit" && selectedCommitHash && gitReviewTargetHash === selectedCommitHash)
      || (selectedGitSource === "staged" && gitReviewTargetHash === STAGED_REVIEW_TARGET_KEY)
    ),
  );
  const hasTriggeredWorkspaceAnalysis = workspaceAnalysisRunId > 0;
  const workspaceTree = useWorkspaceInspectorFileTree({
    active: mode === "workspace",
    workspaceId: props.workspaceId,
  });

  useEffect(() => {
    setGitStage("commits");
    setHistoryResult(props.snapshot?.history ?? null);
    setHistoryLoading(false);
    setHistoryError(null);
    setSelectedGitSource(null);
    setSelectedCommitHash(null);
    setHistoryDetail(null);
    setHistoryDetailLoading(false);
    setHistoryDetailError(null);
    setGitReviewRunId(0);
    setGitReviewTargetHash(null);
    setGitReviewItemsByPath({});
    setGitReviewFindingsByPath({});
    setGitReviewedPaths([]);
    setGitReviewLoading(false);
    setGitReviewProgress({ completed: 0, total: 0 });
    setGitReviewError(null);
    setGitReviewNotice(null);
    setGitSelectedPath(undefined);
    setWorkspaceAnalysisRunId(0);
    setWorkspaceFileResultByPath({});
    setWorkspaceFindingsByPathState({});
    setWorkspaceReviewedPaths([]);
    setWorkspaceAnalysisLoading(false);
    setWorkspaceAnalysisProgress({ completed: 0, total: 0 });
    setWorkspaceAnalysisError(null);
    setWorkspaceAnalysisNotice(null);
    setWorkspaceFileLoading(false);
    setWorkspaceFileError(null);
    setSelectedFindingId(undefined);
  }, [props.snapshot?.history, props.workspaceId]);

  useEffect(() => {
    if (!props.workspaceId) {
      return;
    }

    let cancelled = false;
    const canReuseSnapshot = Boolean(
      props.snapshot
      && props.snapshot.workspaceId === props.workspaceId
      && props.snapshot.history.items.length > 0,
    );
    setHistoryResult(canReuseSnapshot ? (props.snapshot?.history ?? null) : null);
    setHistoryLoading(!canReuseSnapshot);
    setHistoryError(null);

    void getDesktopGitHistory(props.workspaceId, {
      limit: 120,
      includeStats: true,
      scope: "repository",
    })
      .then((result) => {
        if (!cancelled) {
          setHistoryResult(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryError(`${aiCopy.reviewLoadFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.reviewLoadFailed, props.snapshot, props.workspaceId]);

  useEffect(() => {
    if (selectedGitSource !== "commit" || !selectedCommitHash) {
      setHistoryDetail(null);
      setHistoryDetailLoading(false);
      setHistoryDetailError(null);
      return;
    }

    let cancelled = false;
    setHistoryDetailLoading(true);
    setHistoryDetailError(null);

    void getDesktopGitHistoryDetail(props.workspaceId, selectedCommitHash)
      .then((result) => {
        if (!cancelled) {
          setHistoryDetail(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryDetail(null);
          setHistoryDetailError(`${aiCopy.reviewLoadFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.reviewLoadFailed, props.workspaceId, selectedCommitHash, selectedGitSource]);

  useEffect(() => {
    setGitReviewRunId(0);
    setGitReviewTargetHash(null);
    setGitReviewItemsByPath({});
    setGitReviewFindingsByPath({});
    setGitReviewedPaths([]);
    setGitReviewLoading(false);
    setGitReviewProgress({ completed: 0, total: 0 });
    setGitReviewError(null);
    setGitReviewNotice(null);
    setSelectedFindingId(undefined);
  }, [selectedCommitHash, selectedGitSource]);

  useEffect(() => {
    if (selectedGitSource === "staged") {
      const nextPath = props.selectedReviewFilePath && stagedEntries.some((entry) => entry.path === props.selectedReviewFilePath)
        ? props.selectedReviewFilePath
        : stagedEntries[0]?.path;
      setGitSelectedPath(nextPath);
      return;
    }
    if (!historyDetail) {
      setGitSelectedPath(undefined);
      return;
    }
    const nextPath = props.selectedReviewFilePath && historyDetail.files.some((file) => file.path === props.selectedReviewFilePath)
      ? props.selectedReviewFilePath
      : historyDetail.files[0]?.path;
    setGitSelectedPath(nextPath);
  }, [historyDetail, props.selectedReviewFilePath, selectedGitSource, stagedEntries]);

  useEffect(() => {
    if (selectedGitSource === "staged" && stagedEntries.length === 0) {
      setGitStage("commits");
      setSelectedGitSource(null);
      setGitSelectedPath(undefined);
    }
  }, [selectedGitSource, stagedEntries.length]);

  useEffect(() => {
    if (!props.workspaceId || gitReviewRunId === 0 || !gitReviewTargetHash) {
      return;
    }
    if (selectedGitSource !== "commit" || !historyDetail || historyDetail.hash !== gitReviewTargetHash) {
      return;
    }

    let cancelled = false;
    setGitReviewLoading(true);
    setGitReviewProgress({ completed: 0, total: historyDetail.files.length });
    setGitReviewError(null);
    setGitReviewNotice(null);

    void (async () => {
      const selectionResult = await resolveReviewModelSelection(props.workspaceId)
        .then((selection) => ({ selection, fallbackReason: null as string | null }))
        .catch((error) => ({ selection: null, fallbackReason: normalizeError(error) }));

      const output = await loadCommitReviewResults({
        workspaceId: props.workspaceId,
        baseRef: historyDetail.parentHashes[0]?.trim() || GIT_EMPTY_TREE_HASH,
        headRef: historyDetail.hash,
        files: historyDetail.files,
        language: props.language,
        aiSelection: selectionResult.selection,
        isCancelled: () => cancelled,
        onProgress: (completed, total) => {
          if (!cancelled) {
            setGitReviewProgress({ completed, total });
          }
        },
      });

      if (cancelled) {
        return;
      }

      setGitReviewItemsByPath(output.results);
      setGitReviewFindingsByPath(output.findingsByPath);
      setGitReviewedPaths(output.reviewedPaths);
      setGitReviewNotice(resolveReviewNotice({
        language: props.language,
        mode: output.mode,
        modelLabel: output.modelLabel,
        fallbackCount: output.fallbackCount,
        fallbackReason: selectionResult.fallbackReason,
      }));

      if (output.failed > 0) {
        const suffix = output.firstError ? `: ${output.firstError}` : "";
        setGitReviewError(`${aiCopy.workspaceAnalysisFailed(output.failed)}${suffix}`);
      }
    })()
      .catch((error) => {
        if (!cancelled) {
          setGitReviewItemsByPath({});
          setGitReviewFindingsByPath({});
          setGitReviewedPaths([]);
          setGitReviewError(normalizeError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGitReviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.workspaceAnalysisFailed, gitReviewRunId, gitReviewTargetHash, historyDetail, props.workspaceId, selectedGitSource]);

  useEffect(() => {
    if (!props.workspaceId || gitReviewRunId === 0 || gitReviewTargetHash !== STAGED_REVIEW_TARGET_KEY || selectedGitSource !== "staged") {
      return;
    }
    if (stagedEntries.length === 0) {
      return;
    }

    let cancelled = false;
    setGitReviewLoading(true);
    setGitReviewProgress({ completed: 0, total: stagedEntries.length });
    setGitReviewError(null);
    setGitReviewNotice(null);

    void (async () => {
      const selectionResult = await resolveReviewModelSelection(props.workspaceId)
        .then((selection) => ({ selection, fallbackReason: null as string | null }))
        .catch((error) => ({ selection: null, fallbackReason: normalizeError(error) }));

      const output = await loadStagedReviewResults({
        workspaceId: props.workspaceId,
        files: stagedEntries,
        language: props.language,
        aiSelection: selectionResult.selection,
        isCancelled: () => cancelled,
        onProgress: (completed, total) => {
          if (!cancelled) {
            setGitReviewProgress({ completed, total });
          }
        },
      });

      if (cancelled) {
        return;
      }

      setGitReviewItemsByPath(output.results);
      setGitReviewFindingsByPath(output.findingsByPath);
      setGitReviewedPaths(output.reviewedPaths);
      setGitReviewNotice(resolveReviewNotice({
        language: props.language,
        mode: output.mode,
        modelLabel: output.modelLabel,
        fallbackCount: output.fallbackCount,
        fallbackReason: selectionResult.fallbackReason,
      }));

      if (output.failed > 0) {
        const suffix = output.firstError ? `: ${output.firstError}` : "";
        setGitReviewError(`${aiCopy.workspaceAnalysisFailed(output.failed)}${suffix}`);
      }
    })()
      .catch((error) => {
        if (!cancelled) {
          setGitReviewItemsByPath({});
          setGitReviewFindingsByPath({});
          setGitReviewedPaths([]);
          setGitReviewError(normalizeError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGitReviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.workspaceAnalysisFailed, gitReviewRunId, gitReviewTargetHash, props.workspaceId, selectedGitSource, stagedEntries]);

  useEffect(() => {
    if (mode !== "workspace" || !props.selectedReviewFilePath) {
      return;
    }
    if (workspaceTree.selectedFilePath === props.selectedReviewFilePath) {
      return;
    }
    workspaceTree.selectFile(props.selectedReviewFilePath);
  }, [mode, props.selectedReviewFilePath, workspaceTree]);

  useEffect(() => {
    if (!props.workspaceId || workspaceAnalysisRunId === 0) {
      return;
    }

    let cancelled = false;
    setWorkspaceAnalysisLoading(true);
    setWorkspaceAnalysisProgress({ completed: 0, total: 0 });
    setWorkspaceAnalysisError(null);
    setWorkspaceAnalysisNotice(null);

    void listWorkspaceAnalysisFiles({
      workspaceId: props.workspaceId,
      isCancelled: () => cancelled,
    })
      .then(async (filePaths) => {
        if (cancelled) {
          return;
        }
        setWorkspaceAnalysisProgress({ completed: 0, total: filePaths.length });
        if (filePaths.length === 0) {
          setWorkspaceFileResultByPath({});
          setWorkspaceFindingsByPathState({});
          setWorkspaceReviewedPaths([]);
          return;
        }
        const selectionResult = await resolveReviewModelSelection(props.workspaceId)
          .then((selection) => ({ selection, fallbackReason: null as string | null }))
          .catch((error) => ({ selection: null, fallbackReason: normalizeError(error) }));
        const output = await loadWorkspaceAnalysisResults({
          workspaceId: props.workspaceId,
          filePaths,
          language: props.language,
          aiSelection: selectionResult.selection,
          isCancelled: () => cancelled,
          onProgress: (completed, total) => {
            if (!cancelled) {
              setWorkspaceAnalysisProgress({ completed, total });
            }
          },
        });
        if (cancelled) {
          return;
        }
        setWorkspaceFileResultByPath(output.results);
        setWorkspaceFindingsByPathState(output.findingsByPath);
        setWorkspaceReviewedPaths(output.reviewedPaths);
        setWorkspaceAnalysisNotice(resolveReviewNotice({
          language: props.language,
          mode: output.mode,
          modelLabel: output.modelLabel,
          fallbackCount: output.fallbackCount,
          fallbackReason: selectionResult.fallbackReason,
        }));
        if (output.failed > 0) {
          const suffix = output.firstError ? `: ${output.firstError}` : "";
          setWorkspaceAnalysisError(`${aiCopy.workspaceAnalysisFailed(output.failed)}${suffix}`);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceAnalysisError(normalizeError(error));
          setWorkspaceFileResultByPath({});
          setWorkspaceFindingsByPathState({});
          setWorkspaceReviewedPaths([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceAnalysisLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.workspaceAnalysisFailed, props.workspaceId, workspaceAnalysisRunId]);

  const normalizedSearch = "";
  const filteredHistory = useMemo(
    () => (historyResult?.items ?? []).filter((item) => matchesCommitSearch(item, normalizedSearch)),
    [historyResult?.items, normalizedSearch],
  );
  const selectedCommit = useMemo(
    () => historyResult?.items.find((item) => item.hash === selectedCommitHash) ?? null,
    [historyResult?.items, selectedCommitHash],
  );
  const visibleStagedCard = useMemo(() => {
    if (stagedEntries.length === 0) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    return stagedReviewTitle.toLowerCase().includes(normalizedSearch)
      || stagedReviewSubject.toLowerCase().includes(normalizedSearch)
      || stagedEntries.some((entry) => entry.path.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, stagedEntries, stagedReviewSubject, stagedReviewTitle]);
  const gitReviewItems = useMemo(() => {
    if (!hasTriggeredGitReview) {
      return [];
    }
    if (selectedGitSource === "staged") {
      return stagedEntries.map((entry) => gitReviewItemsByPath[entry.path] ?? buildGitReviewFallbackItem(entry.item));
    }
    if (!historyDetail) {
      return [];
    }
    return historyDetail.files.map((file) => gitReviewItemsByPath[file.path] ?? buildCommitReviewFallbackItem(file));
  }, [gitReviewItemsByPath, hasTriggeredGitReview, historyDetail, selectedGitSource, stagedEntries]);
  const gitFindings = useMemo(
    () => Object.values(gitReviewFindingsByPath).flat(),
    [gitReviewFindingsByPath],
  );
  const gitFindingsByPath = useMemo(() => {
    const out = new Map<string, GitAiReviewFinding[]>();
    for (const [path, findings] of Object.entries(gitReviewFindingsByPath)) {
      out.set(path, findings);
    }
    return out;
  }, [gitReviewFindingsByPath]);
  const gitSummariesByPath = useMemo(() => resolveFindingSummaryByPath({
    findings: gitFindings,
    reviewedPaths: gitReviewedPaths,
  }), [gitFindings, gitReviewedPaths]);
  const workspaceFindingsByPath = useMemo(() => {
    const out = new Map<string, GitAiReviewFinding[]>();
    for (const [path, findings] of Object.entries(workspaceFindingsByPathState)) {
      out.set(path, findings);
    }
    return out;
  }, [workspaceFindingsByPathState]);
  const workspaceSummariesByPath = useMemo(
    () => resolveFindingSummaryByPath({
      findings: [...workspaceFindingsByPath.values()].flat(),
      reviewedPaths: workspaceReviewedPaths,
    }),
    [workspaceFindingsByPath, workspaceReviewedPaths],
  );
  const analyzedWorkspaceFileCount = workspaceReviewedPaths.length;

  useEffect(() => {
    if (!hasTriggeredWorkspaceAnalysis || workspaceTree.selectedFilePath || analyzedWorkspaceFileCount === 0) {
      return;
    }
    const firstPath = Object.keys(workspaceFileResultByPath).sort(comparePathLabels)[0];
    if (firstPath) {
      workspaceTree.selectFile(firstPath);
    }
  }, [analyzedWorkspaceFileCount, hasTriggeredWorkspaceAnalysis, workspaceFileResultByPath, workspaceTree]);

  useEffect(() => {
    if (mode !== "workspace" || !hasTriggeredWorkspaceAnalysis || !workspaceTree.selectedFilePath) {
      return;
    }
    if (workspaceFileResultByPath[workspaceTree.selectedFilePath]) {
      setWorkspaceFileError(null);
      return;
    }

    let cancelled = false;
    setWorkspaceFileLoading(true);
    setWorkspaceFileError(null);
    void getDesktopWorkspaceFileContent(props.workspaceId, workspaceTree.selectedFilePath)
      .then((result) => {
        if (!cancelled) {
          setWorkspaceFileResultByPath((current) => ({
            ...current,
            [workspaceTree.selectedFilePath]: result,
          }));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceFileError(`${aiCopy.workspacePreviewFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceFileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.workspacePreviewFailed, hasTriggeredWorkspaceAnalysis, mode, props.workspaceId, workspaceFileResultByPath, workspaceTree.selectedFilePath]);

  const gitTreeEntries = useMemo(() => {
    if (selectedGitSource === "staged") {
      return stagedEntries;
    }
    if (!historyDetail) {
      return [];
    }
    return buildCommitTreeEntries(historyDetail.files);
  }, [historyDetail, selectedGitSource, stagedEntries]);
  const visibleGitEntries = useMemo(() => {
    if (gitTreeEntries.length === 0) {
      return [];
    }

    return gitTreeEntries.filter((entry) => {
      const pathMatches = !normalizedSearch || entry.path.toLowerCase().includes(normalizedSearch);
      if (!hasTriggeredGitReview) {
        return pathMatches;
      }
      const findingMatches = (gitFindingsByPath.get(entry.path) ?? []).some((finding) => (
        !normalizedSearch
          || [finding.title, finding.summary, finding.evidence]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedSearch))
      ));
      return pathMatches || findingMatches;
    });
  }, [gitFindingsByPath, gitTreeEntries, hasTriggeredGitReview, normalizedSearch]);
  const gitTreeNodes = useMemo(() => buildGitChangeTree(visibleGitEntries), [visibleGitEntries]);
  const [gitCollapsedDirectories, setGitCollapsedDirectories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setGitCollapsedDirectories(buildInitialCollapsedDirectories({
      nodes: gitTreeNodes,
      activePath: gitSelectedPath,
      collapseAll: visibleGitEntries.length >= LARGE_CHANGE_TREE_AUTO_COLLAPSE_THRESHOLD,
    }));
  }, [gitSelectedPath, gitTreeNodes, visibleGitEntries.length]);

  const workspaceAllowedPaths = useMemo(() => {
    if (!normalizedSearch) {
      return undefined;
    }

    const out = new Set<string>();
    for (const nodes of Object.values(workspaceTree.nodesByDir)) {
      for (const node of nodes) {
        if (node.type === "file" && node.path.toLowerCase().includes(normalizedSearch)) {
          out.add(node.path);
        }
      }
    }
    return [...out];
  }, [normalizedSearch, workspaceTree.nodesByDir]);

  const selectedGitItem = useMemo(() => {
    if (!gitSelectedPath || !hasTriggeredGitReview) {
      return null;
    }
    if (selectedGitSource === "staged") {
      const entry = stagedEntries.find((item) => item.path === gitSelectedPath);
      return entry ? (gitReviewItemsByPath[gitSelectedPath] ?? buildGitReviewFallbackItem(entry.item)) : null;
    }
    if (!historyDetail) {
      return null;
    }
    const file = historyDetail.files.find((item) => item.path === gitSelectedPath);
    return file ? (gitReviewItemsByPath[file.path] ?? buildCommitReviewFallbackItem(file)) : null;
  }, [gitReviewItemsByPath, gitSelectedPath, hasTriggeredGitReview, historyDetail, selectedGitSource, stagedEntries]);
  const selectedGitFindings = useMemo(() => {
    if (!hasTriggeredGitReview || !gitSelectedPath) {
      return [];
    }
    return gitFindingsByPath.get(gitSelectedPath) ?? [];
  }, [gitFindingsByPath, gitSelectedPath, hasTriggeredGitReview]);
  const selectedWorkspacePath = workspaceTree.selectedFilePath || undefined;
  const selectedWorkspaceResult = selectedWorkspacePath ? workspaceFileResultByPath[selectedWorkspacePath] ?? null : null;
  const selectedWorkspaceFindings = useMemo(() => {
    if (!selectedWorkspacePath || !hasTriggeredWorkspaceAnalysis) {
      return [];
    }
    return workspaceFindingsByPath.get(selectedWorkspacePath) ?? [];
  }, [hasTriggeredWorkspaceAnalysis, selectedWorkspacePath, workspaceFindingsByPath]);

  const currentFindings = mode === "git" ? selectedGitFindings : selectedWorkspaceFindings;

  useEffect(() => {
    if (!props.selectedReviewFindingId) {
      return;
    }
    const matched = currentFindings.find((finding) => finding.id === props.selectedReviewFindingId);
    if (matched && matched.id !== selectedFindingId) {
      setSelectedFindingId(matched.id);
    }
  }, [currentFindings, props.selectedReviewFindingId, selectedFindingId]);

  useEffect(() => {
    if (currentFindings.length === 0) {
      setSelectedFindingId(undefined);
      return;
    }
    if (selectedFindingId && currentFindings.some((finding) => finding.id === selectedFindingId)) {
      return;
    }
    setSelectedFindingId(currentFindings[0]?.id);
  }, [currentFindings, selectedFindingId]);

  const featuredFinding = useMemo(() => {
    if (!selectedFindingId) {
      return currentFindings[0] ?? null;
    }
    return currentFindings.find((finding) => finding.id === selectedFindingId) ?? currentFindings[0] ?? null;
  }, [currentFindings, selectedFindingId]);

  useEffect(() => {
    const selectedFinding = currentFindings.find((finding) => finding.id === selectedFindingId) ?? currentFindings[0];
    if (selectedFinding?.id !== props.selectedReviewFindingId) {
      props.onSelectedReviewFindingIdChange?.(selectedFinding?.id);
    }
  }, [currentFindings, props, selectedFindingId]);

  useEffect(() => {
    if (mode === "git" && gitStage === "files" && gitSelectedPath && gitSelectedPath !== props.selectedReviewFilePath) {
      props.onSelectedReviewFilePathChange?.(gitSelectedPath);
    }
  }, [gitSelectedPath, gitStage, mode, props]);

  useEffect(() => {
    if (mode === "workspace" && selectedWorkspacePath && selectedWorkspacePath !== props.selectedReviewFilePath) {
      props.onSelectedReviewFilePathChange?.(selectedWorkspacePath);
    }
  }, [mode, props, selectedWorkspacePath]);

  function handleRunReview() {
    if (mode === "git") {
      setGitReviewItemsByPath({});
      setGitReviewFindingsByPath({});
      setGitReviewedPaths([]);
      setGitReviewError(null);
      setGitReviewNotice(null);
      setSelectedFindingId(undefined);
      if (selectedGitSource === "staged") {
        if (stagedEntries.length === 0) {
          return;
        }
        setGitReviewTargetHash(STAGED_REVIEW_TARGET_KEY);
        setGitReviewRunId((current) => current + 1);
        return;
      }
      if (!selectedCommitHash || !historyDetail || historyDetail.hash !== selectedCommitHash || historyDetail.files.length === 0) {
        return;
      }
      setGitReviewTargetHash(selectedCommitHash);
      setGitReviewRunId((current) => current + 1);
      return;
    }

    setWorkspaceFileResultByPath({});
  setWorkspaceFindingsByPathState({});
  setWorkspaceReviewedPaths([]);
    setWorkspaceAnalysisError(null);
  setWorkspaceAnalysisNotice(null);
    setWorkspaceAnalysisProgress({ completed: 0, total: 0 });
    setSelectedFindingId(undefined);
    setWorkspaceAnalysisRunId((current) => current + 1);
    void workspaceTree.refreshLoadedDirectories();
  }

  const currentToolbarError = mode === "git"
    ? (gitStage === "commits"
      ? historyError
      : (selectedGitSource === "commit"
        ? (historyDetailError ?? (hasTriggeredGitReview ? gitReviewError : null))
        : (hasTriggeredGitReview ? gitReviewError : null)))
    : (hasTriggeredWorkspaceAnalysis ? (workspaceAnalysisError ?? workspaceTree.fileTreeError ?? workspaceFileError) : null);
  const isRefreshing = mode === "git"
    ? (historyLoading || (selectedGitSource === "commit" && historyDetailLoading) || gitReviewLoading)
    : (workspaceAnalysisLoading || workspaceFileLoading);
  const runButtonLoading = mode === "git" ? gitReviewLoading : workspaceAnalysisLoading;
  const runButtonDisabled = mode === "git"
    ? (gitStage !== "files"
      || !selectedGitSource
      || (selectedGitSource === "commit"
        ? (historyDetailLoading || !historyDetail || historyDetail.files.length === 0)
        : stagedEntries.length === 0))
    : workspaceAnalysisLoading;
  const startSelectedGitReviewHint = selectedGitSource === "staged"
    ? (isEn ? "Run review to generate AI comments for the staged-but-uncommitted changes." : "点击开始审查，对当前已暂存未提交的变更生成 AI 评论。")
    : aiCopy.startGitReviewHint;
  const currentToolbarNotice = mode === "git"
    ? (hasTriggeredGitReview ? gitReviewNotice : null)
    : (hasTriggeredWorkspaceAnalysis ? workspaceAnalysisNotice : null);
  const detailPath = mode === "git"
    ? (hasTriggeredGitReview ? gitSelectedPath : undefined)
    : (hasTriggeredWorkspaceAnalysis ? selectedWorkspacePath : undefined);
  const detailPathParts = detailPath ? splitWorkspaceReviewDirectory(detailPath) : null;
  const workspacePreviewContent = selectedWorkspaceResult ? resolveWorkspacePreviewContent(selectedWorkspaceResult) : null;
  const expandReviewSidebar = mode === "git"
    ? (gitStage === "files" && gitReviewedPaths.length > 0)
    : workspaceReviewedPaths.length > 0;

  if (props.loading && !props.snapshot) {
    return <div className="git-ai-review-empty"><Spin /></div>;
  }

  if (props.snapshot && !props.snapshot.isGitRepo) {
    return (
      <div className="git-ai-review-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.copy.emptyNotGitRepo} />
      </div>
    );
  }

  return (
    <div className={expandReviewSidebar ? "git-page-workbench git-ai-review-workbench has-review-results" : "git-page-workbench git-ai-review-workbench"}>
      <div className="git-page-workbench-sidebar git-ai-review-sidebar">
        <div className="git-ai-review-toolbar">
          <Segmented
            className="git-ai-review-mode-switch"
            value={mode}
            onChange={(value) => setMode(value as GitAiReviewMode)}
            options={[
              { label: aiCopy.modeGit, value: "git" },
              { label: aiCopy.modeWorkspace, value: "workspace" },
            ]}
          />
          <div className="git-ai-review-toolbar-row">
            <Button type="primary" onClick={handleRunReview} loading={runButtonLoading} disabled={runButtonDisabled}>{hasTriggeredGitReview || hasTriggeredWorkspaceAnalysis ? aiCopy.rerunReview : aiCopy.startReview}</Button>
          </div>
          <div className="git-ai-review-toolbar-status-row">
            {isRefreshing ? (
              <span className="git-ai-review-toolbar-status">
                <Spin size="small" />
                <span>{mode === "git"
                  ? aiCopy.workspaceAnalyzing(gitReviewProgress.completed, gitReviewProgress.total)
                  : aiCopy.workspaceAnalyzing(workspaceAnalysisProgress.completed, workspaceAnalysisProgress.total)}
                </span>
              </span>
            ) : currentToolbarError ? (
              <span className="git-ai-review-toolbar-status is-error" title={currentToolbarError}>{currentToolbarError}</span>
            ) : currentToolbarNotice ? (
              <span className="git-ai-review-toolbar-status" title={currentToolbarNotice}>{currentToolbarNotice}</span>
            ) : <span />}
          </div>
        </div>

        <div className="git-ai-review-tree-shell">
          {mode === "git" ? gitStage === "commits" ? (
            historyLoading && !historyResult ? (
              <div className="git-ai-review-empty is-inline"><Spin /></div>
            ) : historyError && !historyResult ? (
              <div className="git-ai-review-empty is-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{historyError}</Text>} /></div>
            ) : filteredHistory.length === 0 && !visibleStagedCard ? (
              <div className="git-ai-review-empty is-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoReview} /></div>
            ) : (
              <div className="git-ai-review-commit-list">
                {visibleStagedCard ? (
                  <button
                    key={STAGED_REVIEW_TARGET_KEY}
                    type="button"
                    className={selectedGitSource === "staged" ? "git-ai-review-commit-card is-active" : "git-ai-review-commit-card"}
                    onClick={() => {
                      setGitStage("files");
                      setSelectedGitSource("staged");
                      setSelectedCommitHash(null);
                    }}
                  >
                    <div className="git-ai-review-commit-card-head">
                      <span className="git-ai-review-commit-hash">{stagedReviewTitle}</span>
                      <span className="git-ai-review-commit-stat">+{props.snapshot?.changes.stagedSummary.additions ?? 0} / -{props.snapshot?.changes.stagedSummary.deletions ?? 0}</span>
                    </div>
                    <div className="git-ai-review-commit-subject">{stagedReviewSubject}</div>
                    <div className="git-ai-review-commit-meta-row">
                      <span>{props.snapshot?.changes.branch ?? (isEn ? "No branch" : "无分支")}</span>
                      <span>{stagedEntries.length} {isEn ? "files" : "文件"}</span>
                    </div>
                  </button>
                ) : null}
                {filteredHistory.map((item) => (
                  <button
                    key={item.hash}
                    type="button"
                    className={item.hash === selectedCommitHash ? "git-ai-review-commit-card is-active" : "git-ai-review-commit-card"}
                    onClick={() => {
                      setGitStage("files");
                      setSelectedGitSource("commit");
                      setSelectedCommitHash(item.hash);
                    }}
                  >
                    <div className="git-ai-review-commit-card-head">
                      <span className="git-ai-review-commit-hash">{item.shortHash}</span>
                      <span className="git-ai-review-commit-stat">+{item.additions} / -{item.deletions}</span>
                    </div>
                    <div className="git-ai-review-commit-subject">{item.subject}</div>
                    <div className="git-ai-review-commit-meta-row">
                      <span>{item.authorName || (props.language === "en-US" ? "Unknown" : "未知作者")}</span>
                      {item.authoredRelative ? <span>{item.authoredRelative}</span> : null}
                      <span>{item.filesChanged} {props.language === "en-US" ? "files" : "文件"}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="git-ai-review-commit-tree-stage">
              <div className="git-ai-review-commit-stage-head">
                <Button type="text" icon={<LeftOutlined />} onClick={() => setGitStage("commits")}>{aiCopy.backToCommits}</Button>
                <div className="git-ai-review-commit-stage-copy">
                  <div className="git-ai-review-commit-stage-title">{selectedGitSource === "staged" ? stagedReviewSubject : (selectedCommit?.subject ?? aiCopy.commitChangesTitle)}</div>
                  <div className="git-ai-review-commit-stage-meta">{selectedGitSource === "staged" ? `${stagedEntries.length} ${isEn ? "files" : "文件"}` : (selectedCommit?.shortHash ?? "")}</div>
                </div>
              </div>
              {selectedGitSource === "commit" && historyDetailLoading && !historyDetail ? (
                <div className="git-ai-review-empty is-inline"><Spin /></div>
              ) : selectedGitSource === "commit" && historyDetailError && !historyDetail ? (
                <div className="git-ai-review-empty is-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{historyDetailError}</Text>} /></div>
              ) : selectedGitSource === "staged" && stagedEntries.length === 0 ? (
                <div className="git-ai-review-empty is-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoReview} /></div>
              ) : selectedGitSource === "commit" && historyDetail && historyDetail.files.length === 0 ? (
                <div className="git-ai-review-empty is-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoReview} /></div>
              ) : gitTreeNodes.length > 0 ? (
                <GitTree
                  nodes={gitTreeNodes}
                  collapsedDirectories={gitCollapsedDirectories}
                  activePath={gitSelectedPath}
                  language={props.language}
                  summariesByPath={gitSummariesByPath}
                  onToggleDirectory={(path) => {
                    setGitCollapsedDirectories((current) => ({
                      ...current,
                      [path]: !current[path],
                    }));
                  }}
                  onSelectFile={(path) => setGitSelectedPath(path)}
                />
              ) : (
                <div className="git-ai-review-empty is-inline"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoSelection} /></div>
              )}
            </div>
          ) : (
            <WorkspaceTree
              path=""
              nodesByDir={workspaceTree.nodesByDir}
              expandedByPath={workspaceTree.expandedByPath}
              loadingByPath={workspaceTree.loadingByPath}
              activePath={selectedWorkspacePath}
              language={props.language}
              allowed={workspaceAllowedPaths}
              summariesByPath={workspaceSummariesByPath}
              onToggleDirectory={workspaceTree.toggleFilesDirectory}
              onSelectFile={(path) => workspaceTree.selectFile(path)}
              empty={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.workspaceTreeEmpty} />}
            />
          )}
        </div>
      </div>

      <div className="git-page-workbench-preview git-ai-review-detail">
        {mode === "git" && gitStage === "commits" ? (
          <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectGitTargetHint} /></div>
        ) : mode === "git" && selectedGitSource === "commit" && historyDetailLoading && !historyDetail ? (
          <div className="git-ai-review-empty"><Spin /></div>
        ) : mode === "git" && selectedGitSource === "commit" && historyDetailError && !historyDetail ? (
          <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{historyDetailError}</Text>} /></div>
        ) : mode === "git" && !hasTriggeredGitReview ? (
          <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={startSelectedGitReviewHint} /></div>
        ) : mode === "workspace" && !hasTriggeredWorkspaceAnalysis ? (
          <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.startWorkspaceReviewHint} /></div>
        ) : detailPath ? (
          <>
            <div className="git-ai-review-detail-head git-ai-review-detail-shell-head">
              <div className="git-ai-review-detail-title-block">
                <div className="git-ai-review-detail-title-row">
                  <Text className="git-ai-review-detail-title">{detailPathParts?.filename ?? detailPath}</Text>
                  <span className="git-ai-review-meta-chip">{mode === "git" ? aiCopy.modeGit : aiCopy.modeWorkspace}</span>
                  {featuredFinding ? <span className={`git-ai-review-badge is-${featuredFinding.severity}`}>{aiCopy.severityText(featuredFinding.severity)}</span> : null}
                </div>
                <div className="git-ai-review-detail-meta-row">
                  <span className="git-ai-review-meta-chip">{aiCopy.findingsCount(currentFindings.length)}</span>
                  {mode === "git" && selectedGitItem ? <span className="git-ai-review-meta-chip">{props.copy.statusText(selectedGitItem.status)}</span> : null}
                  {featuredFinding?.lineNumber ? <span className="git-ai-review-meta-chip">{aiCopy.detailLine(featuredFinding.lineNumber)}</span> : null}
                </div>
              </div>
              <div className="git-ai-review-detail-path">
                <WorkspaceFileIcon path={detailPath} className="git-page-review-file-icon" />
                <span>{detailPathParts?.directory || detailPath}</span>
              </div>
            </div>

            <div className="git-ai-review-detail-body-split">
              <div className="git-ai-review-detail-code-pane">
                <div className="git-ai-review-detail-preview-header">
                  <Text className="git-ai-review-detail-section-label">{mode === "git" ? aiCopy.codePaneTitleGit : aiCopy.codePaneTitleWorkspace}</Text>
                  {mode === "workspace" && selectedWorkspaceResult?.truncated ? <span className="git-ai-review-meta-chip">{aiCopy.workspacePreviewTruncated}</span> : null}
                </div>
                <div className="git-ai-review-detail-preview">
                  {mode === "git" ? (
                    <GitDiffPreview copy={props.copy} item={selectedGitItem} emptyDescription={aiCopy.emptyNoSelection} />
                  ) : workspaceFileLoading && !selectedWorkspaceResult ? (
                    <div className="git-ai-review-empty"><Spin size="small" /></div>
                  ) : workspaceFileError ? (
                    <div className="git-ai-review-empty"><Text type="secondary">{workspaceFileError}</Text></div>
                  ) : selectedWorkspaceResult?.binary ? (
                    <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.workspaceBinaryUnsupported} /></div>
                  ) : workspacePreviewContent ? (
                    <div className="git-ai-review-source-preview"><pre className="git-ai-review-source-code">{workspacePreviewContent}</pre></div>
                  ) : (
                    <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoSelection} /></div>
                  )}
                </div>
              </div>

              <div className="git-ai-review-comments-pane">
                <div className="git-ai-review-comments-pane-head">
                  <Text className="git-ai-review-detail-section-label">{mode === "git" ? aiCopy.aiCommentsTitle : aiCopy.workspaceResultsTitle}</Text>
                  <span className="git-ai-review-meta-chip">{currentFindings.length}</span>
                </div>
                {featuredFinding ? (
                  <>
                    <div className="git-ai-review-detail-title-row">
                      <Text className="git-ai-review-detail-title">{featuredFinding.title}</Text>
                      <span className="git-ai-review-meta-chip">{aiCopy.categoryText(featuredFinding.category)}</span>
                    </div>
                    <Paragraph className="git-ai-review-detail-summary">{featuredFinding.summary}</Paragraph>
                    <div className="git-ai-review-detail-section">
                      <Text className="git-ai-review-detail-section-label">{aiCopy.detailSuggestion}</Text>
                      <Paragraph className="git-ai-review-detail-section-body">{featuredFinding.suggestion}</Paragraph>
                    </div>
                    {featuredFinding.evidence ? (
                      <div className="git-ai-review-detail-section">
                        <Text className="git-ai-review-detail-section-label">{aiCopy.detailEvidence}</Text>
                        <pre className="git-ai-review-detail-evidence">{featuredFinding.evidence}</pre>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Paragraph className="git-ai-review-detail-summary">{aiCopy.noDiagnostics}</Paragraph>
                )}
                <div className="git-ai-review-comments-list">
                  {currentFindings.map((finding) => (
                    <button
                      key={finding.id}
                      type="button"
                      className={finding.id === featuredFinding?.id ? "git-ai-review-comment-card is-active" : "git-ai-review-comment-card"}
                      onClick={() => setSelectedFindingId(finding.id)}
                    >
                      <div className="git-ai-review-comment-card-head">
                        <span className={`git-ai-review-badge is-${finding.severity}`}>{aiCopy.severityText(finding.severity)}</span>
                        <span className="git-ai-review-meta-chip">{aiCopy.categoryText(finding.category)}</span>
                      </div>
                      <div className="git-ai-review-comment-card-title">{finding.title}</div>
                      <div className="git-ai-review-comment-card-summary">{finding.summary}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="git-ai-review-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoSelection} /></div>
        )}
      </div>
    </div>
  );
}
