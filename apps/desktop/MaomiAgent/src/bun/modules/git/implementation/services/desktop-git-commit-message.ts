import type {
  DesktopGitChangeItem as WorkspaceGitChangeItem,
  DesktopGitChangesResult as WorkspaceGitChangesResult,
} from "../../../../../shared/desktop-git";

type ConventionalCommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "docs"
  | "style"
  | "test"
  | "perf"
  | "build"
  | "ci"
  | "chore";

type CommitDomainSignal = {
  key: string;
  scope?: string;
  label: string;
  weight: number;
  patterns: RegExp[];
};

const DOC_PATH_RE = /(?:^|\/)docs(?:\/|$)|\.(?:md|mdx|txt)$/i;
const TEST_PATH_RE = /(?:^|\/)(?:tests?|__tests__|specs?)(?:\/|$)|(?:^|[-_.])(test|spec)(?:[-_.]|$)|\.(?:test|spec)\.[^.]+$/i;
const STYLE_PATH_RE = /\.(?:css|less|scss|sass)$/i;
const BUILD_PATH_RE = /(?:^|\/)(?:package\.json|package-lock\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\.[^.]+)?\.json|vite\.config\.[^.]+|webpack(?:\.[^.]+)?\.[^.]+|rollup\.config\.[^.]+|dockerfile|compose\.ya?ml|turbo\.json)$/i;
const CI_PATH_RE = /(?:^|\/)(?:\.github\/workflows\/|\.gitlab-ci\.ya?ml|azure-pipelines\.ya?ml|jenkinsfile|\.circleci\/)/i;
const PERF_PATH_RE = /(?:^|[-_.])(perf|benchmark|bench)(?:[-_.]|$)/i;

const COMMIT_DOMAIN_SIGNALS: CommitDomainSignal[] = [
  {
    key: "git",
    scope: "git",
    label: "Git 面板",
    weight: 12,
    patterns: [
      /workspace-git-panel/i,
      /workspace-inspector-(?:changes|review|state|tree)/i,
      /(?:^|\/)(?:git|vcs)(?:\/|[-_.])/i,
    ],
  },
  {
    key: "conversation",
    scope: "conversation",
    label: "会话流程",
    weight: 10,
    patterns: [/(?:^|\/)conversation(?:\/|[-_.])/i],
  },
  {
    key: "chat",
    scope: "chat",
    label: "聊天页",
    weight: 9,
    patterns: [/chat-page/i, /(?:^|\/)assistant-/i, /(?:^|\/)session-/i],
  },
  {
    key: "workspace",
    scope: "workspace",
    label: "工作区",
    weight: 8,
    patterns: [/(?:^|\/)workspace(?:\/|[-_.])/i, /workbench/i],
  },
  {
    key: "terminal",
    scope: "terminal",
    label: "终端交互",
    weight: 7,
    patterns: [/terminal/i, /shell/i],
  },
  {
    key: "tasks",
    scope: "tasks",
    label: "任务页",
    weight: 8,
    patterns: [/tasks?-page/i, /(?:^|\/)tasks?(?:\/|[-_.])/i],
  },
  {
    key: "runtime",
    scope: "runtime",
    label: "运行时",
    weight: 6,
    patterns: [/(?:^|\/)runtime(?:\/|[-_.])/i, /sidecar/i],
  },
  {
    key: "docs",
    scope: "docs",
    label: "文档",
    weight: 5,
    patterns: [DOC_PATH_RE],
  },
  {
    key: "tests",
    scope: "test",
    label: "测试",
    weight: 5,
    patterns: [TEST_PATH_RE],
  },
];

const GENERIC_SEGMENTS = new Set([
  "app",
  "src",
  "components",
  "component",
  "services",
  "service",
  "modules",
  "module",
  "shared",
  "runtime",
  "tests",
  "test",
  "docs",
  "pages",
  "page",
  "index",
  "main",
  "lib",
  "utils",
  "helpers",
]);

function normalizeGitPath(path: string) {
  return path.replaceAll("\\", "/");
}

