import { DownOutlined, FilterOutlined, LeftOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  Input,
  Popover,
  Segmented,
  Spin,
  Typography,
} from "antd";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";

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
import { getDesktopWorkspaceFileContent, getDesktopWorkspaceFileTree } from "../../../lib/desktop-workspace";
import type { GitPageCopy } from "../i18n";
import { WorkspaceDiffChanges } from "./diff-changes";
import { GitDiffPreview } from "./diff-preview";
import { WorkspaceFileIcon } from "./file-icon";
import { resolveWorkspaceReviewStatusClass, splitWorkspaceReviewDirectory } from "./review-model";
import {
  buildGitChangeTree,
  type GitChangeTreeNode,
  type GitSectionEntry,
} from "./view-model";
import { useWorkspaceInspectorFileTree } from "../../chat/components/use-workspace-inspector-file-tree";
import {
  buildWorkspaceInspectorTreeFilter,
  buildWorkspaceInspectorVisibleNodes,
} from "../../chat/components/workspace-inspector-tree-model";

const { Paragraph, Text } = Typography;

const MAX_HEURISTIC_DIFF_CHURN = 1200;
const MAX_HEURISTIC_PATCH_LENGTH = 240_000;
const MAX_WORKSPACE_ANALYSIS_CONTENT_LENGTH = 180_000;

type GitAiReviewMode = "git" | "workspace";

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
  severityLabel: string;
  categoryLabel: string;
  allSeverities: string;
  allCategories: string;
  severityText: (value: GitAiReviewSeverity) => string;
  categoryText: (value: GitAiReviewCategory) => string;
  findingsCount: (value: number) => string;
  filesCount: (value: number) => string;
  emptyNoReview: string;
  emptyNoFindings: string;
  emptyNoSelection: string;
  emptySelectionFiltered: string;
  workspaceTreeEmpty: string;
  filterTrigger: string;
  modeGit: string;
  modeWorkspace: string;
  diagnosticsTitle: string;
  gitReviewTitle: string;
  workspacePreviewTitle: string;
  overallAnalysisHint: string;
  noDiagnostics: string;
  workspaceBinaryUnsupported: string;
  workspacePreviewLoading: string;
  workspacePreviewFailed: string;
  workspacePreviewTruncated: string;
  workspaceAnalyzedFiles: (value: number) => string;
  reviewLoadFailed: string;
  exportFailed: string;
  startReview: string;
  rerunReview: string;
  exportMarkdown: string;
  startGitReviewHint: string;
  startWorkspaceReviewHint: string;
  workspaceReportPartialHint: string;
  workspaceAnalyzing: (completed: number, total: number) => string;
  workspaceAnalysisFailed: (failed: number) => string;
  refreshing: string;
  refreshFailed: string;
  resetFilters: string;
  detailSuggestion: string;
  detailEvidence: string;
  detailLine: (value: number) => string;
  summaryHigh: string;
  summaryMedium: string;
  summaryLow: string;
  findingFallback: string;
};

