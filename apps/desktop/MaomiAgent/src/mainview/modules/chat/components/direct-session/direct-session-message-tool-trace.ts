import {
  readProjectedConversationToolOutputPreview,
  readProjectedConversationToolOutputSummary,
} from "./direct-session-session-detail-projection";

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function readFirstNonEmptyLine(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
}

function extractPathLeaf(path: string) {
  const normalized = trimText(path).replaceAll("\\", "/");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function isTerminalToolName(toolName: string) {
  return trimText(toolName).toLowerCase().startsWith("terminal_");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

const TOOL_LABEL_FALLBACKS = {
  workspace_read_file: {
    "en-US": "Read workspace file",
    "zh-CN": "读取工作区文件",
  },
  git_list_changes: {
    "en-US": "Inspect git changes",
    "zh-CN": "检查 Git 变更",
  },
  git_read_file_diff: {
    "en-US": "Review git file diff",
    "zh-CN": "查看 Git 文件差异",
  },
  update_managed_task: {
    "en-US": "Update managed task",
    "zh-CN": "更新任务",
  },
  terminal_create_session: {
    "en-US": "Create terminal session",
    "zh-CN": "创建终端会话",
  },
  terminal_execute: {
    "en-US": "Execute terminal command",
    "zh-CN": "执行终端命令",
  },
  terminal_read_output: {
    "en-US": "Read terminal output",
    "zh-CN": "读取终端输出",
  },
  terminal_close_session: {
    "en-US": "Close terminal session",
    "zh-CN": "关闭终端会话",
  },
  run_in_terminal: {
    "en-US": "Run command",
    "zh-CN": "执行命令",
  },
  apply_patch: {
    "en-US": "Apply patch",
    "zh-CN": "应用补丁",
  },
  read_file: {
    "en-US": "Read file",
    "zh-CN": "读取文件",
  },
  list_dir: {
    "en-US": "List directory",
    "zh-CN": "列出目录",
  },
  file_search: {
    "en-US": "Find files",
    "zh-CN": "查找文件",
  },
  grep_search: {
    "en-US": "Search text",
    "zh-CN": "搜索文本",
  },
} satisfies Record<string, { "en-US": string; "zh-CN": string }>;

type ResolveCommandLikeToolHeadlineInput = {
  toolName: string;
  isEn: boolean;
  operationKind?: string;
  command?: string;
  summary?: string;
  preview?: string;
  output?: unknown;
};

function humanizeGitStatusPreviewLine(line: string, isEn: boolean) {
  const match = line.match(/^([ MADRCU?!]{1,2})\s+(.+)$/u);
  if (!match) {
    return undefined;
  }

  const code = match[1].trim();
  const path = extractPathLeaf(match[2] ?? "");
  if (!path) {
    return undefined;
  }

  const statusLabel = (() => {
    switch (code) {
      case "M":
        return isEn ? "Modified" : "已修改";
      case "A":
        return isEn ? "Added" : "已新增";
      case "D":
        return isEn ? "Deleted" : "已删除";
      case "R":
        return isEn ? "Renamed" : "已重命名";
      case "C":
        return isEn ? "Copied" : "已复制";
      case "??":
        return isEn ? "Untracked" : "未跟踪";
      case "U":
      case "UU":
        return isEn ? "Conflict" : "冲突";
      default:
        return undefined;
    }
  })();

  return statusLabel ? `${statusLabel} · ${path}` : undefined;
}

export function resolveToolDisplayNameFallback(toolName: string, isEn: boolean) {
  const normalizedToolName = trimText(toolName).toLowerCase();
  if (!normalizedToolName) {
    return isEn ? "Tool" : "工具";
  }

  const localizedLabel = TOOL_LABEL_FALLBACKS[normalizedToolName as keyof typeof TOOL_LABEL_FALLBACKS];
  if (localizedLabel) {
    return localizedLabel[isEn ? "en-US" : "zh-CN"];
  }

  const humanized = titleCaseWords(normalizedToolName.replace(/[_-]+/gu, " "));
  return humanized || (isEn ? "Tool" : "工具");
}

export function resolveCommandLikeToolHeadline(input: ResolveCommandLikeToolHeadlineInput) {
  if (!isTerminalToolName(input.toolName) && input.operationKind !== "command_execution") {
    return undefined;
  }

  const command = trimText(input.command);
  if (command) {
    return truncateText(command, 88);
  }

  const projectedSummary = readProjectedConversationToolOutputSummary(input.output);
  if (projectedSummary) {
    return truncateText(projectedSummary, 88);
  }

  const previewLine = readFirstNonEmptyLine(
    input.preview ?? readProjectedConversationToolOutputPreview(input.output),
  );
  if (previewLine) {
    return truncateText(humanizeGitStatusPreviewLine(previewLine, input.isEn) ?? previewLine, 88);
  }

  const summary = trimText(input.summary);
  if (summary) {
    return summary;
  }

  const output = isRecord(input.output) ? input.output : undefined;
  const outputLine = output
    ? readFirstNonEmptyLine(
      trimText(output.output)
      || trimText(output.text)
      || trimText(output.message),
    )
    : undefined;
  if (outputLine) {
    return truncateText(humanizeGitStatusPreviewLine(outputLine, input.isEn) ?? outputLine, 88);
  }

  const title = output ? trimText(output.title) : "";
  if (title) {
    return truncateText(title, 88);
  }

  const cwd = output ? trimText(output.cwd) : "";
  if (cwd) {
    return truncateText(cwd, 88);
  }

  return undefined;
}