function summarizeGenericSegment(segment: string) {
  const normalized = segment
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase();
  if (!normalized || GENERIC_SEGMENTS.has(normalized)) {
    return "";
  }
  return normalized.replace(/[-_]+/g, " ");
}

function joinVerbAndTarget(verb: string, target: string) {
  return /^[a-z0-9]/i.test(target) ? `${verb} ${target}` : `${verb}${target}`;
}

function looksLikeDocsOnly(items: WorkspaceGitChangeItem[]) {
  return items.length > 0 && items.every((item) => DOC_PATH_RE.test(normalizeGitPath(item.path)));
}

function looksLikeTestsOnly(items: WorkspaceGitChangeItem[]) {
  return items.length > 0 && items.every((item) => TEST_PATH_RE.test(normalizeGitPath(item.path)));
}

function looksLikeStyleOnly(items: WorkspaceGitChangeItem[]) {
  return items.length > 0 && items.every((item) => STYLE_PATH_RE.test(normalizeGitPath(item.path)));
}

function looksLikeBuildOnly(items: WorkspaceGitChangeItem[]) {
  return items.length > 0 && items.every((item) => BUILD_PATH_RE.test(normalizeGitPath(item.path)));
}

function looksLikeCiOnly(items: WorkspaceGitChangeItem[]) {
  return items.length > 0 && items.every((item) => CI_PATH_RE.test(normalizeGitPath(item.path)));
}

function looksLikePerfHeavy(items: WorkspaceGitChangeItem[]) {
  return items.some((item) => {
    const path = normalizeGitPath(item.path);
    return PERF_PATH_RE.test(path) || /(?:^|\/)(?:perf|benchmark|bench)(?:\/|$)/i.test(path);
  });
}

function inferCommitType(items: WorkspaceGitChangeItem[]): ConventionalCommitType {
  const statuses = new Set(items.map((item) => item.status));
  if (looksLikeDocsOnly(items)) {
    return "docs";
  }
  if (looksLikeTestsOnly(items)) {
    return "test";
  }
  if (looksLikeCiOnly(items)) {
    return "ci";
  }
  if (looksLikeBuildOnly(items)) {
    return "build";
  }
  if (looksLikeStyleOnly(items)) {
    return "style";
  }
  if (looksLikePerfHeavy(items)) {
    return "perf";
  }
  if (statuses.has("conflict")) {
    return "fix";
  }
  if (items.some((item) => item.status === "added" || item.status === "untracked")) {
    return "feat";
  }
  const totalAdditions = items.reduce((sum, item) => sum + item.additions, 0);
  const totalDeletions = items.reduce((sum, item) => sum + item.deletions, 0);
  if (statuses.size === 1 && statuses.has("deleted")) {
    return "chore";
  }
  if (totalDeletions > totalAdditions * 1.3) {
    return "refactor";
  }
  return "refactor";
}

function inferCommitContext(items: WorkspaceGitChangeItem[]) {
  const scores = new Map<string, { signal: CommitDomainSignal; score: number }>();
  for (const item of items) {
    const path = normalizeGitPath(item.path);
    for (const signal of COMMIT_DOMAIN_SIGNALS) {
      if (!signal.patterns.some((pattern) => pattern.test(path))) {
        continue;
      }
      const current = scores.get(signal.key);
      if (current) {
        current.score += signal.weight;
      } else {
        scores.set(signal.key, { signal, score: signal.weight });
      }
    }
  }

  const ranked = [...scores.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return right.signal.weight - left.signal.weight;
  });

  if (ranked.length > 0) {
    return {
      scope: ranked[0]?.signal.scope,
      label: ranked
        .slice(0, 2)
        .map((item) => item.signal.label)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join("与"),
    };
  }

  const segmentCounts = new Map<string, number>();
  for (const item of items) {
    const parts = normalizeGitPath(item.path).split("/").filter(Boolean);
    const basename = summarizeGenericSegment(parts[parts.length - 1] ?? "");
    const dirname = summarizeGenericSegment(parts[parts.length - 2] ?? "");
    for (const segment of [basename, dirname]) {
      if (!segment) {
        continue;
      }
      segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
    }
  }

  const label = [...segmentCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([segment]) => segment)
    .join(" / ");

  return {
    scope: undefined,
    label: label || "代码结构",
  };
}