function createAiReviewCopy(language: LanguageCode): GitAiReviewCopy {
  if (language === "en-US") {
    return {
      searchPlaceholder: "Search findings or file paths",
      severityLabel: "Severity",
      categoryLabel: "Category",
      allSeverities: "All severities",
      allCategories: "All categories",
      severityText: (value) => {
        if (value === "high") {
          return "High";
        }
        if (value === "medium") {
          return "Medium";
        }
        return "Low";
      },
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
      emptyNoReview: "No changed files to review.",
      emptyNoFindings: "No findings match the current filters.",
      emptyNoSelection: "Select a finding to inspect the diff.",
      emptySelectionFiltered: "The selected finding is hidden by the current filters.",
      workspaceTreeEmpty: "No files in the current workspace.",
      filterTrigger: "Filters",
      modeGit: "Git review",
      modeWorkspace: "Project analysis",
      diagnosticsTitle: "Diagnostics",
      gitReviewTitle: "Git review",
      workspacePreviewTitle: "Source preview",
      overallAnalysisHint: "Select a file on the left to inspect project-wide diagnostics.",
      noDiagnostics: "No high-signal diagnostics were inferred for this file.",
      workspaceBinaryUnsupported: "This file cannot be previewed inline.",
      workspacePreviewLoading: "Loading file preview",
      workspacePreviewFailed: "Failed to load file preview",
      workspacePreviewTruncated: "Preview is truncated for large files.",
      workspaceAnalyzedFiles: (value) => `${value} files analyzed`,
      reviewLoadFailed: "Failed to load AI review data",
      exportFailed: "Failed to export markdown report",
      startReview: "Run review",
      rerunReview: "Run again",
      exportMarkdown: "Export Markdown",
      startGitReviewHint: "Run the review to load changed files and generate diagnostics for the current Git workspace.",
      startWorkspaceReviewHint: "Run the analysis to scan the current workspace, then pick files on the left to inspect project-wide diagnostics.",
      workspaceReportPartialHint: "The workspace report is generated from the current workspace scan. Files that fail to load are skipped.",
      workspaceAnalyzing: (completed, total) => `Analyzing ${completed} / ${total}`,
      workspaceAnalysisFailed: (failed) => `${failed} files failed to load during analysis`,
      refreshing: "Refreshing",
      refreshFailed: "Refresh failed",
      resetFilters: "Reset filters",
      detailSuggestion: "Suggested focus",
      detailEvidence: "Evidence",
      detailLine: (value) => `Line ${value}`,
      summaryHigh: "High risk",
      summaryMedium: "Medium risk",
      summaryLow: "Low risk",
      findingFallback: "Manual review suggested",
    };
  }

  return {
    searchPlaceholder: "搜索问题或文件路径",
    severityLabel: "严重度",
    categoryLabel: "类型",
    allSeverities: "全部严重度",
    allCategories: "全部类型",
    severityText: (value) => {
      if (value === "high") {
        return "高";
      }
      if (value === "medium") {
        return "中";
      }
      return "低";
    },
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
    emptyNoReview: "当前没有可审查的改动。",
    emptyNoFindings: "当前筛选条件下没有问题项。",
    emptyNoSelection: "选择左侧问题后查看差异详情。",
    emptySelectionFiltered: "当前选中问题已被筛选条件隐藏。",
    workspaceTreeEmpty: "当前工作区没有文件。",
    filterTrigger: "筛选",
    modeGit: "Git 审查",
    modeWorkspace: "全项目分析",
    diagnosticsTitle: "诊断",
    gitReviewTitle: "Git 审查",
    workspacePreviewTitle: "源码预览",
    overallAnalysisHint: "从左侧选择文件，查看当前项目的直接分析结果。",
    noDiagnostics: "当前文件没有推导出高信号诊断。",
    workspaceBinaryUnsupported: "当前文件暂不支持内联预览。",
    workspacePreviewLoading: "正在加载文件预览",
    workspacePreviewFailed: "加载文件预览失败",
    workspacePreviewTruncated: "文件较大，当前只显示截断预览。",
    workspaceAnalyzedFiles: (value) => `已分析 ${value} 个文件`,
    reviewLoadFailed: "加载审查数据失败",
    exportFailed: "导出 Markdown 报告失败",
    startReview: "开始审查",
    rerunReview: "重新审查",
    exportMarkdown: "导出 Markdown",
    startGitReviewHint: "点击开始审查后，加载当前 Git 改动并生成诊断。",
    startWorkspaceReviewHint: "点击开始审查后，会扫描当前工作区，再从左侧选择文件查看全项目诊断。",
    workspaceReportPartialHint: "全项目报告基于当前工作区扫描结果生成，读取失败的文件会被跳过。",
    workspaceAnalyzing: (completed, total) => `正在分析 ${completed} / ${total}`,
    workspaceAnalysisFailed: (failed) => `分析过程中有 ${failed} 个文件读取失败`,
    refreshing: "正在刷新",
    refreshFailed: "刷新失败",
    resetFilters: "重置筛选",
    detailSuggestion: "建议聚焦",
    detailEvidence: "触发依据",
    detailLine: (value) => `第 ${value} 行`,
    summaryHigh: "高风险",
    summaryMedium: "中风险",
    summaryLow: "低风险",
    findingFallback: "建议人工复核",
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
        suggestion: isEn
          ? "Resolve the conflict first, then rerun review on the final diff."
          : "先收敛冲突，再基于最终差异重新审查。",
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
        suggestion: isEn
          ? "Move the value to environment/config indirection or redact it before commit."
          : "优先改成环境变量、配置引用或提交前脱敏。",
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
        suggestion: isEn
          ? "Remove the statement or route it through the intended logger with an explicit level."
          : "移除该语句，或改成明确级别的正式日志。",
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
        suggestion: isEn
          ? "Prefer a narrower type, a local parser, or an explicit interface instead of a blanket bypass."
          : "优先改成更窄的类型、局部解析或显式接口，而不是整体绕过。",
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
        suggestion: isEn
          ? "Either close the gap now or convert it into an explicit tracked task with clear ownership."
          : "要么现在补齐，要么转成带责任人的明确跟踪项。",
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
        suggestion: isEn
          ? "Review the file by hunk or function boundary and confirm whether it should be split into smaller patches."
          : "建议按 hunk 或函数边界逐块复查，并评估是否值得拆成更小的提交。",
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
        suggestion: isEn
          ? "Confirm whether existing tests already cover the new path. If not, add at least one targeted regression case."
          : "确认现有测试是否已经覆盖；如果没有，至少补一条针对性的回归用例。",
        severity: "medium",
        category: "tests",
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      });
    }

    if (fileFindings.length === 0) {
      const firstAddedLine = skipPatchHeuristics ? undefined : collectAddedLines(item)[0]?.lineNumber;
      if (skipPatchHeuristics) {
        fileFindings.push({
          id: buildFindingId(item.path, "fallback-oversized"),
          path: item.path,
          title: isEn ? "Diff is too large for inline heuristics" : "差异过大，已跳过行级启发式分析",
          summary: isEn
            ? "This patch is large enough to make line-by-line heuristic scanning expensive in the UI thread."
            : "当前补丁体量过大，继续做行级启发式扫描会拖慢界面响应。",
          suggestion: isEn
            ? "Review the diff manually by chunk and narrow the patch if you want more precise AI findings."
            : "建议按块手动复核当前差异；如果需要更精确的问题项，优先收窄补丁范围。",
          severity: "medium",
          category: "diff",
          status: item.status,
          additions: item.additions,
          deletions: item.deletions,
        });
      } else if (item.status === "added" || item.status === "untracked") {
        fileFindings.push({
          id: buildFindingId(item.path, "fallback-added"),
          path: item.path,
          title: isEn ? "New file needs boundary review" : "新增文件需要确认边界",
          summary: isEn
            ? "New files frequently hide missing exports, missing config, or missing documentation updates."
            : "新增文件常见的遗漏点是导出、配置接线和文档同步。",
          suggestion: isEn
            ? "Check imports, wiring, config references, and the minimum smoke path for this file."
            : "优先检查导入接线、配置引用，以及最小可运行路径是否闭环。",
          severity: "low",
          category: "diff",
          status: item.status,
          lineNumber: firstAddedLine,
          additions: item.additions,
          deletions: item.deletions,
        });
      } else if (item.status === "deleted") {
        fileFindings.push({
          id: buildFindingId(item.path, "fallback-deleted"),
          path: item.path,
          title: isEn ? "Deletion impact should be verified" : "删除文件需要确认影响范围",
          summary: isEn
            ? "Deleting a file can leave stale imports, routes, docs, or build scripts behind."
            : "删除文件后，最容易遗漏的是旧 import、路由、文档和构建脚本引用。",
          suggestion: isEn
            ? "Verify references, routes, docs, and cleanup scripts before merge."
            : "合并前确认引用方、路由、文档和清理脚本都已同步处理。",
          severity: "low",
          category: "diff",
          status: item.status,
          additions: item.additions,
          deletions: item.deletions,
        });
      } else if (item.status === "renamed") {
        fileFindings.push({
          id: buildFindingId(item.path, "fallback-renamed"),
          path: item.path,
          title: isEn ? "Rename should be checked for reference drift" : "重命名需要确认引用同步",
          summary: isEn
            ? "Renames often require import, alias, or documentation updates outside the file itself."
            : "重命名通常会带出 import、路径别名或文档引用的同步问题。",
          suggestion: isEn
            ? "Check imports, scripts, docs, and generated references that may still use the old path."
            : "检查 import、脚本、文档和生成物里是否还残留旧路径。",
          severity: "low",
          category: "diff",
          status: item.status,
          additions: item.additions,
          deletions: item.deletions,
        });
      } else {
        fileFindings.push({
          id: buildFindingId(item.path, largeChange >= 80 ? "fallback-large" : "fallback-review"),
          path: item.path,
          title: largeChange >= 80
            ? (isEn ? "Large file delta should be reviewed by chunk" : "改动体量较大，建议分块复查")
            : (isEn ? "Manual review suggested" : "建议人工复核"),
          summary: largeChange >= 80
            ? (isEn
              ? "The file changed across a relatively large surface and deserves a more deliberate pass."
              : "这个文件的改动面不小，建议按功能块或 hunk 逐段确认。")
            : (isEn
              ? "No high-signal issue was inferred automatically, but the diff still needs a human pass on behavior and rollback risk."
              : "当前没有自动命中的高信号问题，但仍建议人工确认行为变化和回滚风险。"),
          suggestion: largeChange >= 80
            ? (isEn ? "Review the file by function boundary and confirm whether the change can be split." : "按函数或 hunk 边界复查，并评估是否值得拆分提交。")
            : (isEn ? "Confirm the behavior change, affected callers, and minimum regression path before merge." : "确认行为变化、受影响调用方，以及最小回归路径后再合并。"),
          severity: largeChange >= 80 ? "medium" : "low",
          category: "diff",
          status: item.status,
          lineNumber: firstAddedLine,
          additions: item.additions,
          deletions: item.deletions,
        });
      }
    }

    findings.push(...fileFindings);
  }

  const severityRank: Record<GitAiReviewSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return findings.sort((left, right) => {
    return severityRank[left.severity] - severityRank[right.severity]
      || right.additions + right.deletions - (left.additions + left.deletions)
      || left.path.localeCompare(right.path, "zh-Hans-CN-u-co-pinyin", {
        numeric: true,
        sensitivity: "base",
      })
      || left.title.localeCompare(right.title, "zh-Hans-CN-u-co-pinyin", {
        numeric: true,
        sensitivity: "base",
      });
  });
}

function GitAiReviewSeverityBadge(props: {
  severity: GitAiReviewSeverity;
  copy: GitAiReviewCopy;
}) {
  return (
    <span className={`git-ai-review-badge is-${props.severity}`}>
      {props.copy.severityText(props.severity)}
    </span>
  );
}

function GitAiReviewCategoryBadge(props: {
  category: GitAiReviewCategory;
  copy: GitAiReviewCopy;
}) {
  return (
    <span className="git-ai-review-meta-chip">
      {props.copy.categoryText(props.category)}
    </span>
  );
}

type GitAiReviewPathSummary = {
  findingCount: number;
  highestSeverity?: GitAiReviewSeverity;
};

function comparePathLabels(left: string, right: string) {
  return left.localeCompare(right, "zh-Hans-CN-u-co-pinyin", {
    numeric: true,
    sensitivity: "base",
  });
}

function buildGitTreeEntries(items: DesktopGitReviewItem[]): GitSectionEntry[] {
  return items
    .map((item) => ({
      path: item.path,
      previousPath: item.previousPath,
      status: item.status,
      additions: item.additions,
      deletions: item.deletions,
      item,
    }))
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

    const keepOpen = input.activePath
      ? input.activePath === node.path || input.activePath.startsWith(`${node.path}/`)
      : false;

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

function resolveFindingSummaryByPath(findings: GitAiReviewFinding[]) {
  const summaries = new Map<string, GitAiReviewPathSummary>();

  for (const finding of findings) {
    const current = summaries.get(finding.path);
    if (!current) {
      summaries.set(finding.path, {
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

    if ((finding.severity === "high")
      || (finding.severity === "medium" && current.highestSeverity === "low")) {
      current.highestSeverity = finding.severity;
    }
  }

  return summaries;
}

function buildWorkspaceFindingId(path: string, suffix: string) {
  return `workspace:${path}::${suffix}`;
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
      summary: isEn
        ? "This file is binary and cannot be scanned reliably with inline text heuristics."
        : "当前文件是二进制内容，无法用文本启发式可靠扫描。",
      suggestion: isEn
        ? "Review the source artifact or generated output manually."
        : "建议结合源文件或产物上下文进行人工复核。",
      severity: "low",
      category: "diff",
      status: "modified",
      additions: 0,
      deletions: 0,
    }];
  }

  const content = resolveWorkspaceAnalysisContent(input.result);
  const contentTooLarge = content.length >= MAX_WORKSPACE_ANALYSIS_CONTENT_LENGTH;
  if (contentTooLarge) {
    return [{
      id: buildWorkspaceFindingId(input.path, "oversized"),
      path: input.path,
      title: isEn ? "File is too large for inline project analysis" : "文件过大，已跳过内联项目分析",
      summary: isEn
        ? "Scanning the entire file inline would be too expensive for the current UI pass."
        : "在当前界面里全量扫描这个文件会带来过高的开销。",
      suggestion: isEn
        ? "Inspect this file by module boundary or narrow the scope before requesting deeper analysis."
        : "建议按模块边界拆开检查，或缩小范围后再做更深的分析。",
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
      summary: isEn
        ? "The file contains credential-like tokens or headers and should be checked for hardcoded secrets."
        : "文件里出现了类似凭据或授权头的信息，需要确认是否存在硬编码密钥。",
      suggestion: isEn
        ? "Move sensitive values behind environment or configuration indirection."
        : "把敏感值移到环境变量或配置引用里，不要直接写死在代码中。",
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
      summary: isEn
        ? "The file still contains debugging statements that may leak runtime details or pollute logs."
        : "文件里仍有调试语句，容易泄露运行时细节或污染日志。",
      suggestion: isEn
        ? "Remove the statement or move it behind a proper logger with an explicit level."
        : "移除该语句，或改成带明确级别的正式日志。",
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
      summary: isEn
        ? "This file uses any or ts-ignore and deserves a tighter contract."
        : "这个文件里存在 any 或 ts-ignore，建议收紧类型边界。",
      suggestion: isEn
        ? "Replace blanket bypasses with explicit interfaces or narrower local parsing."
        : "优先改成显式接口、局部解析或更窄的类型，而不是整体绕过。",
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
      summary: isEn
        ? "TODO or FIXME indicates unresolved work that should be validated before relying on this file."
        : "TODO 或 FIXME 表明这里还有未收口的工作，使用前需要确认边界。",
      suggestion: isEn
        ? "Either close the gap or turn it into a clearly tracked follow-up task."
        : "要么现在补齐，要么把它转成明确跟踪的后续任务。",
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
      summary: isEn
        ? "No high-signal issue was inferred automatically, but the file still merits a quick architecture and boundary check."
        : "当前没有自动命中的高信号问题，但仍建议快速确认架构边界和调用关系。",
      suggestion: isEn
        ? "Review exports, callers, config references, and the minimum execution path for this file."
        : "重点确认导出、调用方、配置引用和最小执行路径是否闭环。",
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

function buildGitMarkdownReport(input: {
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

  lines.push(`# ${isEn ? "Git AI Review Report" : "Git AI 审查报告"}`);
  lines.push("");
  lines.push(`- ${isEn ? "Generated at" : "生成时间"}: ${new Date().toISOString()}`);
  lines.push(`- ${isEn ? "Workspace" : "工作区"}: ${input.detail.rootPath}`);
  lines.push(`- ${isEn ? "Commit" : "提交"}: ${input.detail.hash}`);
  lines.push(`- ${isEn ? "Subject" : "标题"}: ${input.detail.subject}`);
  if (input.detail.authorName) {
    lines.push(`- ${isEn ? "Author" : "作者"}: ${input.detail.authorName}`);
  }
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
    lines.push(`- ${input.copy.diagnosticsTitle}: ${fileFindings.length}`);
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
  lines.push(`## ${isEn ? "Files" : "文件列表"}`);
  lines.push("");

  for (const path of analyzedPaths) {
    const fileFindings = input.findingsByPath.get(path) ?? [];
    const result = input.resultsByPath[path];
    lines.push(`## \`${path}\``);
    lines.push("");
    lines.push(`- ${isEn ? "Preview" : "预览"}: ${result.binary ? (isEn ? "Binary" : "二进制") : (result.truncated ? input.copy.workspacePreviewTruncated : (isEn ? "Full text" : "完整文本"))}`);
    lines.push(`- ${input.copy.diagnosticsTitle}: ${fileFindings.length}`);
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
  isCancelled: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}) {
  const results: Record<string, DesktopWorkspaceFileContentResult> = {};
  let completed = 0;
  let failed = 0;
  let firstError: string | null = null;
  let nextIndex = 0;
  const workerCount = Math.min(6, Math.max(input.filePaths.length, 1));

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

  return {
    results,
    failed,
    firstError,
  };
}

function buildCommitReviewFallbackItem(item: DesktopGitHistoryDetailFile): DesktopGitReviewItem {
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

type GitAiReviewHistoryTreeEntry = GitSectionEntry & {
  file: DesktopGitHistoryDetailFile;
};

function buildGitAiReviewHistoryTreeEntries(files: DesktopGitHistoryDetailFile[]): GitAiReviewHistoryTreeEntry[] {
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

async function loadCommitReviewResults(input: {
  workspaceId: string;
  baseRef: string;
  headRef: string;
  files: DesktopGitHistoryDetailFile[];
  isCancelled: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}) {
  const results: Record<string, DesktopGitReviewItem> = {};
  let completed = 0;
  let failed = 0;
  let firstError: string | null = null;
  let nextIndex = 0;
  const workerCount = Math.min(6, Math.max(input.files.length, 1));

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
        results[file.path] = result.item ?? buildCommitReviewFallbackItem(file);
      } catch (error) {
        failed += 1;
        firstError ??= normalizeError(error);
        results[file.path] = buildCommitReviewFallbackItem(file);
      } finally {
        completed += 1;
        input.onProgress?.(completed, input.files.length);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    results,
    failed,
    firstError,
  };
}

type GitAiReviewGitTreeProps = {
  nodes: GitChangeTreeNode[];
  collapsedDirectories: Record<string, boolean>;
  activePath?: string;
  summariesByPath: Map<string, GitAiReviewPathSummary>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
};

function GitAiReviewGitTree(props: GitAiReviewGitTreeProps & { level?: number }) {
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
                <WorkspaceFileIcon
                  path={node.path}
                  className="git-page-review-file-icon"
                  isDirectory
                  expanded={!collapsed}
                />
                <span className="git-page-change-tree-label">{node.name}</span>
                <span className="git-page-change-tree-count">{node.fileCount}</span>
              </button>
              {!collapsed && node.children.length > 0 ? (
                <GitAiReviewGitTree
                  {...props}
                  nodes={node.children}
                  level={level + 1}
                />
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
                {summary?.highestSeverity ? (
                  <span className={`git-ai-review-tree-badge is-${summary.highestSeverity}`}>{summary.findingCount}</span>
                ) : null}
                <WorkspaceDiffChanges className="git-page-change-tree-diff" changes={node.entry.item} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type GitAiReviewWorkspaceTreeProps = {
  path: string;
  nodesByDir: Record<string, DesktopWorkspaceFileTreeNode[]>;
  expandedByPath: Record<string, boolean>;
  loadingByPath: Record<string, boolean>;
  activePath?: string;
  allowed?: readonly string[];
  summariesByPath: Map<string, GitAiReviewPathSummary>;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  empty: ReactNode;
  level?: number;
};

function resolveWorkspaceNodeMarker(node: DesktopWorkspaceFileTreeNode, summary?: GitAiReviewPathSummary) {
  if (summary?.highestSeverity) {
    return <span className={`git-ai-review-tree-badge is-${summary.highestSeverity}`}>{summary.findingCount}</span>;
  }

  if (node.extension) {
    return <span className="git-ai-review-tree-badge is-neutral">.{node.extension.slice(0, 6)}</span>;
  }

  return null;
}

function GitAiReviewWorkspaceTree(props: GitAiReviewWorkspaceTreeProps) {
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
                <WorkspaceFileIcon
                  path={node.path}
                  className="git-page-review-file-icon"
                  isDirectory
                  expanded={!collapsed}
                />
                <span className="git-page-change-tree-label">{node.name}</span>
              </button>
              {!collapsed ? (
                <GitAiReviewWorkspaceTree
                  {...props}
                  path={node.path}
                  level={level + 1}
                />
              ) : null}
            </div>
          );
        }

        const isActive = props.activePath === node.path;
        const marker = resolveWorkspaceNodeMarker(node, props.summariesByPath.get(node.path));
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

export function GitAiReviewWorkbench(props: Props) {
  const aiCopy = useMemo(() => createAiReviewCopy(props.language), [props.language]);
  const [mode, setMode] = useState<GitAiReviewMode>("git");
  const [gitReviewRunId, setGitReviewRunId] = useState(0);
  const [workspaceAnalysisRunId, setWorkspaceAnalysisRunId] = useState(0);
  const [review, setReview] = useState<DesktopGitReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [workspaceFileResultByPath, setWorkspaceFileResultByPath] = useState<Record<string, DesktopWorkspaceFileContentResult>>({});
  const [workspaceAnalysisLoading, setWorkspaceAnalysisLoading] = useState(false);
  const [workspaceAnalysisProgress, setWorkspaceAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [workspaceAnalysisError, setWorkspaceAnalysisError] = useState<string | null>(null);
  const [workspaceFileLoading, setWorkspaceFileLoading] = useState(false);
  const [workspaceFileError, setWorkspaceFileError] = useState<string | null>(null);
  const [gitSelectedPath, setGitSelectedPath] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | GitAiReviewSeverity>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | GitAiReviewCategory>("all");
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>(undefined);
  const [filterOpen, setFilterOpen] = useState(false);
  const deferredSearchText = useDeferredValue(searchText);
  const hasTriggeredGitReview = gitReviewRunId > 0;
  const hasTriggeredWorkspaceAnalysis = workspaceAnalysisRunId > 0;
  const workspaceTree = useWorkspaceInspectorFileTree({
    active: mode === "workspace" && hasTriggeredWorkspaceAnalysis,
    workspaceId: props.workspaceId,
  });

  useEffect(() => {
    setGitReviewRunId(0);
    setWorkspaceAnalysisRunId(0);
    setReview(null);
    setReviewError(null);
    setReviewLoading(false);
    setReportError(null);
    setWorkspaceFileResultByPath({});
    setWorkspaceAnalysisLoading(false);
    setWorkspaceAnalysisProgress({ completed: 0, total: 0 });
    setWorkspaceAnalysisError(null);
    setWorkspaceFileLoading(false);
    setWorkspaceFileError(null);
    setGitSelectedPath(undefined);
    setSelectedFindingId(undefined);
  }, [props.workspaceId]);

  useEffect(() => {
    if (!props.workspaceId || gitReviewRunId === 0) {
      return;
    }

    let cancelled = false;
    setReviewLoading(true);
    setReviewError(null);
    setReportError(null);

    void getDesktopGitReview(props.workspaceId)
      .then((result) => {
        if (!cancelled) {
          setReview(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setReviewError(`${aiCopy.reviewLoadFailed}: ${normalizeError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiCopy.reviewLoadFailed, gitReviewRunId, props.workspaceId]);

  const findings = useMemo(() => buildGitAiReviewFindings({
    items: review?.items ?? [],
    language: props.language,
  }), [props.language, review?.items]);
  const findingsByPath = useMemo(() => {
    const out = new Map<string, GitAiReviewFinding[]>();
    for (const finding of findings) {
      const current = out.get(finding.path);
      if (current) {
        current.push(finding);
        continue;
      }
      out.set(finding.path, [finding]);
    }
    return out;
  }, [findings]);
  const workspaceFindingsByPath = useMemo(() => {
    const out = new Map<string, GitAiReviewFinding[]>();
    for (const [path, result] of Object.entries(workspaceFileResultByPath)) {
      out.set(path, buildWorkspaceAiReviewFindings({
        path,
        result,
        language: props.language,
      }));
    }
    return out;
  }, [props.language, workspaceFileResultByPath]);
  const gitSummariesByPath = useMemo(() => resolveFindingSummaryByPath(findings), [findings]);
  const workspaceSummariesByPath = useMemo(
    () => resolveFindingSummaryByPath([...workspaceFindingsByPath.values()].flat()),
    [workspaceFindingsByPath],
  );
  const gitReviewAvailable = hasTriggeredGitReview && review?.isGitRepo === true;
  const gitReviewUnavailable = hasTriggeredGitReview && review?.isGitRepo === false;
  const workspaceRootLoading = hasTriggeredWorkspaceAnalysis
    && workspaceTree.loadingByPath[""] === true
    && workspaceTree.nodesByDir[""] === undefined;

  const normalizedSearch = deferredSearchText.trim().toLowerCase();
  const gitTreeEntries = useMemo(() => buildGitTreeEntries(review?.items ?? []), [review?.items]);
  const visibleGitPaths = useMemo(() => {
    return gitTreeEntries
      .filter((entry) => {
        const pathMatches = !normalizedSearch || entry.path.toLowerCase().includes(normalizedSearch);
        const matchedFindings = (findingsByPath.get(entry.path) ?? []).filter((finding) => {
          if (severityFilter !== "all" && finding.severity !== severityFilter) {
            return false;
          }
          if (categoryFilter !== "all" && finding.category !== categoryFilter) {
            return false;
          }
          if (!normalizedSearch) {
            return true;
          }
          return [finding.title, finding.summary, finding.evidence]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedSearch));
        });
        if (severityFilter !== "all" || categoryFilter !== "all") {
          return matchedFindings.length > 0;
        }
        if (normalizedSearch) {
          return pathMatches || matchedFindings.length > 0;
        }
        return true;
      })
      .map((entry) => entry.path);
  }, [categoryFilter, findingsByPath, gitTreeEntries, normalizedSearch, severityFilter]);
  const visibleGitEntries = useMemo(
    () => gitTreeEntries.filter((entry) => visibleGitPaths.includes(entry.path)),
    [gitTreeEntries, visibleGitPaths],
  );
  const gitTreeNodes = useMemo(() => buildGitChangeTree(visibleGitEntries), [visibleGitEntries]);
  const [gitCollapsedDirectories, setGitCollapsedDirectories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setGitCollapsedDirectories(buildInitialCollapsedDirectories({
      nodes: gitTreeNodes,
      activePath: gitSelectedPath,
      collapseAll: visibleGitEntries.length >= 40,
    }));
  }, [gitSelectedPath, gitTreeNodes, visibleGitEntries.length]);

  useEffect(() => {
    if (mode !== "workspace" || !props.selectedReviewFilePath) {
      return;
    }
    if (!hasTriggeredWorkspaceAnalysis) {
      return;
    }
    if (workspaceTree.selectedFilePath === props.selectedReviewFilePath) {
      return;
    }
    workspaceTree.selectFile(props.selectedReviewFilePath);
  }, [hasTriggeredWorkspaceAnalysis, mode, props.selectedReviewFilePath, workspaceTree]);

  const workspaceAllowedPaths = useMemo(() => {
    if (!hasTriggeredWorkspaceAnalysis || !normalizedSearch) {
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
  }, [hasTriggeredWorkspaceAnalysis, normalizedSearch, workspaceTree.nodesByDir]);

  useEffect(() => {
    if (mode !== "git" || !gitReviewAvailable) {
      return;
    }

    const nextPath = props.selectedReviewFilePath && gitTreeEntries.some((entry) => entry.path === props.selectedReviewFilePath)
      ? props.selectedReviewFilePath
      : gitTreeEntries[0]?.path;
    if (nextPath && nextPath !== gitSelectedPath) {
      setGitSelectedPath(nextPath);
      return;
    }
    if (!nextPath && gitSelectedPath) {
      setGitSelectedPath(undefined);
    }
  }, [gitReviewAvailable, gitSelectedPath, gitTreeEntries, mode, props.selectedReviewFilePath]);

  useEffect(() => {
    if (mode === "git" && gitReviewAvailable && gitSelectedPath && gitSelectedPath !== props.selectedReviewFilePath) {
      props.onSelectedReviewFilePathChange?.(gitSelectedPath);
    }
  }, [gitReviewAvailable, gitSelectedPath, mode, props.onSelectedReviewFilePathChange, props.selectedReviewFilePath]);

  useEffect(() => {
    if (mode === "workspace"
      && hasTriggeredWorkspaceAnalysis
      && workspaceTree.selectedFilePath
      && workspaceTree.selectedFilePath !== props.selectedReviewFilePath) {
      props.onSelectedReviewFilePathChange?.(workspaceTree.selectedFilePath);
    }
  }, [hasTriggeredWorkspaceAnalysis, mode, props.onSelectedReviewFilePathChange, props.selectedReviewFilePath, workspaceTree.selectedFilePath]);

  const selectedGitItem = useMemo(() => {
    if (!gitReviewAvailable || !gitSelectedPath) {
      return null;
    }
    return review?.items.find((item) => item.path === gitSelectedPath) ?? null;
  }, [gitReviewAvailable, gitSelectedPath, review?.items]);
  const selectedGitFindings = useMemo(() => {
    if (!gitReviewAvailable || !gitSelectedPath) {
      return [];
    }
    return findingsByPath.get(gitSelectedPath) ?? [];
  }, [findingsByPath, gitReviewAvailable, gitSelectedPath]);
  const selectedWorkspacePath = hasTriggeredWorkspaceAnalysis ? (workspaceTree.selectedFilePath || undefined) : undefined;
  const selectedWorkspaceResult = selectedWorkspacePath ? workspaceFileResultByPath[selectedWorkspacePath] ?? null : null;
  const selectedWorkspaceFindings = useMemo(() => {
    if (!selectedWorkspacePath) {
      return [];
    }
    return workspaceFindingsByPath.get(selectedWorkspacePath) ?? [];
  }, [selectedWorkspacePath, workspaceFindingsByPath]);

  useEffect(() => {
    if (!props.workspaceId || workspaceAnalysisRunId === 0) {
      return;
    }

    let cancelled = false;
    setWorkspaceAnalysisLoading(true);
    setWorkspaceAnalysisProgress({ completed: 0, total: 0 });
    setWorkspaceAnalysisError(null);
    setWorkspaceFileError(null);

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
          return;
        }

        const output = await loadWorkspaceAnalysisResults({
          workspaceId: props.workspaceId,
          filePaths,
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
        if (output.failed > 0) {
          const suffix = output.firstError ? `: ${output.firstError}` : "";
          setWorkspaceAnalysisError(`${aiCopy.workspaceAnalysisFailed(output.failed)}${suffix}`);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceAnalysisError(normalizeError(error));
          setWorkspaceFileResultByPath({});
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
  }, [aiCopy, props.workspaceId, workspaceAnalysisRunId]);

  useEffect(() => {
    if (mode !== "workspace" || !hasTriggeredWorkspaceAnalysis || !selectedWorkspacePath) {
      return;
    }
    if (workspaceFileResultByPath[selectedWorkspacePath]) {
      setWorkspaceFileError(null);
      return;
    }

    let cancelled = false;
    setWorkspaceFileLoading(true);
    setWorkspaceFileError(null);
    void getDesktopWorkspaceFileContent(props.workspaceId, selectedWorkspacePath)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setWorkspaceFileResultByPath((current) => ({
          ...current,
          [selectedWorkspacePath]: result,
        }));
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
  }, [aiCopy.workspacePreviewFailed, hasTriggeredWorkspaceAnalysis, mode, props.workspaceId, selectedWorkspacePath, workspaceFileResultByPath]);

  useEffect(() => {
    if (!props.selectedReviewFindingId) {
      return;
    }

    const currentFindings = mode === "git" ? selectedGitFindings : selectedWorkspaceFindings;
    const matchedFinding = currentFindings.find((finding) => finding.id === props.selectedReviewFindingId);
    if (matchedFinding && matchedFinding.id !== selectedFindingId) {
      setSelectedFindingId(matchedFinding.id);
    }
  }, [mode, props.selectedReviewFindingId, selectedFindingId, selectedGitFindings, selectedWorkspaceFindings]);

  useEffect(() => {
    const currentFindings = mode === "git" ? selectedGitFindings : selectedWorkspaceFindings;
    if (currentFindings.length === 0) {
      setSelectedFindingId(undefined);
      return;
    }

    if (selectedFindingId && currentFindings.some((finding) => finding.id === selectedFindingId)) {
      return;
    }

    setSelectedFindingId(currentFindings[0]?.id);
  }, [mode, selectedFindingId, selectedGitFindings, selectedWorkspaceFindings]);

  const fileCount = review?.items.length ?? 0;
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const mediumCount = findings.filter((finding) => finding.severity === "medium").length;
  const lowCount = findings.filter((finding) => finding.severity === "low").length;
  const activeFilterCount = (severityFilter === "all" ? 0 : 1) + (categoryFilter === "all" ? 0 : 1);
  const hasActiveFilters = normalizedSearch.length > 0 || (mode === "git" && (severityFilter !== "all" || categoryFilter !== "all"));
  const isRefreshing = mode === "git" ? reviewLoading : (workspaceAnalysisLoading || workspaceRootLoading || workspaceFileLoading);
  const filterTriggerLabel = useMemo(() => {
    if (activeFilterCount === 0) {
      return aiCopy.filterTrigger;
    }

    const labels: string[] = [];
    if (severityFilter !== "all") {
      labels.push(aiCopy.severityText(severityFilter));
    }
    if (categoryFilter !== "all") {
      labels.push(aiCopy.categoryText(categoryFilter));
    }
    return labels.join(" / ");
  }, [activeFilterCount, aiCopy, categoryFilter, severityFilter]);

  function resetFilters() {
    setSearchText("");
    setSeverityFilter("all");
    setCategoryFilter("all");
    setFilterOpen(false);
  }

  function handleRunReview() {
    setReportError(null);
    if (mode === "git") {
      setSelectedFindingId(undefined);
      setGitSelectedPath(undefined);
      setReviewError(null);
      setGitReviewRunId((current) => current + 1);
      return;
    }

    setSelectedFindingId(undefined);
    setWorkspaceFileError(null);
    setWorkspaceFileResultByPath({});
    setWorkspaceAnalysisError(null);
    setWorkspaceAnalysisProgress({ completed: 0, total: 0 });
    setWorkspaceAnalysisRunId((current) => current + 1);
    if (hasTriggeredWorkspaceAnalysis) {
      void workspaceTree.refreshLoadedDirectories();
    }
  }

  const gitReportMarkdown = useMemo(() => {
    if (!gitReviewAvailable || !review) {
      return null;
    }

    return buildGitMarkdownReport({
      review,
      findings,
      findingsByPath,
      copy: aiCopy,
      statusText: props.copy.statusText,
      language: props.language,
    });
  }, [aiCopy, findings, findingsByPath, gitReviewAvailable, props.copy.statusText, props.language, review]);
  const analyzedWorkspaceFileCount = workspaceFindingsByPath.size;
  const workspaceReportMarkdown = useMemo(() => {
    if (analyzedWorkspaceFileCount === 0) {
      return null;
    }

    return buildWorkspaceMarkdownReport({
      rootPath: review?.rootPath ?? props.workspaceId,
      findingsByPath: workspaceFindingsByPath,
      resultsByPath: workspaceFileResultByPath,
      copy: aiCopy,
      statusText: props.copy.statusText,
      language: props.language,
    });
  }, [aiCopy, analyzedWorkspaceFileCount, props.copy.statusText, props.language, props.workspaceId, review?.rootPath, workspaceFileResultByPath, workspaceFindingsByPath]);
  const canExportMarkdown = mode === "git"
    ? Boolean(gitReportMarkdown) && !reviewLoading
    : Boolean(workspaceReportMarkdown) && !workspaceAnalysisLoading;

  function handleExportMarkdown() {
    const content = mode === "git" ? gitReportMarkdown : workspaceReportMarkdown;
    if (!content) {
      return;
    }

    try {
      const scope = mode === "git" ? "git-ai-review" : "workspace-analysis";
      const rootPath = review?.rootPath ?? props.workspaceId;
      const fileName = `${sanitizeMarkdownReportFileName(rootPath)}-${scope}-${buildMarkdownReportStamp()}.md`;
      downloadMarkdownReport(fileName, content);
      setReportError(null);
    } catch (error) {
      setReportError(`${aiCopy.exportFailed}: ${normalizeError(error)}`);
    }
  }

  useEffect(() => {
    const currentFindings = mode === "git" ? selectedGitFindings : selectedWorkspaceFindings;
    const selectedFinding = currentFindings.find((finding) => finding.id === selectedFindingId) ?? currentFindings[0];
    if (selectedFinding?.id !== props.selectedReviewFindingId) {
      props.onSelectedReviewFindingIdChange?.(selectedFinding?.id);
    }
  }, [mode, props.onSelectedReviewFindingIdChange, props.selectedReviewFindingId, selectedFindingId, selectedGitFindings, selectedWorkspaceFindings]);

  const currentFindings = mode === "git" ? selectedGitFindings : selectedWorkspaceFindings;
  const featuredFinding = useMemo(() => {
    if (!selectedFindingId) {
      return currentFindings[0] ?? null;
    }
    return currentFindings.find((finding) => finding.id === selectedFindingId) ?? currentFindings[0] ?? null;
  }, [currentFindings, selectedFindingId]);
  const detailPath = mode === "git"
    ? (gitReviewAvailable ? gitSelectedPath : undefined)
    : (hasTriggeredWorkspaceAnalysis ? selectedWorkspacePath : undefined);
  const showGitFilterTrigger = mode === "git" && gitReviewAvailable;
  const workspacePreviewContent = selectedWorkspaceResult ? resolveWorkspacePreviewContent(selectedWorkspaceResult) : null;
  const detailPathParts = detailPath ? splitWorkspaceReviewDirectory(detailPath) : null;
  const currentToolbarError = reportError
    ?? (mode === "git"
      ? (hasTriggeredGitReview ? reviewError : null)
      : (hasTriggeredWorkspaceAnalysis ? (workspaceAnalysisError ?? workspaceTree.fileTreeError ?? workspaceFileError) : null));
  const searchDisabled = mode === "git"
    ? !gitReviewAvailable
    : (!hasTriggeredWorkspaceAnalysis || Boolean(workspaceTree.fileTreeError && workspaceTree.nodesByDir[""] === undefined));
  const runButtonLabel = (mode === "git" ? hasTriggeredGitReview : hasTriggeredWorkspaceAnalysis)
    ? aiCopy.rerunReview
    : aiCopy.startReview;
  const runButtonLoading = mode === "git" ? reviewLoading : workspaceAnalysisLoading;

  return (
    <div className="git-page-workbench git-ai-review-workbench">
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
            <Input
              className="git-ai-review-toolbar-search"
              value={searchText}
              disabled={searchDisabled}
              allowClear
              placeholder={aiCopy.searchPlaceholder}
              onChange={(event) => setSearchText(event.target.value)}
            />
            {showGitFilterTrigger ? (
              <Popover
                trigger="click"
                placement="bottomLeft"
                open={filterOpen}
                onOpenChange={setFilterOpen}
                overlayClassName="git-ai-review-filter-popover-shell"
                content={(
                  <div className="git-ai-review-filter-popover">
                    <div className="git-ai-review-filter-section">
                      <span className="git-ai-review-filter-section-label">{aiCopy.severityLabel}</span>
                      <div className="git-ai-review-filter-options">
                        {([
                          { value: "all", label: aiCopy.allSeverities },
                          { value: "high", label: aiCopy.severityText("high") },
                          { value: "medium", label: aiCopy.severityText("medium") },
                          { value: "low", label: aiCopy.severityText("low") },
                        ] as const).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={option.value === severityFilter ? "git-ai-review-filter-option is-active" : "git-ai-review-filter-option"}
                            onClick={() => setSeverityFilter(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="git-ai-review-filter-section">
                      <span className="git-ai-review-filter-section-label">{aiCopy.categoryLabel}</span>
                      <div className="git-ai-review-filter-options">
                        {([
                          { value: "all", label: aiCopy.allCategories },
                          { value: "security", label: aiCopy.categoryText("security") },
                          { value: "quality", label: aiCopy.categoryText("quality") },
                          { value: "tests", label: aiCopy.categoryText("tests") },
                          { value: "maintainability", label: aiCopy.categoryText("maintainability") },
                          { value: "diff", label: aiCopy.categoryText("diff") },
                        ] as const).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={option.value === categoryFilter ? "git-ai-review-filter-option is-active" : "git-ai-review-filter-option"}
                            onClick={() => setCategoryFilter(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              >
                <button
                  type="button"
                  className={`git-ai-review-filter-trigger${filterOpen ? " is-open" : ""}${activeFilterCount > 0 ? " is-active" : ""}`}
                >
                  <FilterOutlined className="git-ai-review-filter-trigger-icon" />
                  <span className={`git-ai-review-filter-trigger-text${activeFilterCount === 0 ? " is-placeholder" : ""}`}>
                    {filterTriggerLabel}
                  </span>
                  {activeFilterCount > 0 ? (
                    <span className="git-ai-review-filter-trigger-count">{activeFilterCount}</span>
                  ) : null}
                </button>
              </Popover>
            ) : null}
            <Button onClick={handleExportMarkdown} disabled={!canExportMarkdown}>
              {aiCopy.exportMarkdown}
            </Button>
            <Button type="primary" onClick={handleRunReview} loading={runButtonLoading}>
              {runButtonLabel}
            </Button>
          </div>
          <div className="git-ai-review-toolbar-status-row">
            {isRefreshing ? (
              <span className="git-ai-review-toolbar-status">
                <Spin size="small" />
                <span>{mode === "workspace"
                  ? (workspaceAnalysisLoading
                    ? aiCopy.workspaceAnalyzing(workspaceAnalysisProgress.completed, workspaceAnalysisProgress.total)
                    : (workspaceFileLoading ? aiCopy.workspacePreviewLoading : aiCopy.refreshing))
                  : aiCopy.refreshing}
                </span>
              </span>
            ) : currentToolbarError ? (
              <span className="git-ai-review-toolbar-status is-error" title={currentToolbarError}>
                <span>{mode === "git" ? aiCopy.refreshFailed : currentToolbarError}</span>
              </span>
            ) : <span />}
            {hasActiveFilters ? (
              <Button type="text" size="small" className="git-ai-review-toolbar-action" onClick={resetFilters}>
                {aiCopy.resetFilters}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="git-ai-review-summary">
          {mode === "git" ? (
            gitReviewAvailable ? (
              <>
                <span className="git-ai-review-summary-chip">{aiCopy.findingsCount(findings.length)}</span>
                <span className="git-ai-review-summary-chip">{aiCopy.filesCount(fileCount)}</span>
                <span className="git-ai-review-summary-chip is-high">{aiCopy.summaryHigh} {highCount}</span>
                <span className="git-ai-review-summary-chip is-medium">{aiCopy.summaryMedium} {mediumCount}</span>
                <span className="git-ai-review-summary-chip is-low">{aiCopy.summaryLow} {lowCount}</span>
              </>
            ) : (
              <span className="git-ai-review-summary-chip">{aiCopy.modeGit}</span>
            )
          ) : (
            <>
              <span className="git-ai-review-summary-chip">{aiCopy.modeWorkspace}</span>
              {hasTriggeredWorkspaceAnalysis ? (
                <span className="git-ai-review-summary-chip">{aiCopy.workspaceAnalyzedFiles(analyzedWorkspaceFileCount)}</span>
              ) : null}
              {hasTriggeredWorkspaceAnalysis && workspaceAnalysisProgress.total > 0 ? (
                <span className="git-ai-review-summary-chip">{workspaceAnalysisProgress.completed} / {workspaceAnalysisProgress.total}</span>
              ) : null}
            </>
          )}
        </div>

        <div className="git-ai-review-tree-shell">
          {mode === "git" ? (
            !hasTriggeredGitReview ? (
              <div className="git-ai-review-empty is-inline">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.startGitReviewHint} />
              </div>
            ) : reviewLoading && !review ? (
              <div className="git-ai-review-empty is-inline">
                <Spin />
              </div>
            ) : reviewError && !review ? (
              <div className="git-ai-review-empty is-inline">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{reviewError}</Text>} />
              </div>
            ) : gitReviewUnavailable ? (
              <div className="git-ai-review-empty is-inline">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.copy.emptyNotGitRepo} />
              </div>
            ) : review && review.items.length === 0 ? (
              <div className="git-ai-review-empty is-inline">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoReview} />
              </div>
            ) : gitTreeNodes.length > 0 ? (
              <GitAiReviewGitTree
                nodes={gitTreeNodes}
                collapsedDirectories={gitCollapsedDirectories}
                activePath={gitSelectedPath}
                summariesByPath={gitSummariesByPath}
                onToggleDirectory={(path) => {
                  setGitCollapsedDirectories((current) => ({
                    ...current,
                    [path]: !current[path],
                  }));
                }}
                onSelectFile={(path) => {
                  setGitSelectedPath(path);
                  props.onSelectedReviewFilePathChange?.(path);
                }}
              />
            ) : (
              <div className="git-ai-review-empty is-inline">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoFindings}>
                  {hasActiveFilters ? (
                    <Button size="small" onClick={resetFilters}>{aiCopy.resetFilters}</Button>
                  ) : null}
                </Empty>
              </div>
            )
          ) : !hasTriggeredWorkspaceAnalysis ? (
            <div className="git-ai-review-empty is-inline">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.startWorkspaceReviewHint} />
            </div>
          ) : workspaceTree.fileTreeError && workspaceTree.nodesByDir[""] === undefined ? (
            <div className="git-ai-review-empty is-inline">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{workspaceTree.fileTreeError}</Text>} />
            </div>
          ) : workspaceAnalysisLoading && workspaceAnalysisProgress.total === 0 ? (
            <div className="git-ai-review-empty is-inline">
              <Spin />
            </div>
          ) : (
            <GitAiReviewWorkspaceTree
              path=""
              nodesByDir={workspaceTree.nodesByDir}
              expandedByPath={workspaceTree.expandedByPath}
              loadingByPath={workspaceTree.loadingByPath}
              activePath={selectedWorkspacePath}
              allowed={workspaceAllowedPaths}
              summariesByPath={workspaceSummariesByPath}
              onToggleDirectory={workspaceTree.toggleFilesDirectory}
              onSelectFile={(path) => {
                workspaceTree.selectFile(path);
                props.onSelectedReviewFilePathChange?.(path);
              }}
              empty={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.workspaceTreeEmpty} />}
            />
          )}
        </div>
      </div>

      <div className="git-page-workbench-preview git-ai-review-detail">
        {mode === "git" && !hasTriggeredGitReview ? (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.startGitReviewHint} />
          </div>
        ) : mode === "git" && reviewLoading && !review ? (
          <div className="git-ai-review-empty">
            <Spin />
          </div>
        ) : mode === "git" && reviewError && !review ? (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{reviewError}</Text>} />
          </div>
        ) : mode === "git" && gitReviewUnavailable ? (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.copy.emptyNotGitRepo} />
          </div>
        ) : mode === "git" && review && review.items.length === 0 ? (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.emptyNoReview} />
          </div>
        ) : mode === "workspace" && !hasTriggeredWorkspaceAnalysis ? (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={aiCopy.startWorkspaceReviewHint} />
          </div>
        ) : mode === "workspace" && workspaceTree.fileTreeError && workspaceTree.nodesByDir[""] === undefined ? (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">{workspaceTree.fileTreeError}</Text>} />
          </div>
        ) : mode === "workspace" && workspaceAnalysisLoading && workspaceAnalysisProgress.total === 0 ? (
          <div className="git-ai-review-empty">
            <Spin />
          </div>
        ) : detailPath ? (
          <>
            <div className="git-ai-review-detail-copy">
              <div className="git-ai-review-detail-head">
                <div className="git-ai-review-detail-title-block">
                  <div className="git-ai-review-detail-title-row">
                    <Text className="git-ai-review-detail-title">{detailPathParts?.filename ?? detailPath}</Text>
                    <span className="git-ai-review-meta-chip">{mode === "git" ? aiCopy.modeGit : aiCopy.modeWorkspace}</span>
                    {featuredFinding ? <GitAiReviewSeverityBadge severity={featuredFinding.severity} copy={aiCopy} /> : null}
                  </div>
                  <div className="git-ai-review-detail-meta-row">
                    <span className="git-ai-review-meta-chip">{aiCopy.diagnosticsTitle} {currentFindings.length}</span>
                    {mode === "git" && selectedGitItem ? (
                      <span className="git-ai-review-meta-chip">{props.copy.statusText(selectedGitItem.status)}</span>
                    ) : null}
                    {featuredFinding?.lineNumber ? <span className="git-ai-review-meta-chip">{aiCopy.detailLine(featuredFinding.lineNumber)}</span> : null}
                  </div>
                </div>
                                  <div className="git-ai-review-detail-path">
                                    <WorkspaceFileIcon path={detailPath} className="git-page-review-file-icon" />
                                    <span>{detailPathParts?.directory || detailPath}</span>
                                  </div>
                                </div>

                                {featuredFinding ? (
                                  <>
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

                                    <div className="git-ai-review-diagnostic-list">
                                      {currentFindings.map((finding) => (
                                        <button
                                          key={finding.id}
                                          type="button"
                                          className={finding.id === featuredFinding.id ? "git-ai-review-diagnostic-pill is-active" : "git-ai-review-diagnostic-pill"}
                                          onClick={() => setSelectedFindingId(finding.id)}
                                        >
                                          <GitAiReviewSeverityBadge severity={finding.severity} copy={aiCopy} />
                                          <span className="git-ai-review-diagnostic-pill-title">{finding.title}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                ) : (
                                  <Paragraph className="git-ai-review-detail-summary">{aiCopy.noDiagnostics}</Paragraph>
                                )}
                              </div>

                              <div className="git-ai-review-detail-preview">
                                <div className="git-ai-review-detail-preview-header">
                                  <Text className="git-ai-review-detail-section-label">{mode === "git" ? aiCopy.gitReviewTitle : aiCopy.workspacePreviewTitle}</Text>
                                  {mode === "workspace" && selectedWorkspaceResult?.truncated ? (
                                    <span className="git-ai-review-meta-chip">{aiCopy.workspacePreviewTruncated}</span>
                                  ) : null}
                                </div>
                                {mode === "git" ? (
                                  <GitDiffPreview
                                    copy={props.copy}
                                    item={selectedGitItem}
                                    emptyDescription={aiCopy.emptyNoSelection}
                                  />
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
                            </>
        ) : (
          <div className="git-ai-review-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={mode === "git" ? aiCopy.emptyNoSelection : aiCopy.overallAnalysisHint} />
          </div>
        )}
      </div>
    </div>
  );
}