function buildCommitSubject(type: ConventionalCommitType, label: string) {
  if (!label || label === "代码结构") {
    switch (type) {
      case "feat":
        return "增强代码结构";
      case "fix":
        return "修复代码变更问题";
      case "refactor":
        return "重构代码结构";
      case "docs":
        return "更新文档";
      case "style":
        return "统一界面样式";
      case "test":
        return "补充测试用例";
      case "perf":
        return "优化性能表现";
      case "build":
        return "调整构建配置";
      case "ci":
        return "更新持续集成配置";
      case "chore":
        return "整理工程配置";
    }
  }

  switch (type) {
    case "feat":
      return joinVerbAndTarget("增强", label);
    case "fix":
      return `${joinVerbAndTarget("修复", label)}问题`;
    case "refactor":
      return joinVerbAndTarget("重构", label);
    case "docs":
      return label.includes("文档") ? joinVerbAndTarget("更新", label) : `${joinVerbAndTarget("补充", label)}文档`;
    case "style":
      return label.includes("样式") ? joinVerbAndTarget("统一", label) : `${joinVerbAndTarget("调整", label)}样式`;
    case "test":
      return label.includes("测试") ? joinVerbAndTarget("补充", label) : `${joinVerbAndTarget("补充", label)}测试`;
    case "perf":
      return `${joinVerbAndTarget("优化", label)}性能`;
    case "build":
      return `${joinVerbAndTarget("调整", label)}构建配置`;
    case "ci":
      return `${joinVerbAndTarget("更新", label)}流水线配置`;
    case "chore":
      return `${joinVerbAndTarget("整理", label)}配置`;
  }
}

function buildCommitTypeVariants(primary: ConventionalCommitType): ConventionalCommitType[] {
  switch (primary) {
    case "docs":
      return ["docs", "chore", "refactor"];
    case "style":
      return ["style", "refactor", "feat"];
    case "test":
      return ["test", "fix", "refactor"];
    case "perf":
      return ["perf", "refactor", "fix"];
    case "build":
      return ["build", "chore", "ci"];
    case "ci":
      return ["ci", "chore", "build"];
    case "feat":
      return ["feat", "refactor", "fix"];
    case "fix":
      return ["fix", "refactor", "feat"];
    case "chore":
      return ["chore", "refactor", "feat"];
    case "refactor":
    default:
      return ["refactor", "feat", "fix"];
  }
}

function dedupeSuggestions(items: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next.slice(0, 3);
}

export function summarizeGitCommitItems(items: WorkspaceGitChangeItem[]) {
  return items
    .slice(0, 12)
    .map((item) => `- ${item.status} ${item.path} (+${item.additions}/-${item.deletions})`)
    .join("\n");
}

export function pickGitCommitScope<TItem extends WorkspaceGitChangeItem>(input: {
  changes: Omit<WorkspaceGitChangesResult, "items"> & {
    items: TItem[];
  };
  requestedScope?: "changed" | "staged";
}) {
  const stagedItems = input.changes.items.filter((item) => Boolean(item.stagedStatus));
  if (input.requestedScope === "staged" && stagedItems.length > 0) {
    return { scope: "staged" as const, items: stagedItems };
  }
  if (!input.requestedScope && stagedItems.length > 0) {
    return { scope: "staged" as const, items: stagedItems };
  }
  return { scope: "changed" as const, items: input.changes.items };
}

export function buildHeuristicGitCommitSuggestions(items: WorkspaceGitChangeItem[]) {
  const primaryType = inferCommitType(items);
  const context = inferCommitContext(items);
  return dedupeSuggestions(
    buildCommitTypeVariants(primaryType).map((type) => {
      const scope = context.scope && context.scope !== type ? `(${context.scope})` : "";
      return `${type}${scope}: ${buildCommitSubject(type, context.label)}`;
    }),
  );
}