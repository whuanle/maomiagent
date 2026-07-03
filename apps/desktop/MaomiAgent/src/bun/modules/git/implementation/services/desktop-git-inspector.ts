import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  DesktopGitBranchItem as WorkspaceGitBranchItem,
  DesktopGitBranchesResult as WorkspaceGitBranchesResult,
  DesktopGitChangeItem as WorkspaceGitChangeItem,
  DesktopGitChangeStatus as WorkspaceGitChangeStatus,
  DesktopGitChangesResult as WorkspaceGitChangesResult,
  DesktopGitCommitResetMode as WorkspaceGitCommitResetMode,
  DesktopGitCompareResult as WorkspaceGitCompareResult,
  DesktopGitChangesSummary as WorkspaceGitChangesSummary,
  DesktopGitHistoryDetailFile as WorkspaceGitHistoryDetailFile,
  DesktopGitHistoryDetailResult as WorkspaceGitHistoryDetailResult,
  DesktopGitHistoryItem as WorkspaceGitHistoryItem,
  DesktopGitHistoryResult as WorkspaceGitHistoryResult,
  DesktopGitHunkItem as WorkspaceGitHunkItem,
  DesktopGitHunkSection as WorkspaceGitHunkSection,
  DesktopGitHunksResult as WorkspaceGitHunksResult,
  DesktopGitOperationResult as WorkspaceGitOperationResult,
  DesktopGitReviewItem as WorkspaceGitReviewItem,
  DesktopGitReviewDetailResult as WorkspaceGitReviewDetailResult,
  DesktopGitReviewScope as WorkspaceGitReviewScope,
  DesktopGitRepositorySettings as WorkspaceGitRepositorySettings,
  DesktopGitRemoteSetting as WorkspaceGitRemoteSetting,
  DesktopGitSettingsResult as WorkspaceGitSettingsResult,
  DesktopGitReviewResult as WorkspaceGitReviewResult,
  DesktopGitStashItem as WorkspaceGitStashItem,
  DesktopGitStashesResult as WorkspaceGitStashesResult,
  DesktopGitWorktreeItem as WorkspaceGitWorktreeItem,
  DesktopGitWorktreesResult as WorkspaceGitWorktreesResult,
  DesktopGitGlobalSettings as WorkspaceGitGlobalSettings,
} from "../../../../../shared/desktop-git";
import {
  buildScopedDesktopGitResult as buildScopedWorkspaceGitResult,
  normalizeDesktopGitReviewScope as normalizeWorkspaceGitReviewScope,
} from "./desktop-git-review-scope";
import { DesktopGitError as RuntimeWorkspaceError } from "./desktop-git-error";

type GitCommandResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type ParsedGitStatusEntry = {
  path: string;
  previousPath?: string;
  status: WorkspaceGitChangeStatus;
  stagedStatus?: string;
  unstagedStatus?: string;
};

type DiffStat = {
  additions: number;
  deletions: number;
};

type WorkspaceGitScope = {
  workspaceRootPath: string;
  gitRootPath: string;
  workspacePrefix: string;
};

type WorkspaceGitReviewDetailMode = "batch" | "detail";

let cachedGitCommandExecutable: string | null = null;
let gitCommandExecutableResolver: Promise<string> | null = null;

const DEFAULT_PROCESS_TIMEOUT_MS = 12_000;
const MAX_REVIEW_DETAILED_ITEMS = 12;
const MAX_REVIEW_TOTAL_BYTES = 2_000_000;
const MAX_REVIEW_TEXT_CHARS = 8_000;
const MAX_REVIEW_PATCH_CHARS = 16_000;
const MAX_REVIEW_DETAIL_TEXT_CHARS = 120_000;
const MAX_REVIEW_DETAIL_PATCH_CHARS = 180_000;
const REVIEW_TRUNCATED_MARKER = "\n\n[review truncated to keep the inspector responsive]";
const REVIEW_OMITTED_MESSAGE =
  "[review omitted to keep the inspector responsive; open the file from Changes or Files for full content]";

function normalizeSlashes(input: string): string {
  return input.replaceAll("\\", "/");
}

function normalizeGitWorkspacePrefix(input: string): string {
  return normalizeSlashes(input.trim()).replace(/\/+$/, "");
}

function buildWorkspaceGitPathspecs(scope: WorkspaceGitScope): string[] {
  return [scope.workspacePrefix || "."];
}

function appendGitPathspec(args: string[], pathspecs: string[]): string[] {
  return [...args, "--", ...pathspecs];
}

function toWorkspaceGitRepoPath(
  scope: WorkspaceGitScope,
  workspaceRelativePath?: string,
): string | undefined {
  const normalizedPath = normalizeRelativePath(workspaceRelativePath);
  if (!normalizedPath) {
    return undefined;
  }

  return scope.workspacePrefix ? `${scope.workspacePrefix}/${normalizedPath}` : normalizedPath;
}

function mapRepoGitPathToWorkspace(
  scope: WorkspaceGitScope,
  repoRelativePath?: string,
): string | undefined {
  const normalizedPath = normalizeGitPathToken(repoRelativePath ?? "");
  if (!normalizedPath) {
    return undefined;
  }

  if (!scope.workspacePrefix) {
    return normalizedPath;
  }

  const prefix = `${scope.workspacePrefix}/`;
  if (!normalizedPath.startsWith(prefix)) {
    return undefined;
  }

  return normalizedPath.slice(prefix.length) || undefined;
}

function truncateReviewText(input: string, maxChars: number): string {
  if (!input || input.length <= maxChars) {
    return input;
  }

  return `${input.slice(0, maxChars)}${REVIEW_TRUNCATED_MARKER}`;
}

function resolveReviewTextLimit(mode: WorkspaceGitReviewDetailMode): number {
  return mode === "detail" ? MAX_REVIEW_DETAIL_TEXT_CHARS : MAX_REVIEW_TEXT_CHARS;
}

function resolveReviewPatchLimit(mode: WorkspaceGitReviewDetailMode): number {
  return mode === "detail" ? MAX_REVIEW_DETAIL_PATCH_CHARS : MAX_REVIEW_PATCH_CHARS;
}

function buildReviewItemKey(item: Pick<WorkspaceGitChangeItem, "path" | "previousPath">): string {
  return `${item.previousPath ?? ""}\u0000${item.path}`;
}

function resolveReviewDetailPriority(item: WorkspaceGitChangeItem): number {
  switch (item.status) {
    case "modified":
    case "conflict":
      return 0;
    case "renamed":
    case "deleted":
      return 1;
    case "added":
      return 2;
    case "untracked":
      return 3;
    default:
      return 4;
  }
}

function compareReviewDetailPriority(left: WorkspaceGitChangeItem, right: WorkspaceGitChangeItem): number {
  const priority = resolveReviewDetailPriority(left) - resolveReviewDetailPriority(right);
  if (priority !== 0) {
    return priority;
  }

  const changedLines = (right.additions + right.deletions) - (left.additions + left.deletions);
  if (changedLines !== 0) {
    return changedLines;
  }

  return left.path.localeCompare(right.path, "en", { sensitivity: "base" });
}

function createOmittedWorkspaceGitReviewItem(item: WorkspaceGitChangeItem): WorkspaceGitReviewItem {
  return {
    ...item,
    before: "",
    after: REVIEW_OMITTED_MESSAGE,
    patch: REVIEW_OMITTED_MESSAGE,
  };
}

function estimateWorkspaceGitReviewItemBytes(item: WorkspaceGitReviewItem): number {
  return Buffer.byteLength(JSON.stringify(item), "utf8");
}

function ensurePathInsideRoot(rootPath: string, targetPath: string, pathHint?: string) {
  const rel = relative(rootPath, targetPath);
  if (!rel) {
    return;
  }

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "path must stay inside workspace root", {
      path: pathHint ?? targetPath,
    });
  }
}

function normalizeRelativePath(pathInput?: string): string {
  if (typeof pathInput !== "string") {
    return "";
  }

  const trimmed = pathInput.trim();
  if (!trimmed || trimmed === "." || trimmed === "/") {
    return "";
  }

  const normalized = normalizeSlashes(trimmed);
  const parts: string[] = [];

  for (const rawPart of normalized.split("/")) {
    const part = rawPart.trim();
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "path must stay inside workspace root", {
        path: pathInput,
      });
    }
    parts.push(part);
  }

  return parts.join("/");
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
): Promise<GitCommandResult> {
  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolvePromise({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        timedOut: false,
      });
      return;
    }

    const settle = (result: GitCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore forced-kill failures.
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Uint8Array | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Uint8Array | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      settle({
        ok: false,
        exitCode: -1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        timedOut,
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const code = typeof exitCode === "number" ? exitCode : -1;
      settle({
        ok: !timedOut && code === 0,
        exitCode: code,
        stdout,
        stderr: `${stderr}\n${timedOut ? "command timed out" : ""}`.trim(),
        timedOut,
      });
    });
  });
}

function runProcessWithInput(
  command: string,
  args: string[],
  cwd: string,
  inputText: string,
  timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
): Promise<GitCommandResult> {
  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolvePromise({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        timedOut: false,
      });
      return;
    }

    const settle = (result: GitCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore forced-kill failures.
      }
    }, timeoutMs);

    child.stdin?.on("error", () => {
      // Ignore broken-pipe noise; close/exit will carry the actual failure.
    });
    child.stdin?.end(inputText, "utf8");
    child.stdout?.on("data", (chunk: Uint8Array | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Uint8Array | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      settle({
        ok: false,
        exitCode: -1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        timedOut,
      });
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const code = typeof exitCode === "number" ? exitCode : -1;
      settle({
        ok: !timedOut && code === 0,
        exitCode: code,
        stdout,
        stderr: `${stderr}\n${timedOut ? "command timed out" : ""}`.trim(),
        timedOut,
      });
    });
  });
}

async function runGitCommand(
  rootPath: string,
  args: string[],
  timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
): Promise<GitCommandResult> {
  return runProcess(await resolveGitCommandExecutable(), args, rootPath, timeoutMs);
}

async function runGitCommandWithInput(
  rootPath: string,
  args: string[],
  inputText: string,
  timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
): Promise<GitCommandResult> {
  return runProcessWithInput(
    await resolveGitCommandExecutable(),
    args,
    rootPath,
    inputText,
    timeoutMs,
  );
}

function normalizeGitPathToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  let value = trimmed;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      value = JSON.parse(trimmed) as string;
    } catch {
      value = trimmed.slice(1, -1);
    }
  }

  return normalizeSlashes(value);
}

function classifyGitChangeStatus(
  stagedCode: string,
  unstagedCode: string,
): WorkspaceGitChangeStatus {
  if (stagedCode === "?" && unstagedCode === "?") {
    return "untracked";
  }
  if (
    stagedCode === "U"
    || unstagedCode === "U"
    || (stagedCode === "A" && unstagedCode === "A")
    || (stagedCode === "D" && unstagedCode === "D")
  ) {
    return "conflict";
  }
  if (stagedCode === "D" || unstagedCode === "D") {
    return "deleted";
  }
  if (stagedCode === "R" || unstagedCode === "R" || stagedCode === "C" || unstagedCode === "C") {
    return "renamed";
  }
  if (stagedCode === "A" || unstagedCode === "A") {
    return "added";
  }
  return "modified";
}

function classifyGitSectionStatus(code: string): WorkspaceGitChangeStatus {
  if (code === "?") {
    return "untracked";
  }
  if (code === "U") {
    return "conflict";
  }
  if (code === "D") {
    return "deleted";
  }
  if (code === "R" || code === "C") {
    return "renamed";
  }
  if (code === "A") {
    return "added";
  }
  return "modified";
}

function createEmptyChangesSummary(): WorkspaceGitChangesSummary {
  return {
    files: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflict: 0,
    additions: 0,
    deletions: 0,
  };
}

function appendChangesSummary(
  summary: WorkspaceGitChangesSummary,
  status: WorkspaceGitChangeStatus,
  additions: number,
  deletions: number,
) {
  summary.files += 1;
  if (status === "added") {
    summary.added += 1;
  } else if (status === "modified") {
    summary.modified += 1;
  } else if (status === "deleted") {
    summary.deleted += 1;
  } else if (status === "renamed") {
    summary.renamed += 1;
  } else if (status === "untracked") {
    summary.untracked += 1;
  } else if (status === "conflict") {
    summary.conflict += 1;
  }

  summary.additions += Math.max(0, additions);
  summary.deletions += Math.max(0, deletions);
}

function parseBranchInfo(line: string): { branch?: string; ahead: number; behind: number } {
  const body = line.slice(3).trim();
  if (!body) {
    return { branch: undefined, ahead: 0, behind: 0 };
  }

  let branch = body;
  if (body.startsWith("No commits yet on ")) {
    branch = body.slice("No commits yet on ".length).trim();
  } else if (body.startsWith("Initial commit on ")) {
    branch = body.slice("Initial commit on ".length).trim();
  } else {
    branch = body.split("...")[0]?.trim() ?? body;
  }

  if (branch.startsWith("HEAD")) {
    branch = "HEAD";
  } else if (branch.includes(" ")) {
    branch = branch.split(" ")[0] ?? branch;
  }

  const aheadMatch = /\bahead (\d+)/.exec(body);
  const behindMatch = /\bbehind (\d+)/.exec(body);
  return {
    branch: branch || undefined,
    ahead: aheadMatch ? Math.max(0, Number(aheadMatch[1]) || 0) : 0,
    behind: behindMatch ? Math.max(0, Number(behindMatch[1]) || 0) : 0,
  };
}

function parseGitStatusPorcelain(output: string): {
  branch?: string;
  ahead: number;
  behind: number;
  entries: ParsedGitStatusEntry[];
} {
  const lines = output.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);

  let branch: string | undefined;
  let ahead = 0;
  let behind = 0;
  const entries: ParsedGitStatusEntry[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const info = parseBranchInfo(line);
      branch = info.branch;
      ahead = info.ahead;
      behind = info.behind;
      continue;
    }

    if (line.length < 4 || line[2] !== " ") {
      continue;
    }

    const stagedCode = line[0] ?? " ";
    const unstagedCode = line[1] ?? " ";
    if (stagedCode === "!" && unstagedCode === "!") {
      continue;
    }

    const rawPath = line.slice(3).trim();
    if (!rawPath) {
      continue;
    }

    let previousPath: string | undefined;
    let pathToken = rawPath;
    if ((stagedCode === "R" || unstagedCode === "R" || stagedCode === "C" || unstagedCode === "C")
      && rawPath.includes(" -> ")) {
      const arrowIndex = rawPath.lastIndexOf(" -> ");
      previousPath = normalizeGitPathToken(rawPath.slice(0, arrowIndex));
      pathToken = rawPath.slice(arrowIndex + 4);
    }

    const path = normalizeGitPathToken(pathToken);
    if (!path) {
      continue;
    }

    entries.push({
      path,
      previousPath: previousPath || undefined,
      status: classifyGitChangeStatus(stagedCode, unstagedCode),
      stagedStatus: stagedCode === " " ? undefined : stagedCode,
      unstagedStatus: unstagedCode === " " ? undefined : unstagedCode,
    });
  }

  return { branch, ahead, behind, entries };
}

function parseGitNumStat(output: string): Map<string, DiffStat> {
  const map = new Map<string, DiffStat>();
  for (const line of output.split(/\r?\n/).map((item) => item.trimEnd()).filter(Boolean)) {
    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const additionsRaw = parts[0] ?? "0";
    const deletionsRaw = parts[1] ?? "0";
    const pathRaw = parts[parts.length - 1] ?? "";
    const path = normalizeGitPathToken(pathRaw);
    if (!path) {
      continue;
    }

    const additions = additionsRaw === "-" ? 0 : Math.max(0, Number(additionsRaw) || 0);
    const deletions = deletionsRaw === "-" ? 0 : Math.max(0, Number(deletionsRaw) || 0);
    const previous = map.get(path) ?? { additions: 0, deletions: 0 };

    map.set(path, {
      additions: previous.additions + additions,
      deletions: previous.deletions + deletions,
    });
  }
  return map;
}

function mergeDiffStats(maps: Array<Map<string, DiffStat>>): Map<string, DiffStat> {
  const merged = new Map<string, DiffStat>();
  for (const map of maps) {
    for (const [path, stat] of map.entries()) {
      const current = merged.get(path) ?? { additions: 0, deletions: 0 };
      merged.set(path, {
        additions: current.additions + stat.additions,
        deletions: current.deletions + stat.deletions,
      });
    }
  }
  return merged;
}

function mapParsedGitStatusEntryToWorkspace(
  scope: WorkspaceGitScope,
  entry: ParsedGitStatusEntry,
): ParsedGitStatusEntry | null {
  const path = mapRepoGitPathToWorkspace(scope, entry.path);
  if (!path) {
    return null;
  }

  return {
    ...entry,
    path,
    previousPath: mapRepoGitPathToWorkspace(scope, entry.previousPath),
  };
}

function mapGitNumStatToWorkspace(
  scope: WorkspaceGitScope,
  stats: Map<string, DiffStat>,
): Map<string, DiffStat> {
  const mapped = new Map<string, DiffStat>();
  for (const [path, stat] of stats.entries()) {
    const workspacePath = mapRepoGitPathToWorkspace(scope, path);
    if (!workspacePath) {
      continue;
    }

    const current = mapped.get(workspacePath) ?? { additions: 0, deletions: 0 };
    mapped.set(workspacePath, {
      additions: current.additions + stat.additions,
      deletions: current.deletions + stat.deletions,
    });
  }
  return mapped;
}

function buildChangesSummary(items: WorkspaceGitChangeItem[]): WorkspaceGitChangesSummary {
  const summary = createEmptyChangesSummary();
  for (const item of items) {
    appendChangesSummary(summary, item.status, item.additions, item.deletions);
  }
  return summary;
}

function buildSectionChangesSummary(
  items: WorkspaceGitChangeItem[],
  kind: "staged" | "unstaged",
): WorkspaceGitChangesSummary {
  const summary = createEmptyChangesSummary();
  for (const item of items) {
    const statusCode = kind === "staged" ? item.stagedStatus?.trim() : item.unstagedStatus?.trim();
    if (!statusCode) {
      continue;
    }
    appendChangesSummary(
      summary,
      classifyGitSectionStatus(statusCode),
      kind === "staged" ? item.stagedAdditions ?? 0 : item.unstagedAdditions ?? 0,
      kind === "staged" ? item.stagedDeletions ?? 0 : item.unstagedDeletions ?? 0,
    );
  }
  return summary;
}

function describeGitCommandError(result: GitCommandResult): string {
  return result.stderr.trim() || result.stdout.trim() || "git command failed";
}

function isGitCommandUnavailable(result: GitCommandResult): boolean {
  const text = describeGitCommandError(result).toLowerCase();
  return text.includes("enoent") || text.includes("not recognized") || text.includes("not found");
}

function isGitRepositoryProbeMiss(result: GitCommandResult): boolean {
  const text = describeGitCommandError(result).toLowerCase();
  return text.includes("not a git repository")
    || text.includes("not in a git directory")
    || text.includes("outside repository");
}

function splitExecutableSearchPaths(input: string | undefined): string[] {
  return (input ?? "")
    .split(process.platform === "win32" ? ";" : ":")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

function buildGitExecutableCandidates(): string[] {
  const candidates: string[] = [];
  const pushCandidate = (value: string | undefined) => {
    const normalized = value?.trim();
    if (!normalized || candidates.includes(normalized)) {
      return;
    }
    candidates.push(normalized);
  };

  pushCandidate(process.env.MAOMI_GIT_EXECUTABLE);
  if (process.platform === "win32") {
    const commonRoots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LocalAppData]
      .filter(Boolean) as string[];
    for (const root of commonRoots) {
      pushCandidate(join(root, "Git", "bin", "git.exe"));
      pushCandidate(join(root, "Git", "mingw64", "bin", "git.exe"));
      pushCandidate(join(root, "Git", "cmd", "git.exe"));
      pushCandidate(join(root, "Programs", "Git", "bin", "git.exe"));
      pushCandidate(join(root, "Programs", "Git", "cmd", "git.exe"));
    }

    const pathEntries = splitExecutableSearchPaths(process.env.Path ?? process.env.PATH);
    const pathExts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
      .split(";")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const pathNames = new Set<string>(["git.exe", "git.cmd", "git.bat"]);
    for (const ext of pathExts) {
      pathNames.add(`git${ext.startsWith(".") ? ext : `.${ext}`}`);
    }
    for (const dir of pathEntries) {
      const normalizedDir = dir.replaceAll("/", "\\").toLowerCase();
      if (normalizedDir.endsWith("\\git\\cmd")) {
        pushCandidate(resolve(dir, "..", "bin", "git.exe"));
        pushCandidate(resolve(dir, "..", "mingw64", "bin", "git.exe"));
      }
      for (const name of pathNames) {
        pushCandidate(join(dir, name));
      }
    }
  }

  pushCandidate("git");
  return candidates;
}

async function resolveGitCommandExecutable(): Promise<string> {
  if (cachedGitCommandExecutable) {
    return cachedGitCommandExecutable;
  }
  if (gitCommandExecutableResolver) {
    return gitCommandExecutableResolver;
  }

  gitCommandExecutableResolver = (async () => {
    for (const candidate of buildGitExecutableCandidates()) {
      if (!isAbsolute(candidate)) {
        cachedGitCommandExecutable = candidate;
        return candidate;
      }
      if (await pathExists(candidate)) {
        cachedGitCommandExecutable = candidate;
        return candidate;
      }
    }
    cachedGitCommandExecutable = "git";
    return cachedGitCommandExecutable;
  })();

  try {
    return await gitCommandExecutableResolver;
  } finally {
    gitCommandExecutableResolver = null;
  }
}

async function probeWorkspaceGitRepository(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<{ isGitRepo: false } | { isGitRepo: true; scope: WorkspaceGitScope }> {
  const repoProbe = await runGitCommand(input.rootPath, ["rev-parse", "--is-inside-work-tree"]);
  if (!repoProbe.ok) {
    if (isGitCommandUnavailable(repoProbe)) {
      throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git command is unavailable", {
        workspaceId: input.workspaceId,
      });
    }
    if (isGitRepositoryProbeMiss(repoProbe)) {
      return { isGitRepo: false };
    }
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "failed to probe git repository", {
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      stderr: describeGitCommandError(repoProbe),
    });
  }

  if (repoProbe.stdout.trim().toLowerCase() !== "true") {
    return { isGitRepo: false };
  }

  const [topLevelResult, prefixResult] = await Promise.all([
    runGitCommand(input.rootPath, ["rev-parse", "--show-toplevel"]),
    runGitCommand(input.rootPath, ["rev-parse", "--show-prefix"]),
  ]);
  if (!topLevelResult.ok || !prefixResult.ok) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "failed to resolve git workspace scope", {
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      stderr: describeGitCommandError(topLevelResult.ok ? prefixResult : topLevelResult),
    });
  }

  return {
    isGitRepo: true,
    scope: {
      workspaceRootPath: input.rootPath,
      gitRootPath: resolve(topLevelResult.stdout.trim() || input.rootPath),
      workspacePrefix: normalizeGitWorkspacePrefix(prefixResult.stdout),
    },
  };
}

async function readWorkspaceGitUpstream(rootPath: string): Promise<string | undefined> {
  const result = await runGitCommand(rootPath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const value = result.ok ? result.stdout.trim() : "";
  return value || undefined;
}

async function readGitConfigValue(
  rootPath: string,
  scopeArgs: string[],
  key: string,
): Promise<string | undefined> {
  const result = await runGitCommand(rootPath, ["config", ...scopeArgs, "--get", key]);
  if (!result.ok) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value || undefined;
}

async function unsetGitConfigValue(
  rootPath: string,
  scopeArgs: string[],
  key: string,
): Promise<void> {
  await runGitCommand(rootPath, ["config", ...scopeArgs, "--unset-all", key]);
}

async function writeGitConfigValue(input: {
  workspaceId: string;
  rootPath: string;
  scopeArgs: string[];
  key: string;
  value?: string;
  action: string;
}) {
  const normalized = input.value?.trim();
  if (!normalized) {
    await unsetGitConfigValue(input.rootPath, input.scopeArgs, input.key);
    return;
  }

  const result = await runGitCommand(
    input.rootPath,
    ["config", ...input.scopeArgs, input.key, normalized],
    20_000,
  );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: input.action,
    rootPath: input.rootPath,
    result,
  });
}

function parseGitRemoteConfigLine(line: string): WorkspaceGitRemoteSetting | null {
  const normalized = line.trim();
  if (!normalized) {
    return null;
  }

  const matched = normalized.match(/^remote\.([^\s]+)\.url\s+(.+)$/);
  if (!matched) {
    return null;
  }

  const name = matched[1]?.trim() ?? "";
  const url = matched[2]?.trim() ?? "";
  if (!name || !url) {
    return null;
  }

  return { name, url };
}

async function readGitRemoteSettings(rootPath: string): Promise<WorkspaceGitRemoteSetting[]> {
  const result = await runGitCommand(rootPath, ["config", "--get-regexp", "^remote\\..*\\.url$"]);
  if (!result.ok) {
    if (result.exitCode === 1 && !result.timedOut) {
      return [];
    }
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "failed to read git remotes", {
      rootPath,
      stderr: describeGitCommandError(result),
    });
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => parseGitRemoteConfigLine(line))
    .filter((item): item is WorkspaceGitRemoteSetting => Boolean(item))
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));
}

function normalizeGitRemoteSettings(input: WorkspaceGitRemoteSetting[]): WorkspaceGitRemoteSetting[] {
  const seen = new Set<string>();
  const normalized: WorkspaceGitRemoteSetting[] = [];
  for (const item of input) {
    const name = item.name.trim();
    const url = item.url.trim();
    if (!name || !url) {
      throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git remote name and url are required", {
        field: "remotes",
      });
    }
    if (/\s/.test(name)) {
      throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git remote name cannot contain spaces", {
        field: "remotes",
        remoteName: name,
      });
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git remote names must be unique", {
        field: "remotes",
        remoteName: name,
      });
    }
    seen.add(key);
    normalized.push({ name, url });
  }

  return normalized;
}

async function replaceGitRemoteSettings(input: {
  workspaceId: string;
  rootPath: string;
  remotes: WorkspaceGitRemoteSetting[];
}) {
  const listResult = await runGitCommand(input.rootPath, ["remote"]);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to list git remotes",
    rootPath: input.rootPath,
    result: listResult,
  });

  const currentNames = listResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const remoteName of currentNames) {
    const removeResult = await runGitCommand(input.rootPath, ["remote", "remove", remoteName], 20_000);
    await ensureGitCommandSucceeded({
      workspaceId: input.workspaceId,
      action: `failed to remove git remote ${remoteName}`,
      rootPath: input.rootPath,
      result: removeResult,
    });
  }

  for (const remote of input.remotes) {
    const addResult = await runGitCommand(input.rootPath, ["remote", "add", remote.name, remote.url], 20_000);
    await ensureGitCommandSucceeded({
      workspaceId: input.workspaceId,
      action: `failed to add git remote ${remote.name}`,
      rootPath: input.rootPath,
      result: addResult,
    });
  }
}

async function readWorkspaceLastCommit(rootPath: string): Promise<{ hash?: string; subject?: string }> {
  const result = await runGitCommand(rootPath, ["log", "-1", "--pretty=%H%x09%s"]);
  if (!result.ok) {
    return {};
  }
  const [hash = "", ...subjectParts] = result.stdout.trim().split("\t");
  return {
    hash: hash || undefined,
    subject: subjectParts.join("\t").trim() || undefined,
  };
}

async function readWorkspaceTextFile(rootPath: string, relativePath: string): Promise<string> {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return "";
  }
  const targetPath = resolve(rootPath, normalizedPath);
  ensurePathInsideRoot(rootPath, targetPath, relativePath);
  try {
    const buffer = await fs.readFile(targetPath);
    if (buffer.includes(0)) {
      return "";
    }
    return buffer.toString("utf8").replace(/\r\n/g, "\n");
  } catch {
    return "";
  }
}

async function readGitBlobText(scope: WorkspaceGitScope, relativePath: string): Promise<string> {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return "";
  }
  const repoRelativePath = toWorkspaceGitRepoPath(scope, normalizedPath);
  if (!repoRelativePath) {
    return "";
  }
  for (const ref of [`HEAD:${repoRelativePath}`, `:${repoRelativePath}`]) {
    const result = await runGitCommand(scope.gitRootPath, ["show", "--textconv", ref]);
    if (result.ok) {
      return result.stdout.replace(/\r\n/g, "\n");
    }
  }
  return "";
}

async function readGitIndexText(scope: WorkspaceGitScope, relativePath: string): Promise<string> {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return "";
  }
  const repoRelativePath = toWorkspaceGitRepoPath(scope, normalizedPath);
  if (!repoRelativePath) {
    return "";
  }
  const result = await runGitCommand(scope.gitRootPath, ["show", "--textconv", `:${repoRelativePath}`]);
  if (!result.ok) {
    return "";
  }
  return result.stdout.replace(/\r\n/g, "\n");
}

async function readGitBlobTextAtReference(
  scope: WorkspaceGitScope,
  ref: string,
  relativePath: string,
): Promise<string> {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return "";
  }
  const repoRelativePath = toWorkspaceGitRepoPath(scope, normalizedPath);
  if (!repoRelativePath) {
    return "";
  }
  const result = await runGitCommand(scope.gitRootPath, ["show", "--textconv", `${ref}:${repoRelativePath}`]);
  if (!result.ok) {
    return "";
  }
  return result.stdout.replace(/\r\n/g, "\n");
}

async function buildUnifiedPatch(before: string, after: string): Promise<string> {
  if (before === after) {
    return "";
  }
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "maomi-review-"));
  try {
    const beforePath = join(tempRoot, "before.txt");
    const afterPath = join(tempRoot, "after.txt");
    await fs.writeFile(beforePath, before, "utf8");
    await fs.writeFile(afterPath, after, "utf8");
    const result = await runProcess(
      "git",
      ["diff", "--no-index", "--no-ext-diff", "--text", "--unified=3", "--", beforePath, afterPath],
      tempRoot,
    );
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      return "";
    }
    return result.stdout
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) =>
        !line.startsWith("diff --git ")
        && !line.startsWith("index ")
        && !line.startsWith("--- ")
        && !line.startsWith("+++ "))
      .join("\n")
      .trimEnd();
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function buildWorkspaceGitReviewItem(
  scope: WorkspaceGitScope,
  item: WorkspaceGitChangeItem,
  mode: WorkspaceGitReviewDetailMode = "batch",
): Promise<WorkspaceGitReviewItem> {
  const textLimit = resolveReviewTextLimit(mode);
  const patchLimit = resolveReviewPatchLimit(mode);
  const beforePath = item.previousPath || item.path;
  const before = truncateReviewText(
    item.status === "added" || item.status === "untracked" ? "" : await readGitBlobText(scope, beforePath),
    textLimit,
  );
  const after = truncateReviewText(
    item.status === "deleted" ? "" : await readWorkspaceTextFile(scope.workspaceRootPath, item.path),
    textLimit,
  );
  const patch = truncateReviewText(await buildUnifiedPatch(before, after), patchLimit);
  return { ...item, before, after, patch };
}

async function buildWorkspaceGitStagedReviewItem(
  scope: WorkspaceGitScope,
  item: WorkspaceGitChangeItem,
  mode: WorkspaceGitReviewDetailMode = "batch",
): Promise<WorkspaceGitReviewItem> {
  const textLimit = resolveReviewTextLimit(mode);
  const patchLimit = resolveReviewPatchLimit(mode);
  const beforePath = item.previousPath || item.path;
  const before = truncateReviewText(
    item.status === "added" || item.status === "untracked"
      ? ""
      : await readGitBlobTextAtReference(scope, "HEAD", beforePath),
    textLimit,
  );
  const after = truncateReviewText(
    item.status === "deleted" ? "" : await readGitIndexText(scope, item.path),
    textLimit,
  );
  const patch = truncateReviewText(await buildUnifiedPatch(before, after), patchLimit);
  return { ...item, before, after, patch };
}

async function buildWorkspaceGitCompareReviewItem(input: {
  scope: WorkspaceGitScope;
  item: WorkspaceGitChangeItem;
  baseRef: string;
  headRef: string;
  mode?: WorkspaceGitReviewDetailMode;
}): Promise<WorkspaceGitReviewItem> {
  const textLimit = resolveReviewTextLimit(input.mode ?? "batch");
  const patchLimit = resolveReviewPatchLimit(input.mode ?? "batch");
  const beforePath = input.item.previousPath || input.item.path;
  const before = truncateReviewText(
    input.item.status === "added" || input.item.status === "untracked"
      ? ""
      : await readGitBlobTextAtReference(input.scope, input.baseRef, beforePath),
    textLimit,
  );
  const after = truncateReviewText(
    input.item.status === "deleted"
      ? ""
      : await readGitBlobTextAtReference(input.scope, input.headRef, input.item.path),
    textLimit,
  );
  const patch = truncateReviewText(await buildUnifiedPatch(before, after), patchLimit);
  return { ...input.item, before, after, patch };
}

function normalizeGitReferenceInput(refInput: string, field: "baseRef" | "headRef"): string {
  const normalized = refInput.trim();
  if (!normalized || /[\r\n]/.test(normalized) || normalized.startsWith("-")) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", `${field} is required`, { field });
  }
  return normalized;
}

async function assertGitReferenceExists(input: {
  workspaceId: string;
  rootPath: string;
  ref: string;
  field: "baseRef" | "headRef";
}) {
  const result = await runGitCommand(input.rootPath, ["rev-parse", "--verify", `${input.ref}^{object}`]);
  if (result.ok) {
    return;
  }
  throw new RuntimeWorkspaceError("INVALID_ARGUMENT", `invalid ${input.field}`, {
    workspaceId: input.workspaceId,
    field: input.field,
    ref: input.ref,
    stderr: describeGitCommandError(result),
  });
}

function parseGitDiffNameStatusLine(line: string): ParsedGitStatusEntry | null {
  const parts = line.split("\t").map((item) => item.trim());
  if (parts.length < 2) {
    return null;
  }
  const [rawStatus = "", firstPath = "", secondPath = ""] = parts;
  const statusCode = rawStatus.toUpperCase();
  const lead = statusCode[0] ?? "";
  if (!statusCode || !firstPath) {
    return null;
  }
  if ((lead === "R" || lead === "C") && secondPath) {
    return {
      path: normalizeGitPathToken(secondPath),
      previousPath: normalizeGitPathToken(firstPath),
      status: resolveGitStatusCode(statusCode),
      stagedStatus: undefined,
      unstagedStatus: undefined,
    };
  }
  return {
    path: normalizeGitPathToken(firstPath),
    previousPath: undefined,
    status: resolveGitStatusCode(statusCode),
    stagedStatus: undefined,
    unstagedStatus: undefined,
  };
}

function createEmptyChangesResponse(workspaceId: string, rootPath: string): WorkspaceGitChangesResult {
  return {
    workspaceId,
    rootPath,
    isGitRepo: false,
    clean: true,
    branch: undefined,
    upstream: undefined,
    detached: false,
    ahead: 0,
    behind: 0,
    lastCommitHash: undefined,
    lastCommitSubject: undefined,
    stagedSummary: createEmptyChangesSummary(),
    unstagedSummary: createEmptyChangesSummary(),
    items: [],
    summary: createEmptyChangesSummary(),
  };
}

export async function listRuntimeWorkspaceGitChanges(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitChangesResult> {
  return (await listRuntimeWorkspaceGitChangesInternal(input)).changes;
}

async function listRuntimeWorkspaceGitChangesInternal(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<{ changes: WorkspaceGitChangesResult; scope?: WorkspaceGitScope }> {
  const repoProbe = await probeWorkspaceGitRepository(input);
  if (!repoProbe.isGitRepo) {
    return { changes: createEmptyChangesResponse(input.workspaceId, input.rootPath) };
  }
  const scope = repoProbe.scope;
  const scopePathspecs = buildWorkspaceGitPathspecs(scope);
  const statusResult = await runGitCommand(scope.gitRootPath, appendGitPathspec([
    "-c",
    "core.quotepath=false",
    "status",
    "--porcelain=v1",
    "--branch",
    "--untracked-files=all",
  ], scopePathspecs));
  if (!statusResult.ok) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "failed to read git status", {
      workspaceId: input.workspaceId,
      stderr: statusResult.stderr.trim() || undefined,
    });
  }

  const [unstagedDiffResult, stagedDiffResult] = await Promise.all([
    runGitCommand(scope.gitRootPath, appendGitPathspec(["-c", "core.quotepath=false", "diff", "--numstat"], scopePathspecs)),
    runGitCommand(scope.gitRootPath, appendGitPathspec(["-c", "core.quotepath=false", "diff", "--numstat", "--cached"], scopePathspecs)),
  ]);

  const parsedStatusResult = parseGitStatusPorcelain(statusResult.stdout);
  const parsedStatus = {
    ...parsedStatusResult,
    entries: parsedStatusResult.entries
      .map((entry) => mapParsedGitStatusEntryToWorkspace(scope, entry))
      .filter((entry): entry is ParsedGitStatusEntry => Boolean(entry)),
  };
  const unstagedDiffStats = unstagedDiffResult.ok
    ? mapGitNumStatToWorkspace(scope, parseGitNumStat(unstagedDiffResult.stdout))
    : new Map<string, DiffStat>();
  const stagedDiffStats = stagedDiffResult.ok
    ? mapGitNumStatToWorkspace(scope, parseGitNumStat(stagedDiffResult.stdout))
    : new Map<string, DiffStat>();
  const mergedDiffStats = mergeDiffStats([unstagedDiffStats, stagedDiffStats]);
  const [upstream, lastCommit] = await Promise.all([
    parsedStatus.branch && parsedStatus.branch !== "HEAD"
      ? readWorkspaceGitUpstream(scope.gitRootPath)
      : Promise.resolve(undefined),
    readWorkspaceLastCommit(scope.gitRootPath),
  ]);

  const items = parsedStatus.entries
    .map<WorkspaceGitChangeItem>((entry) => {
      const diff = mergedDiffStats.get(entry.path) ?? { additions: 0, deletions: 0 };
      const stagedDiff = stagedDiffStats.get(entry.path) ?? { additions: 0, deletions: 0 };
      const unstagedDiff = unstagedDiffStats.get(entry.path) ?? { additions: 0, deletions: 0 };
      return {
        path: entry.path,
        previousPath: entry.previousPath,
        status: entry.status,
        stagedStatus: entry.stagedStatus,
        unstagedStatus: entry.unstagedStatus,
        additions: diff.additions,
        deletions: diff.deletions,
        stagedAdditions: stagedDiff.additions,
        stagedDeletions: stagedDiff.deletions,
        unstagedAdditions: unstagedDiff.additions,
        unstagedDeletions: unstagedDiff.deletions,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));

  return {
    changes: {
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      isGitRepo: true,
      clean: items.length === 0,
      branch: parsedStatus.branch,
      upstream,
      detached: parsedStatus.branch === "HEAD",
      ahead: parsedStatus.ahead,
      behind: parsedStatus.behind,
      lastCommitHash: lastCommit.hash,
      lastCommitSubject: lastCommit.subject,
      stagedSummary: buildSectionChangesSummary(items, "staged"),
      unstagedSummary: buildSectionChangesSummary(items, "unstaged"),
      items,
      summary: buildChangesSummary(items),
    },
    scope,
  };
}

export async function listRuntimeWorkspaceGitReview(input: {
  workspaceId: string;
  rootPath: string;
  scope?: WorkspaceGitReviewScope;
}): Promise<WorkspaceGitReviewResult> {
  const { changes, scope } = await listRuntimeWorkspaceGitChangesInternal(input);
  const requestedScope = normalizeWorkspaceGitReviewScope(input.scope);
  const scopedChanges = buildScopedWorkspaceGitResult(changes, requestedScope);
  if (!scopedChanges.isGitRepo || scopedChanges.items.length === 0) {
    return { ...scopedChanges, items: [] };
  }

  const detailedItemKeys = new Set(
    [...scopedChanges.items]
      .sort(compareReviewDetailPriority)
      .slice(0, MAX_REVIEW_DETAILED_ITEMS)
      .map((item) => buildReviewItemKey(item)),
  );

  const items: WorkspaceGitReviewItem[] = [];
  let totalBytes = 0;
  for (const item of scopedChanges.items) {
    const shouldBuildDetail = detailedItemKeys.has(buildReviewItemKey(item));
    const reviewItem = shouldBuildDetail
      ? await (requestedScope === "staged"
        ? buildWorkspaceGitStagedReviewItem(scope!, item)
        : buildWorkspaceGitReviewItem(scope!, item))
      : createOmittedWorkspaceGitReviewItem(item);
    const nextBytes = estimateWorkspaceGitReviewItemBytes(reviewItem);
    if (shouldBuildDetail && totalBytes + nextBytes > MAX_REVIEW_TOTAL_BYTES) {
      const omittedItem = createOmittedWorkspaceGitReviewItem(item);
      items.push(omittedItem);
      totalBytes += estimateWorkspaceGitReviewItemBytes(omittedItem);
      continue;
    }
    items.push(reviewItem);
    totalBytes += nextBytes;
  }

  return { ...scopedChanges, items };
}

export async function getRuntimeWorkspaceGitReviewDetail(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  scope?: WorkspaceGitReviewScope;
  baseRef?: string;
  headRef?: string;
}): Promise<WorkspaceGitReviewDetailResult> {
  const normalizedPath = normalizeRelativePath(input.path);
  if (!normalizedPath) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "path is required", {
      workspaceId: input.workspaceId,
      field: "path",
    });
  }

  const hasExplicitCompare = Boolean(input.baseRef?.trim() || input.headRef?.trim());
  if (hasExplicitCompare) {
    const { changes, scope } = await listRuntimeWorkspaceGitChangesInternal({
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
    });
    const baseRef = normalizeGitReferenceInput(input.baseRef?.trim() || "", "baseRef");
    const headRef = normalizeGitReferenceInput(input.headRef?.trim() || "", "headRef");
    if (!changes.isGitRepo || !scope) {
      return {
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        isGitRepo: false,
        path: normalizedPath,
        scope: normalizeWorkspaceGitReviewScope(input.scope),
        baseRef,
        headRef,
        item: null,
      };
    }
    const compareReview = await compareRuntimeWorkspaceGitRefs({
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      baseRef,
      headRef,
    });
    const targetItem = compareReview.items.find((item) => item.path === normalizedPath || item.previousPath === normalizedPath);
    return {
      workspaceId: compareReview.workspaceId,
      rootPath: compareReview.rootPath,
      isGitRepo: compareReview.isGitRepo,
      path: normalizedPath,
      scope: normalizeWorkspaceGitReviewScope(input.scope),
      baseRef,
      headRef,
      item: targetItem
        ? await buildWorkspaceGitCompareReviewItem({ scope, item: targetItem, baseRef, headRef, mode: "detail" })
        : null,
    };
  }

  const { changes, scope } = await listRuntimeWorkspaceGitChangesInternal({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const requestedScope = normalizeWorkspaceGitReviewScope(input.scope);
  const scopedChanges = buildScopedWorkspaceGitResult(changes, requestedScope);
  if (!changes.isGitRepo || !scope) {
    return {
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      isGitRepo: false,
      path: normalizedPath,
      scope: requestedScope,
      item: null,
    };
  }
  const targetItem = scopedChanges.items.find((item) => item.path === normalizedPath || item.previousPath === normalizedPath);
  return {
    workspaceId: scopedChanges.workspaceId,
    rootPath: scopedChanges.rootPath,
    isGitRepo: true,
    path: normalizedPath,
    scope: requestedScope,
    item: targetItem
      ? await (requestedScope === "staged"
        ? buildWorkspaceGitStagedReviewItem(scope, targetItem, "detail")
        : buildWorkspaceGitReviewItem(scope, targetItem, "detail"))
      : null,
  };
}

export async function compareRuntimeWorkspaceGitRefs(input: {
  workspaceId: string;
  rootPath: string;
  baseRef: string;
  headRef: string;
}): Promise<WorkspaceGitCompareResult> {
  const { changes, scope } = await listRuntimeWorkspaceGitChangesInternal({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const baseRef = normalizeGitReferenceInput(input.baseRef, "baseRef");
  const headRef = normalizeGitReferenceInput(input.headRef, "headRef");
  if (!changes.isGitRepo) {
    return {
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      isGitRepo: false,
      clean: true,
      baseRef,
      headRef,
      comparisonLabel: `${baseRef}..${headRef}`,
      summary: createEmptyChangesSummary(),
      items: [],
    };
  }

  await Promise.all([
    assertGitReferenceExists({ workspaceId: input.workspaceId, rootPath: scope!.gitRootPath, ref: baseRef, field: "baseRef" }),
    assertGitReferenceExists({ workspaceId: input.workspaceId, rootPath: scope!.gitRootPath, ref: headRef, field: "headRef" }),
  ]);

  const scopePathspecs = buildWorkspaceGitPathspecs(scope!);
  const [statusResult, numstatResult] = await Promise.all([
    runGitCommand(scope!.gitRootPath, appendGitPathspec([
      "-c", "core.quotepath=false", "diff", "--name-status", "--find-renames", baseRef, headRef,
    ], scopePathspecs), 30_000),
    runGitCommand(scope!.gitRootPath, appendGitPathspec([
      "-c", "core.quotepath=false", "diff", "--numstat", "--find-renames", baseRef, headRef,
    ], scopePathspecs), 30_000),
  ]);

  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to compare git references", rootPath: scope!.gitRootPath, result: statusResult });
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git comparison stats", rootPath: scope!.gitRootPath, result: numstatResult });

  const diffStats = mapGitNumStatToWorkspace(scope!, parseGitNumStat(numstatResult.stdout));
  const changeItems = statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => parseGitDiffNameStatusLine(line))
    .map((entry) => (entry ? mapParsedGitStatusEntryToWorkspace(scope!, entry) : null))
    .filter((entry): entry is ParsedGitStatusEntry => Boolean(entry))
    .map<WorkspaceGitChangeItem>((entry) => {
      const diff = diffStats.get(entry.path) ?? { additions: 0, deletions: 0 };
      return {
        path: entry.path,
        previousPath: entry.previousPath,
        status: entry.status,
        stagedStatus: undefined,
        unstagedStatus: undefined,
        additions: diff.additions,
        deletions: diff.deletions,
        stagedAdditions: undefined,
        stagedDeletions: undefined,
        unstagedAdditions: undefined,
        unstagedDeletions: undefined,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));

  const detailedItemKeys = new Set(
    [...changeItems]
      .sort(compareReviewDetailPriority)
      .slice(0, MAX_REVIEW_DETAILED_ITEMS)
      .map((item) => buildReviewItemKey(item)),
  );

  const items: WorkspaceGitReviewItem[] = [];
  let totalBytes = 0;
  for (const item of changeItems) {
    const shouldBuildDetail = detailedItemKeys.has(buildReviewItemKey(item));
    const reviewItem = shouldBuildDetail
      ? await buildWorkspaceGitCompareReviewItem({ scope: scope!, item, baseRef, headRef })
      : createOmittedWorkspaceGitReviewItem(item);
    const nextBytes = estimateWorkspaceGitReviewItemBytes(reviewItem);
    if (shouldBuildDetail && totalBytes + nextBytes > MAX_REVIEW_TOTAL_BYTES) {
      const omittedItem = createOmittedWorkspaceGitReviewItem(item);
      items.push(omittedItem);
      totalBytes += estimateWorkspaceGitReviewItemBytes(omittedItem);
      continue;
    }
    items.push(reviewItem);
    totalBytes += nextBytes;
  }

  return {
    workspaceId: changes.workspaceId,
    rootPath: changes.rootPath,
    isGitRepo: true,
    clean: changeItems.length === 0,
    baseRef,
    headRef,
    comparisonLabel: `${baseRef}..${headRef}`,
    summary: buildChangesSummary(changeItems),
    items,
  };
}

async function hasRuntimeWorkspaceGitHead(rootPath: string): Promise<boolean> {
  const result = await runGitCommand(rootPath, ["rev-parse", "--verify", "HEAD"]);
  return result.ok && result.stdout.trim().length > 0;
}

async function ensureGitCommandSucceeded(input: {
  workspaceId: string;
  action: string;
  rootPath: string;
  result: GitCommandResult;
}) {
  if (input.result.ok) {
    return;
  }
  throw new RuntimeWorkspaceError("INVALID_ARGUMENT", input.action, {
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    stderr: describeGitCommandError(input.result),
  });
}

async function readBranchAheadBehind(input: {
  rootPath: string;
  localBranch: string;
  upstream?: string;
}): Promise<{ ahead: number; behind: number }> {
  if (!input.upstream) {
    return { ahead: 0, behind: 0 };
  }
  const result = await runGitCommand(input.rootPath, ["rev-list", "--left-right", "--count", `${input.localBranch}...${input.upstream}`]);
  if (!result.ok) {
    return { ahead: 0, behind: 0 };
  }
  const [aheadRaw = "0", behindRaw = "0"] = result.stdout.trim().split(/\s+/);
  const ahead = Number.isFinite(Number(aheadRaw)) ? Math.max(0, Number(aheadRaw)) : 0;
  const behind = Number.isFinite(Number(behindRaw)) ? Math.max(0, Number(behindRaw)) : 0;
  return { ahead, behind };
}

function parseGitReferenceLine(
  line: string,
  kind: "local" | "remote",
): { name: string; upstream?: string; hash?: string; subject?: string } | null {
  const parts = line.split("\t").map((item) => item.trim());
  if (parts.length === 0 || !parts[0]) {
    return null;
  }
  if (kind === "local") {
    const [name, upstream = "", hash = "", ...subjectParts] = parts;
    return {
      name,
      upstream: upstream || undefined,
      hash: hash || undefined,
      subject: subjectParts.join("\t").trim() || undefined,
    };
  }
  const [name, hash = "", ...subjectParts] = parts;
  return {
    name,
    hash: hash || undefined,
    subject: subjectParts.join("\t").trim() || undefined,
  };
}

function parseGitStashLine(line: string): WorkspaceGitStashItem | null {
  const parts = line.split("\t").map((item) => item.trim());
  const [ref = "", createdRelative = "", ...messageParts] = parts;
  if (!ref) {
    return null;
  }
  const indexMatched = /^stash@\{(\d+)\}$/i.exec(ref);
  const index = indexMatched ? Number(indexMatched[1]) : Number.NaN;
  return {
    ref,
    index: Number.isFinite(index) ? index : -1,
    message: messageParts.join("\t").trim() || ref,
    createdRelative: createdRelative || undefined,
  };
}

function parseGitWorktreeReason(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.replace(/^\((.*)\)$/u, "$1").trim() || undefined;
}

function parseGitWorktreeListPorcelain(output: string): Array<Omit<WorkspaceGitWorktreeItem, "current">> {
  const items: Array<Omit<WorkspaceGitWorktreeItem, "current">> = [];
  const lines = output.split(/\r?\n/);
  let current: Omit<WorkspaceGitWorktreeItem, "current"> | null = null;

  const pushCurrent = () => {
    if (!current?.path) {
      return;
    }
    items.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      pushCurrent();
      continue;
    }

    if (line.startsWith("worktree ")) {
      pushCurrent();
      current = {
        path: line.slice("worktree ".length).trim(),
        branch: undefined,
        head: undefined,
        bare: false,
        detached: false,
        locked: false,
        lockedReason: undefined,
        prunable: false,
        prunableReason: undefined,
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim() || undefined;
      continue;
    }

    if (line.startsWith("branch ")) {
      const rawBranch = line.slice("branch ".length).trim();
      current.branch = rawBranch.startsWith("refs/heads/")
        ? rawBranch.slice("refs/heads/".length)
        : rawBranch || undefined;
      continue;
    }

    if (line.startsWith("locked")) {
      current.locked = true;
      current.lockedReason = parseGitWorktreeReason(line.slice("locked".length));
      continue;
    }

    if (line.startsWith("prunable")) {
      current.prunable = true;
      current.prunableReason = parseGitWorktreeReason(line.slice("prunable".length));
      continue;
    }

    if (line === "bare") {
      current.bare = true;
      continue;
    }

    if (line === "detached") {
      current.detached = true;
    }
  }

  pushCurrent();
  return items;
}

function parseGitShortstatLine(line: string): { filesChanged: number; additions: number; deletions: number } {
  const filesMatch = /(\d+)\s+files?\s+changed/i.exec(line);
  const additionsMatch = /(\d+)\s+insertions?\(\+\)/i.exec(line);
  const deletionsMatch = /(\d+)\s+deletions?\(-\)/i.exec(line);
  return {
    filesChanged: filesMatch ? Number(filesMatch[1]) || 0 : 0,
    additions: additionsMatch ? Number(additionsMatch[1]) || 0 : 0,
    deletions: deletionsMatch ? Number(deletionsMatch[1]) || 0 : 0,
  };
}

function parseGitHistoryRecord(record: string): WorkspaceGitHistoryItem | null {
  const normalizedRecord = record.replace(/^\r?\n+/, "").trimEnd();
  if (!normalizedRecord) {
    return null;
  }
  const [headerLine = "", ...detailLines] = normalizedRecord.split(/\r?\n/);
  if (!headerLine.trim()) {
    return null;
  }
  const [hash = "", shortHash = "", subject = "", authorName = "", authorEmail = "", authoredAt = "", authoredRelative = "", rawParents = "", rawRefs = ""] = headerLine.split("\x1f");
  if (!hash.trim()) {
    return null;
  }
  const shortstatLine = detailLines.find((line) => /\bchanged\b|\binsertions?\(\+\)|\bdeletions?\(-\)/i.test(line)) ?? "";
  const stats = parseGitShortstatLine(shortstatLine);
  const parentHashes = rawParents.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const refsText = rawRefs.trim().replace(/^\((.*)\)$/, "$1").trim();
  return {
    hash: hash.trim(),
    shortHash: shortHash.trim() || hash.trim().slice(0, 7),
    subject: subject.trim() || shortHash.trim() || hash.trim().slice(0, 7),
    authorName: authorName.trim() || undefined,
    authorEmail: authorEmail.trim() || undefined,
    authoredAt: authoredAt.trim() || undefined,
    authoredRelative: authoredRelative.trim() || undefined,
    parentHashes,
    refs: refsText ? refsText.split(",").map((item) => item.trim()).filter(Boolean) : [],
    filesChanged: stats.filesChanged,
    additions: stats.additions,
    deletions: stats.deletions,
  };
}

export async function listRuntimeWorkspaceGitBranches(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitBranchesResult> {
  const changes = await listRuntimeWorkspaceGitChanges(input);
  if (!changes.isGitRepo) {
    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath,
      isGitRepo: false,
      currentBranch: undefined,
      detached: false,
      items: [],
    };
  }
  const [localRefsResult, remoteRefsResult] = await Promise.all([
    runGitCommand(changes.rootPath, ["for-each-ref", "--format=%(refname:short)\t%(upstream:short)\t%(objectname:short)\t%(subject)", "refs/heads"]),
    runGitCommand(changes.rootPath, ["for-each-ref", "--format=%(refname:short)\t%(objectname:short)\t%(subject)", "refs/remotes"]),
  ]);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to list git branches", rootPath: changes.rootPath, result: localRefsResult });
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to list remote git branches", rootPath: changes.rootPath, result: remoteRefsResult });

  const localBranches: WorkspaceGitBranchItem[] = [];
  for (const line of localRefsResult.stdout.split(/\r?\n/).filter(Boolean)) {
    const ref = parseGitReferenceLine(line, "local");
    if (!ref?.name) {
      continue;
    }
    const sync = await readBranchAheadBehind({ rootPath: changes.rootPath, localBranch: ref.name, upstream: ref.upstream });
    localBranches.push({
      name: ref.name,
      fullName: `refs/heads/${ref.name}`,
      kind: "local",
      current: !changes.detached && ref.name === changes.branch,
      upstream: ref.upstream,
      ahead: sync.ahead,
      behind: sync.behind,
      detached: false,
      lastCommitHash: ref.hash,
      lastCommitSubject: ref.subject,
    });
  }

  const remoteBranches = remoteRefsResult.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => parseGitReferenceLine(line, "remote"))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => !/\/HEAD$/i.test(item.name))
    .map<WorkspaceGitBranchItem>((item) => ({
      name: item.name,
      fullName: `refs/remotes/${item.name}`,
      kind: "remote",
      current: false,
      upstream: undefined,
      ahead: 0,
      behind: 0,
      detached: false,
      lastCommitHash: item.hash,
      lastCommitSubject: item.subject,
    }));

  const items = [...localBranches, ...remoteBranches].sort((left, right) => {
    if (left.current !== right.current) {
      return left.current ? -1 : 1;
    }
    if (left.kind !== right.kind) {
      return left.kind === "local" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });
  return {
    workspaceId: changes.workspaceId,
    rootPath: changes.rootPath,
    isGitRepo: true,
    currentBranch: changes.branch,
    detached: changes.detached,
    items,
  };
}

export async function listRuntimeWorkspaceGitStashes(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitStashesResult> {
  const changes = await listRuntimeWorkspaceGitChanges(input);
  if (!changes.isGitRepo) {
    return { workspaceId: changes.workspaceId, rootPath: changes.rootPath, isGitRepo: false, items: [] };
  }
  const result = await runGitCommand(changes.rootPath, ["stash", "list", "--format=%gd\t%cr\t%gs"]);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to list git stashes", rootPath: changes.rootPath, result });
  return {
    workspaceId: changes.workspaceId,
    rootPath: changes.rootPath,
    isGitRepo: true,
    items: result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseGitStashLine(line))
      .filter((item): item is WorkspaceGitStashItem => Boolean(item))
      .sort((left, right) => left.index - right.index),
  };
}

export async function listRuntimeWorkspaceGitWorktrees(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitWorktreesResult> {
  const probe = await probeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!probe.isGitRepo) {
    return {
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      isGitRepo: false,
      items: [],
    };
  }

  const result = await runGitCommand(probe.scope.gitRootPath, ["worktree", "list", "--porcelain"]);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to list git worktrees",
    rootPath: probe.scope.gitRootPath,
    result,
  });

  const workspaceRootPath = resolve(input.rootPath);
  const items = parseGitWorktreeListPorcelain(result.stdout)
    .map<WorkspaceGitWorktreeItem>((item) => {
      const normalizedPath = resolve(item.path);
      return {
        ...item,
        path: normalizedPath,
        current: normalizedPath === workspaceRootPath,
      };
    })
    .sort((left, right) => {
      if (left.current !== right.current) {
        return left.current ? -1 : 1;
      }
      return left.path.localeCompare(right.path, "en", { sensitivity: "base" });
    });

  return {
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    isGitRepo: true,
    items,
  };
}

export async function getRuntimeWorkspaceGitSettings(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitSettingsResult> {
  const repoProbe = await probeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });

  const globalScopeArgs = ["--global"];
  const repositoryScopeArgs = ["--local"];
  const repositoryRootPath = repoProbe.isGitRepo ? repoProbe.scope.gitRootPath : input.rootPath;

  const [
    globalUserName,
    globalUserEmail,
    globalDefaultBranch,
    globalAutocrlf,
    globalPullRebase,
    globalPushDefault,
    globalFetchPrune,
  ] = await Promise.all([
    readGitConfigValue(input.rootPath, globalScopeArgs, "user.name"),
    readGitConfigValue(input.rootPath, globalScopeArgs, "user.email"),
    readGitConfigValue(input.rootPath, globalScopeArgs, "init.defaultBranch"),
    readGitConfigValue(input.rootPath, globalScopeArgs, "core.autocrlf"),
    readGitConfigValue(input.rootPath, globalScopeArgs, "pull.rebase"),
    readGitConfigValue(input.rootPath, globalScopeArgs, "push.default"),
    readGitConfigValue(input.rootPath, globalScopeArgs, "fetch.prune"),
  ]);

  const globalSettings: WorkspaceGitGlobalSettings = {
    userName: globalUserName,
    userEmail: globalUserEmail,
    defaultBranch: globalDefaultBranch,
    autocrlf: globalAutocrlf,
    pullRebase: globalPullRebase,
    pushDefault: globalPushDefault,
    fetchPrune: globalFetchPrune,
  };

  let repositorySettings: WorkspaceGitRepositorySettings = {};
  if (repoProbe.isGitRepo) {
    const [
      repositoryUserName,
      repositoryUserEmail,
      repositoryDefaultBranch,
      repositoryAutocrlf,
      repositoryPullRebase,
      repositoryPushDefault,
      repositoryFetchPrune,
      remotes,
    ] = await Promise.all([
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "user.name"),
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "user.email"),
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "init.defaultBranch"),
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "core.autocrlf"),
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "pull.rebase"),
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "push.default"),
      readGitConfigValue(repositoryRootPath, repositoryScopeArgs, "fetch.prune"),
      readGitRemoteSettings(repositoryRootPath),
    ]);

    const originRemote = remotes.find((item) => item.name === "origin");

    repositorySettings = {
      userName: repositoryUserName,
      userEmail: repositoryUserEmail,
      defaultBranch: repositoryDefaultBranch,
      autocrlf: repositoryAutocrlf,
      pullRebase: repositoryPullRebase,
      pushDefault: repositoryPushDefault,
      fetchPrune: repositoryFetchPrune,
      remotes,
      originUrl: originRemote?.url,
    };
  }

  return {
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    isGitRepo: repoProbe.isGitRepo,
    global: globalSettings,
    repository: repositorySettings,
  };
}

export async function listRuntimeWorkspaceGitHistory(input: {
  workspaceId: string;
  rootPath: string;
  limit?: number;
  offset?: number;
  ref?: string;
  refs?: string[];
  includeStats?: boolean;
  scope?: "workspace" | "repository";
}): Promise<WorkspaceGitHistoryResult> {
  const repoProbe = await probeWorkspaceGitRepository({ workspaceId: input.workspaceId, rootPath: input.rootPath });
  const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
    ? Math.max(1, Math.min(50, Math.trunc(input.limit)))
    : 20;
  const offset = typeof input.offset === "number" && Number.isFinite(input.offset)
    ? Math.max(0, Math.trunc(input.offset))
    : 0;
  if (!repoProbe.isGitRepo || !repoProbe.scope) {
    return { workspaceId: input.workspaceId, rootPath: input.rootPath, isGitRepo: false, limit, offset, hasMore: false, items: [] };
  }
  const scope = repoProbe.scope;
  const hasHead = await hasRuntimeWorkspaceGitHead(scope.gitRootPath);
  if (!hasHead) {
    return { workspaceId: input.workspaceId, rootPath: input.rootPath, isGitRepo: true, limit, offset, hasMore: false, items: [] };
  }
  const historyRefs = [
    ...(typeof input.ref === "string" && input.ref.trim().length > 0 ? [input.ref.trim()] : []),
    ...((input.refs ?? []).map((item) => item.trim()).filter(Boolean)),
  ].filter((item, index, items) => items.indexOf(item) === index);
  const includeStats = input.includeStats !== false;
  const historyArgs = [
    "log",
    "--topo-order",
    `--max-count=${limit + 1}`,
    `--skip=${offset}`,
    "--date=iso-strict",
    "--decorate=short",
    "--pretty=format:%x1e%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%ad%x1f%cr%x1f%P%x1f%d",
    ...(includeStats ? ["--shortstat"] : []),
    ...historyRefs,
  ];
  const result = await runGitCommand(
    scope.gitRootPath,
    input.scope === "repository" ? historyArgs : appendGitPathspec(historyArgs, buildWorkspaceGitPathspecs(scope)),
    30_000,
  );
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to list git history", rootPath: scope.gitRootPath, result });
  const items = result.stdout
    .split("\x1e")
    .map((item) => parseGitHistoryRecord(item))
    .filter((item): item is WorkspaceGitHistoryItem => Boolean(item));
  const hasMore = items.length > limit;
  return {
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    isGitRepo: true,
    limit,
    offset,
    hasMore,
    items: hasMore ? items.slice(0, limit) : items,
  };
}

function normalizeGitCommitHash(hashInput: string): string {
  const hash = hashInput.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "invalid git commit hash", { hash: hashInput });
  }
  return hash;
}

function normalizeGitCommitResetMode(modeInput: unknown): WorkspaceGitCommitResetMode {
  return modeInput === "hard" ? "hard" : "mixed";
}

function resolveGitStatusCode(code: string): WorkspaceGitChangeStatus {
  const normalized = code.trim().toUpperCase();
  const lead = normalized[0] ?? "";
  if (lead === "A") return "added";
  if (lead === "D") return "deleted";
  if (lead === "R" || lead === "C") return "renamed";
  if (lead === "U") return "conflict";
  return "modified";
}

function parseGitHistoryDetailStatusLine(line: string): {
  path: string;
  previousPath?: string;
  statusCode: string;
  status: WorkspaceGitChangeStatus;
} | null {
  const parts = line.split("\t").map((item) => item.trim());
  if (parts.length < 2) {
    return null;
  }
  const [rawStatus = "", firstPath = "", secondPath = ""] = parts;
  const statusCode = rawStatus.toUpperCase();
  const lead = statusCode[0] ?? "";
  if (!statusCode || !firstPath) {
    return null;
  }
  if ((lead === "R" || lead === "C") && secondPath) {
    return { path: secondPath, previousPath: firstPath, statusCode, status: resolveGitStatusCode(statusCode) };
  }
  return { path: firstPath, previousPath: undefined, statusCode, status: resolveGitStatusCode(statusCode) };
}

function parseGitHistoryDetailNumstatLine(line: string): {
  path: string;
  previousPath?: string;
  additions: number;
  deletions: number;
} | null {
  const parts = line.split("\t");
  if (parts.length < 3) {
    return null;
  }
  const [rawAdditions = "", rawDeletions = "", firstPath = "", secondPath = ""] = parts;
  const normalizedFirstPath = firstPath.trim();
  const normalizedSecondPath = secondPath.trim();
  if (!normalizedFirstPath) {
    return null;
  }
  return {
    path: normalizedSecondPath || normalizedFirstPath,
    previousPath: normalizedSecondPath ? normalizedFirstPath : undefined,
    additions: /^\d+$/.test(rawAdditions.trim()) ? Number(rawAdditions.trim()) : 0,
    deletions: /^\d+$/.test(rawDeletions.trim()) ? Number(rawDeletions.trim()) : 0,
  };
}

export async function getRuntimeWorkspaceGitHistoryDetail(input: {
  workspaceId: string;
  rootPath: string;
  hash: string;
}): Promise<WorkspaceGitHistoryDetailResult> {
  const { changes, scope } = await listRuntimeWorkspaceGitChangesInternal({ workspaceId: input.workspaceId, rootPath: input.rootPath });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }
  const hash = normalizeGitCommitHash(input.hash);
  const headerResult = await runGitCommand(scope!.gitRootPath, ["show", "-s", "--date=iso-strict", "--decorate=short", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%ad%x1f%cr%x1f%d%x1f%P", hash], 20_000);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git commit detail", rootPath: scope!.gitRootPath, result: headerResult });
  const bodyResult = await runGitCommand(scope!.gitRootPath, ["show", "-s", "--format=%B", hash], 20_000);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git commit message", rootPath: scope!.gitRootPath, result: bodyResult });
  const scopePathspecs = buildWorkspaceGitPathspecs(scope!);
  const shortstatResult = await runGitCommand(scope!.gitRootPath, appendGitPathspec(["show", "--format=", "--shortstat", hash], scopePathspecs), 20_000);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git commit shortstat", rootPath: scope!.gitRootPath, result: shortstatResult });
  const statusResult = await runGitCommand(scope!.gitRootPath, appendGitPathspec(["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "--root", hash], scopePathspecs), 20_000);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git commit file status", rootPath: scope!.gitRootPath, result: statusResult });
  const numstatResult = await runGitCommand(scope!.gitRootPath, appendGitPathspec(["diff-tree", "--no-commit-id", "--numstat", "-r", "-M", "--root", hash], scopePathspecs), 20_000);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git commit numstat", rootPath: scope!.gitRootPath, result: numstatResult });

  const headerParts = headerResult.stdout.trim().split("\x1f");
  const [resolvedHash = hash, shortHash = hash.slice(0, 7), subject = shortHash, authorName = "", authorEmail = "", authoredAt = "", authoredRelative = "", rawRefs = "", rawParents = ""] = headerParts;
  const stats = parseGitShortstatLine(shortstatResult.stdout.trim());
  const refsText = rawRefs.trim().replace(/^\((.*)\)$/, "$1").trim();
  const statusItems = statusResult.stdout
    .split(/\r?\n/)
    .map((line) => parseGitHistoryDetailStatusLine(line))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ ...item, path: mapRepoGitPathToWorkspace(scope!, item.path), previousPath: mapRepoGitPathToWorkspace(scope!, item.previousPath) }))
    .filter((item): item is NonNullable<typeof item> & { path: string } => Boolean(item.path));
  const numstatItems = numstatResult.stdout
    .split(/\r?\n/)
    .map((line) => parseGitHistoryDetailNumstatLine(line))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({ ...item, path: mapRepoGitPathToWorkspace(scope!, item.path), previousPath: mapRepoGitPathToWorkspace(scope!, item.previousPath) }))
    .filter((item): item is NonNullable<typeof item> & { path: string } => Boolean(item.path));
  const numstatByPath = new Map(numstatItems.map((item) => [`${item.previousPath ?? ""}\u0000${item.path}`, item] as const));
  const files = statusItems.map<WorkspaceGitHistoryDetailFile>((item, index) => {
    const matchedByKey = numstatByPath.get(`${item.previousPath ?? ""}\u0000${item.path}`);
    const matchedByIndex = matchedByKey ?? numstatItems[index];
    return {
      path: item.path,
      previousPath: item.previousPath,
      status: item.status,
      statusCode: item.statusCode,
      additions: matchedByIndex?.additions ?? 0,
      deletions: matchedByIndex?.deletions ?? 0,
    };
  });

  return {
    workspaceId: changes.workspaceId,
    rootPath: changes.rootPath,
    isGitRepo: true,
    hash: resolvedHash.trim() || hash,
    shortHash: shortHash.trim() || hash.slice(0, 7),
    subject: subject.trim() || shortHash.trim() || hash.slice(0, 7),
    body: bodyResult.stdout.trim() || undefined,
    authorName: authorName.trim() || undefined,
    authorEmail: authorEmail.trim() || undefined,
    authoredAt: authoredAt.trim() || undefined,
    authoredRelative: authoredRelative.trim() || undefined,
    refs: refsText ? refsText.split(",").map((item) => item.trim()).filter(Boolean) : [],
    parentHashes: rawParents.split(/\s+/).map((item) => item.trim()).filter(Boolean),
    filesChanged: stats.filesChanged || files.length,
    additions: stats.additions,
    deletions: stats.deletions,
    files,
  };
}

function parseGitFilePatch(inputPatch: string): { headerLines: string[]; hunks: WorkspaceGitHunkItem[] } {
  const lines = inputPatch.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const headerLines: string[] = [];
  const hunks: WorkspaceGitHunkItem[] = [];
  let currentHunkLines: string[] | null = null;
  let currentHeader = "";
  let currentAdditions = 0;
  let currentDeletions = 0;
  const pushCurrentHunk = () => {
    if (!currentHunkLines || !currentHeader) {
      return;
    }
    hunks.push({
      index: hunks.length,
      header: currentHeader,
      patch: currentHunkLines.join("\n"),
      additions: currentAdditions,
      deletions: currentDeletions,
    });
  };
  for (const line of lines) {
    if (line.startsWith("@@")) {
      pushCurrentHunk();
      currentHeader = line;
      currentHunkLines = [line];
      currentAdditions = 0;
      currentDeletions = 0;
      continue;
    }
    if (!currentHunkLines) {
      headerLines.push(line);
      continue;
    }
    currentHunkLines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentAdditions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      currentDeletions += 1;
    }
  }
  pushCurrentHunk();
  return { headerLines, hunks };
}

async function loadRuntimeWorkspaceGitHunkSource(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  section: WorkspaceGitHunkSection;
}): Promise<{
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  path: string;
  section: WorkspaceGitHunkSection;
  supported: boolean;
  reason?: string;
  headerLines: string[];
  hunks: WorkspaceGitHunkItem[];
}> {
  const changes = await listRuntimeWorkspaceGitChanges({ workspaceId: input.workspaceId, rootPath: input.rootPath });
  const normalizedPath = normalizeRelativePath(input.path);
  if (!normalizedPath) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git hunk path is required", {
      workspaceId: input.workspaceId,
      path: input.path,
    });
  }
  if (!changes.isGitRepo) {
    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath,
      isGitRepo: false,
      path: normalizedPath,
      section: input.section,
      supported: false,
      reason: "当前工作区不是 Git 仓库",
      headerLines: [],
      hunks: [],
    };
  }
  const targetItem = changes.items.find((item) => item.path === normalizedPath || item.previousPath === normalizedPath);
  const sectionCode = input.section === "staged" ? targetItem?.stagedStatus?.trim() : targetItem?.unstagedStatus?.trim();
  if (!targetItem || !sectionCode) {
    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath,
      isGitRepo: true,
      path: normalizedPath,
      section: input.section,
      supported: false,
      reason: "当前文件在该区域没有可按块处理的更改",
      headerLines: [],
      hunks: [],
    };
  }
  if (classifyGitSectionStatus(sectionCode) !== "modified") {
    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath,
      isGitRepo: true,
      path: targetItem.path,
      section: input.section,
      supported: false,
      reason: "当前仅支持对已修改的文本文件按块操作",
      headerLines: [],
      hunks: [],
    };
  }
  const diffArgs = ["-c", "core.quotepath=false", "diff", "--no-ext-diff", "--unified=3"];
  if (input.section === "staged") {
    diffArgs.push("--cached");
  }
  diffArgs.push("--", targetItem.path);
  const diffResult = await runGitCommand(changes.rootPath, diffArgs, 20_000);
  await ensureGitCommandSucceeded({ workspaceId: input.workspaceId, action: "failed to read git hunks", rootPath: changes.rootPath, result: diffResult });
  const patchText = diffResult.stdout.replace(/\r\n/g, "\n").trimEnd();
  if (!patchText) {
    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath,
      isGitRepo: true,
      path: targetItem.path,
      section: input.section,
      supported: false,
      reason: "当前没有可按块处理的文本差异",
      headerLines: [],
      hunks: [],
    };
  }
  const parsedPatch = parseGitFilePatch(patchText);
  if (parsedPatch.hunks.length === 0) {
    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath,
      isGitRepo: true,
      path: targetItem.path,
      section: input.section,
      supported: false,
      reason: "当前没有可按块处理的文本差异",
      headerLines: [],
      hunks: [],
    };
  }
  return {
    workspaceId: changes.workspaceId,
    rootPath: changes.rootPath,
    isGitRepo: true,
    path: targetItem.path,
    section: input.section,
    supported: true,
    reason: undefined,
    headerLines: parsedPatch.headerLines,
    hunks: parsedPatch.hunks,
  };
}

function buildUnsupportedRuntimeWorkspaceGitHunksResult(input: {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  path: string;
  section: WorkspaceGitHunkSection;
  reason: string;
}): WorkspaceGitHunksResult {
  return {
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    isGitRepo: input.isGitRepo,
    path: input.path,
    section: input.section,
    supported: false,
    reason: input.reason,
    items: [],
  };
}

export async function listRuntimeWorkspaceGitHunks(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  section: WorkspaceGitHunkSection;
}): Promise<WorkspaceGitHunksResult> {
  const normalizedPath = normalizeRelativePath(input.path);
  if (!normalizedPath) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git hunk path is required", {
      workspaceId: input.workspaceId,
      path: input.path,
    });
  }
  const source = await loadRuntimeWorkspaceGitHunkSource({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    path: normalizedPath,
    section: input.section,
  });
  if (!source.supported) {
    return buildUnsupportedRuntimeWorkspaceGitHunksResult({
      workspaceId: input.workspaceId,
      rootPath: source.rootPath,
      isGitRepo: source.isGitRepo,
      path: normalizedPath,
      section: input.section,
      reason: source.reason || "当前没有可按块处理的差异",
    });
  }
  return {
    workspaceId: input.workspaceId,
    rootPath: source.rootPath,
    isGitRepo: true,
    path: source.path,
    section: input.section,
    supported: true,
    reason: undefined,
    items: source.hunks,
  };
}

function normalizeGitHunkIndices(hunkIndices: number[] | undefined): number[] {
  const normalized = (hunkIndices ?? [])
    .map((item) => (Number.isFinite(item) ? Math.trunc(item) : Number.NaN))
    .filter((item) => Number.isInteger(item) && item >= 0);
  return [...new Set(normalized)].sort((left, right) => left - right);
}

function buildRuntimeWorkspaceGitApplyPatch(input: {
  headerLines: string[];
  hunks: WorkspaceGitHunkItem[];
}): string {
  return [
    ...input.headerLines,
    ...input.hunks.flatMap((item) => item.patch.split("\n")),
    "",
  ].join("\n");
}

async function applyRuntimeWorkspaceGitHunks(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  section: WorkspaceGitHunkSection;
  hunkIndices: number[];
  cached?: boolean;
  reverse?: boolean;
  successMessage: string;
}): Promise<WorkspaceGitOperationResult> {
  const source = await loadRuntimeWorkspaceGitHunkSource({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    path: input.path,
    section: input.section,
  });
  if (!source.supported) {
    throw new RuntimeWorkspaceError(
      "INVALID_ARGUMENT",
      source.reason || "当前没有可按块处理的差异",
      {
        workspaceId: input.workspaceId,
        path: source.path,
        section: input.section,
      },
    );
  }

  const hunkIndices = normalizeGitHunkIndices(input.hunkIndices);
  if (hunkIndices.length === 0) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git hunk indices are required", {
      workspaceId: input.workspaceId,
      path: source.path,
      section: input.section,
    });
  }

  const selectedHunks = hunkIndices
    .map((index) => source.hunks[index])
    .filter((item): item is WorkspaceGitHunkItem => Boolean(item));
  if (selectedHunks.length !== hunkIndices.length) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "git hunk index is out of range", {
      workspaceId: input.workspaceId,
      path: source.path,
      requested: hunkIndices,
    });
  }

  const applyPatch = buildRuntimeWorkspaceGitApplyPatch({
    headerLines: source.headerLines,
    hunks: selectedHunks,
  });
  const args = ["apply", "--recount", "--whitespace=nowarn"];
  if (input.cached) {
    args.push("--cached");
  }
  if (input.reverse) {
    args.push("--reverse");
  }
  const result = await runGitCommandWithInput(source.rootPath, args, applyPatch, 30_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to apply git hunks",
    rootPath: source.rootPath,
    result,
  });

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: source.rootPath,
    message: input.successMessage,
  });
}

export async function stageRuntimeWorkspaceGitHunks(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  hunkIndices: number[];
}): Promise<WorkspaceGitOperationResult> {
  return applyRuntimeWorkspaceGitHunks({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    path: input.path,
    section: "unstaged",
    hunkIndices: input.hunkIndices,
    cached: true,
    reverse: false,
    successMessage: "已暂存所选代码块",
  });
}

export async function unstageRuntimeWorkspaceGitHunks(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  hunkIndices: number[];
}): Promise<WorkspaceGitOperationResult> {
  return applyRuntimeWorkspaceGitHunks({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    path: input.path,
    section: "staged",
    hunkIndices: input.hunkIndices,
    cached: true,
    reverse: true,
    successMessage: "已撤回所选暂存块",
  });
}

export async function discardRuntimeWorkspaceGitHunks(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  hunkIndices: number[];
}): Promise<WorkspaceGitOperationResult> {
  return applyRuntimeWorkspaceGitHunks({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    path: input.path,
    section: "unstaged",
    hunkIndices: input.hunkIndices,
    cached: false,
    reverse: true,
    successMessage: "已丢弃所选代码块",
  });
}

async function discardRuntimeWorkspaceFilesystemPaths(rootPath: string, paths: string[]) {
  for (const path of paths) {
    const absolutePath = resolve(rootPath, path);
    ensurePathInsideRoot(rootPath, absolutePath, path);
    await fs.rm(absolutePath, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function initRuntimeWorkspaceGitRepository(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitOperationResult> {
  const result = await runGitCommand(input.rootPath, ["init"]);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to initialize git repository",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "Git 仓库已初始化",
  });
}

export async function saveRuntimeWorkspaceGitSettings(input: {
  workspaceId: string;
  rootPath: string;
  global?: WorkspaceGitGlobalSettings;
  repository?: WorkspaceGitRepositorySettings;
}): Promise<WorkspaceGitOperationResult> {
  const hasGlobalUpdate = Boolean(input.global);
  const hasRepositoryUpdate = Boolean(input.repository);
  let repoScope: WorkspaceGitScope | undefined;

  if (hasRepositoryUpdate) {
    repoScope = await assertRuntimeWorkspaceGitRepository({
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
    });
  }

  if (input.global) {
    await Promise.all([
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "user.name",
        value: input.global.userName,
        action: "failed to save git global user.name",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "user.email",
        value: input.global.userEmail,
        action: "failed to save git global user.email",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "init.defaultBranch",
        value: input.global.defaultBranch,
        action: "failed to save git global init.defaultBranch",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "core.autocrlf",
        value: input.global.autocrlf,
        action: "failed to save git global core.autocrlf",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "pull.rebase",
        value: input.global.pullRebase,
        action: "failed to save git global pull.rebase",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "push.default",
        value: input.global.pushDefault,
        action: "failed to save git global push.default",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: input.rootPath,
        scopeArgs: ["--global"],
        key: "fetch.prune",
        value: input.global.fetchPrune,
        action: "failed to save git global fetch.prune",
      }),
    ]);
  }

  if (input.repository && repoScope) {
    await Promise.all([
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "user.name",
        value: input.repository.userName,
        action: "failed to save git repository user.name",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "user.email",
        value: input.repository.userEmail,
        action: "failed to save git repository user.email",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "init.defaultBranch",
        value: input.repository.defaultBranch,
        action: "failed to save git repository init.defaultBranch",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "core.autocrlf",
        value: input.repository.autocrlf,
        action: "failed to save git repository core.autocrlf",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "pull.rebase",
        value: input.repository.pullRebase,
        action: "failed to save git repository pull.rebase",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "push.default",
        value: input.repository.pushDefault,
        action: "failed to save git repository push.default",
      }),
      writeGitConfigValue({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        scopeArgs: ["--local"],
        key: "fetch.prune",
        value: input.repository.fetchPrune,
        action: "failed to save git repository fetch.prune",
      }),
    ]);

    if (Object.prototype.hasOwnProperty.call(input.repository, "remotes")) {
      const remotes = normalizeGitRemoteSettings(input.repository.remotes ?? []);
      await replaceGitRemoteSettings({
        workspaceId: input.workspaceId,
        rootPath: repoScope.gitRootPath,
        remotes,
      });
    } else if (Object.prototype.hasOwnProperty.call(input.repository, "originUrl")) {
      const originUrl = input.repository.originUrl?.trim();
      if (!originUrl) {
        throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "origin url is required", {
          workspaceId: input.workspaceId,
          field: "originUrl",
        });
      }
      const setRemoteResult = await runGitCommand(
        repoScope.gitRootPath,
        ["remote", "set-url", "origin", originUrl],
        20_000,
      );
      if (!setRemoteResult.ok) {
        const addRemoteResult = await runGitCommand(
          repoScope.gitRootPath,
          ["remote", "add", "origin", originUrl],
          20_000,
        );
        await ensureGitCommandSucceeded({
          workspaceId: input.workspaceId,
          action: "failed to save git repository origin url",
          rootPath: repoScope.gitRootPath,
          result: addRemoteResult,
        });
      }
    }
  }

  const scopeText = hasGlobalUpdate && hasRepositoryUpdate
    ? "全局与仓库"
    : hasGlobalUpdate
      ? "全局"
      : "仓库";
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: `已保存 ${scopeText} Git 设置`,
  });
}

export async function stageRuntimeWorkspaceGitChanges(input: {
  workspaceId: string;
  rootPath: string;
  all?: boolean;
  paths?: string[];
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const paths = normalizeGitActionPaths(input.paths)
    .map((path) => toWorkspaceGitRepoPath(scope, path))
    .filter((path): path is string => Boolean(path));
  const result = input.all
    ? await runGitCommand(
      scope.gitRootPath,
      appendGitPathspec(["add", "-A"], buildWorkspaceGitPathspecs(scope)),
    )
    : await runGitCommand(scope.gitRootPath, ["add", "--", ...paths]);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to stage git changes",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.all ? "已暂存全部更改" : "已暂存所选更改",
  });
}

export async function unstageRuntimeWorkspaceGitChanges(input: {
  workspaceId: string;
  rootPath: string;
  all?: boolean;
  paths?: string[];
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const paths = normalizeGitActionPaths(input.paths)
    .map((path) => toWorkspaceGitRepoPath(scope, path))
    .filter((path): path is string => Boolean(path));
  const hasHead = await hasRuntimeWorkspaceGitHead(scope.gitRootPath);
  const scopedPaths = input.all ? buildWorkspaceGitPathspecs(scope) : paths;
  const result = hasHead
    ? await runGitCommand(scope.gitRootPath, ["reset", "HEAD", "--", ...scopedPaths])
    : await runGitCommand(
      scope.gitRootPath,
      ["rm", "--cached", "-r", "--ignore-unmatch", "--", ...scopedPaths],
    );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to unstage git changes",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.all ? "已撤回全部暂存" : "已撤回所选暂存",
  });
}

export async function discardRuntimeWorkspaceGitChanges(input: {
  workspaceId: string;
  rootPath: string;
  all?: boolean;
  paths?: string[];
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const normalizedPaths = normalizeGitActionPaths(input.paths);
  const { changes } = await listRuntimeWorkspaceGitChangesInternal({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const targetItems = changes.items.filter((item) => {
    if (!item.unstagedStatus) {
      return false;
    }
    if (input.all) {
      return true;
    }
    return normalizedPaths.includes(item.path)
      || Boolean(item.previousPath && normalizedPaths.includes(item.previousPath));
  });

  if (targetItems.length === 0) {
    return createRuntimeWorkspaceGitOperationResult({
      workspaceId: input.workspaceId,
      rootPath: input.rootPath,
      message: input.all ? "没有可丢弃的未暂存更改" : "没有匹配的未暂存更改",
    });
  }

  const hasHead = await hasRuntimeWorkspaceGitHead(scope.gitRootPath);
  const trackedPaths = new Set<string>();
  const filesystemPaths = new Set<string>();

  for (const item of targetItems) {
    const unstagedCode = item.unstagedStatus?.trim() ?? "";
    const isFilesystemOnly = unstagedCode === "?"
      || (!hasHead && (item.status === "added" || item.status === "untracked"));
    if (isFilesystemOnly) {
      filesystemPaths.add(item.path);
      continue;
    }
    trackedPaths.add(item.path);
    if (item.previousPath) {
      trackedPaths.add(item.previousPath);
    }
  }

  if (trackedPaths.size > 0) {
    const restorePaths = [...trackedPaths]
      .map((path) => toWorkspaceGitRepoPath(scope, path))
      .filter((path): path is string => Boolean(path));
    const restoreResult = await runGitCommand(scope.gitRootPath, [
      "restore",
      "--worktree",
      "--source=HEAD",
      "--",
      ...restorePaths,
    ], 30_000);
    await ensureGitCommandSucceeded({
      workspaceId: input.workspaceId,
      action: "failed to discard git changes",
      rootPath: input.rootPath,
      result: restoreResult,
    });
  }

  if (filesystemPaths.size > 0) {
    await discardRuntimeWorkspaceFilesystemPaths(input.rootPath, [...filesystemPaths]);
  }

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.all ? "已丢弃全部未暂存更改" : "已丢弃所选更改",
  });
}

export async function createRuntimeWorkspaceGitStash(input: {
  workspaceId: string;
  rootPath: string;
  message?: string;
  includeUntracked?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const args = ["stash", "push"];
  if (input.includeUntracked !== false) {
    args.push("--include-untracked");
  }
  if (input.message?.trim()) {
    args.push("-m", input.message.trim());
  }
  const result = await runGitCommand(
    scope.gitRootPath,
    appendGitPathspec(args, buildWorkspaceGitPathspecs(scope)),
    45_000,
  );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to create git stash",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已保存到暂存栈",
  });
}

export async function applyRuntimeWorkspaceGitStash(input: {
  workspaceId: string;
  rootPath: string;
  ref: string;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const ref = input.ref.trim();
  if (!ref) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "stash ref is required", {
      workspaceId: input.workspaceId,
      field: "ref",
    });
  }
  const result = await runGitCommand(input.rootPath, ["stash", "apply", ref], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to apply git stash",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已应用暂存记录",
  });
}

export async function popRuntimeWorkspaceGitStash(input: {
  workspaceId: string;
  rootPath: string;
  ref: string;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const ref = input.ref.trim();
  if (!ref) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "stash ref is required", {
      workspaceId: input.workspaceId,
      field: "ref",
    });
  }
  const result = await runGitCommand(input.rootPath, ["stash", "pop", ref], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to pop git stash",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已恢复并移除暂存记录",
  });
}

export async function dropRuntimeWorkspaceGitStash(input: {
  workspaceId: string;
  rootPath: string;
  ref: string;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const ref = input.ref.trim();
  if (!ref) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "stash ref is required", {
      workspaceId: input.workspaceId,
      field: "ref",
    });
  }
  const result = await runGitCommand(input.rootPath, ["stash", "drop", ref], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to drop git stash",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已删除暂存记录",
  });
}

export async function commitRuntimeWorkspaceGitChanges(input: {
  workspaceId: string;
  rootPath: string;
  message: string;
  amend?: boolean;
  stageAll?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const message = input.message.trim();
  if (!message) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "commit message is required", {
      workspaceId: input.workspaceId,
      field: "message",
    });
  }
  if (input.stageAll) {
    const stageResult = await runGitCommand(
      scope.gitRootPath,
      appendGitPathspec(["add", "-A"], buildWorkspaceGitPathspecs(scope)),
    );
    await ensureGitCommandSucceeded({
      workspaceId: input.workspaceId,
      action: "failed to stage git changes before commit",
      rootPath: input.rootPath,
      result: stageResult,
    });
  }
  const commitArgs = input.amend
    ? ["commit", "--amend", "-m", message]
    : ["commit", "-m", message];
  const commitResult = await runGitCommand(
    scope.gitRootPath,
    appendGitPathspec(commitArgs, buildWorkspaceGitPathspecs(scope)),
    30_000,
  );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to create git commit",
    rootPath: input.rootPath,
    result: commitResult,
  });
  const lastCommit = await readWorkspaceLastCommit(scope.gitRootPath);
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.amend ? "已更新最新提交" : "已创建提交",
    commitHash: lastCommit.hash,
    branch: changes.branch,
  });
}

export async function createRuntimeWorkspaceGitBranch(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
  startPoint?: string;
  checkout?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const name = input.name.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "branch name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  await validateGitBranchName(input.rootPath, name);
  const args = input.checkout
    ? ["checkout", "-b", name, ...(input.startPoint?.trim() ? [input.startPoint.trim()] : [])]
    : ["branch", name, ...(input.startPoint?.trim() ? [input.startPoint.trim()] : [])];
  const result = await runGitCommand(input.rootPath, args, 30_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to create git branch",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.checkout ? "已创建并切换分支" : "已创建分支",
    branch: name,
  });
}

export async function createRuntimeWorkspaceGitWorktree(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  branchName?: string;
  startPoint?: string;
  detach?: boolean;
  force?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const targetPath = input.path.trim();
  if (!targetPath) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "worktree path is required", {
      workspaceId: input.workspaceId,
      field: "path",
    });
  }

  const branchName = input.branchName?.trim() || undefined;
  const startPoint = input.startPoint?.trim() || undefined;
  if (branchName) {
    await validateGitBranchName(scope.gitRootPath, branchName);
  }
  if (input.detach && branchName) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "detach mode cannot be used with branchName", {
      workspaceId: input.workspaceId,
      field: "detach",
    });
  }

  const args = ["worktree", "add"];
  if (input.force) {
    args.push("--force");
  }
  if (input.detach) {
    args.push("--detach");
  }
  if (branchName) {
    args.push("-b", branchName);
  }
  args.push(targetPath);
  if (startPoint) {
    args.push(startPoint);
  }

  const result = await runGitCommand(scope.gitRootPath, args, 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to create git worktree",
    rootPath: scope.gitRootPath,
    result,
  });

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已创建工作树",
    branch: branchName,
  });
}

export async function removeRuntimeWorkspaceGitWorktree(input: {
  workspaceId: string;
  rootPath: string;
  path: string;
  force?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const targetPath = input.path.trim();
  if (!targetPath) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "worktree path is required", {
      workspaceId: input.workspaceId,
      field: "path",
    });
  }

  const result = await runGitCommand(
    scope.gitRootPath,
    ["worktree", "remove", ...(input.force ? ["--force"] : []), targetPath],
    45_000,
  );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to remove git worktree",
    rootPath: scope.gitRootPath,
    result,
  });

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已移除工作树",
  });
}

export async function pruneRuntimeWorkspaceGitWorktrees(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitOperationResult> {
  const scope = await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const result = await runGitCommand(scope.gitRootPath, ["worktree", "prune"], 30_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to prune git worktrees",
    rootPath: scope.gitRootPath,
    result,
  });

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已清理失效工作树记录",
  });
}

export async function createRuntimeWorkspaceGitTag(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
  message?: string;
  ref?: string;
  push?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  const probe = await probeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!probe.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }

  const scope = probe.scope;
  const name = input.name.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "tag name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  await validateGitTagName(scope.gitRootPath, name);

  const lastCommit = await readWorkspaceLastCommit(scope.gitRootPath);
  if (!input.ref?.trim() && !lastCommit.hash) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "no commits available for tag creation", {
      workspaceId: input.workspaceId,
    });
  }

  const ref = input.ref?.trim() || lastCommit.hash || "HEAD";
  const targetResult = await runGitCommand(scope.gitRootPath, ["rev-parse", "--verify", `${ref}^{commit}`]);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to resolve git tag target",
    rootPath: input.rootPath,
    result: targetResult,
  });
  const targetHash = targetResult.stdout.trim();

  const existingResult = await runGitCommand(scope.gitRootPath, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/tags/${name}^{commit}`,
  ]);
  const existingHash = existingResult.ok ? existingResult.stdout.trim() : "";
  if (existingHash && existingHash !== targetHash) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "tag already exists on another commit", {
      workspaceId: input.workspaceId,
      tag: name,
      existingCommitHash: existingHash,
      targetCommitHash: targetHash,
    });
  }

  if (!existingHash) {
    const tagMessage = input.message?.trim() || name;
    const createResult = await runGitCommand(
      scope.gitRootPath,
      ["tag", "-a", name, "-m", tagMessage, ref],
      30_000,
    );
    await ensureGitCommandSucceeded({
      workspaceId: input.workspaceId,
      action: "failed to create git tag",
      rootPath: input.rootPath,
      result: createResult,
    });
  }

  if (input.push !== false) {
    const remote = await resolveDefaultGitRemote(scope.gitRootPath);
    const pushResult = await runGitCommand(scope.gitRootPath, ["push", remote || "origin", name], 45_000);
    await ensureGitCommandSucceeded({
      workspaceId: input.workspaceId,
      action: "failed to push git tag",
      rootPath: input.rootPath,
      result: pushResult,
    });
  }

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.push === false ? `已创建标签 ${name}` : `已创建并推送标签 ${name}`,
    commitHash: targetHash,
  });
}

export async function checkoutRuntimeWorkspaceGitBranch(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
  detach?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const name = input.name.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "branch name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  const result = await runGitCommand(
    input.rootPath,
    input.detach ? ["checkout", "--detach", name] : ["checkout", name],
    30_000,
  );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to checkout git branch",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: input.detach ? "已以 Detached HEAD 检出分支" : "已切换分支",
    branch: input.detach ? undefined : name,
  });
}

export async function mergeRuntimeWorkspaceGitBranchIntoCurrent(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
}): Promise<WorkspaceGitOperationResult> {
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }
  if (changes.detached || !changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot merge into detached HEAD", {
      workspaceId: input.workspaceId,
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "branch name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  if (name === changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot merge current branch into itself", {
      workspaceId: input.workspaceId,
      branch: name,
    });
  }

  const result = await runGitCommand(changes.rootPath, ["merge", "--no-edit", name], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to merge git branch into current branch",
    rootPath: changes.rootPath,
    result,
  });

  const lastCommit = await readWorkspaceLastCommit(changes.rootPath);
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: changes.rootPath,
    message: `已将 ${name} 合并到当前分支`,
    branch: changes.branch,
    commitHash: lastCommit.hash,
  });
}

export async function rebaseRuntimeWorkspaceCurrentGitBranch(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
}): Promise<WorkspaceGitOperationResult> {
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }
  if (changes.detached || !changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot rebase detached HEAD", {
      workspaceId: input.workspaceId,
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "branch name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  if (name === changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot rebase current branch onto itself", {
      workspaceId: input.workspaceId,
      branch: name,
    });
  }

  const result = await runGitCommand(changes.rootPath, ["rebase", name], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to rebase current git branch",
    rootPath: changes.rootPath,
    result,
  });

  const lastCommit = await readWorkspaceLastCommit(changes.rootPath);
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: changes.rootPath,
    message: `已将当前分支变基到 ${name}`,
    branch: changes.branch,
    commitHash: lastCommit.hash,
  });
}

export async function renameRuntimeWorkspaceGitBranch(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
  nextName: string;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const name = input.name.trim();
  const nextName = input.nextName.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "branch name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  if (!nextName) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "new branch name is required", {
      workspaceId: input.workspaceId,
      field: "nextName",
    });
  }
  if (name === nextName) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "new branch name must be different", {
      workspaceId: input.workspaceId,
      branch: name,
    });
  }
  await validateGitBranchName(input.rootPath, nextName);
  const result = await runGitCommand(input.rootPath, ["branch", "-m", name, nextName], 30_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to rename git branch",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: `已将分支重命名为 ${nextName}`,
    branch: nextName,
  });
}

export async function deleteRuntimeWorkspaceGitBranch(input: {
  workspaceId: string;
  rootPath: string;
  name: string;
  force?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const name = input.name.trim();
  if (!name) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "branch name is required", {
      workspaceId: input.workspaceId,
      field: "name",
    });
  }
  const result = await runGitCommand(input.rootPath, [
    "branch",
    input.force ? "-D" : "-d",
    name,
  ]);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to delete git branch",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已删除分支",
    branch: name,
  });
}

export async function fetchRuntimeWorkspaceGitRemote(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const result = await runGitCommand(input.rootPath, ["fetch", "--all", "--prune"], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to fetch git remotes",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已抓取远端更新",
  });
}

export async function pullRuntimeWorkspaceGitRemote(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitOperationResult> {
  await assertRuntimeWorkspaceGitRepository({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  const result = await runGitCommand(input.rootPath, ["pull", "--ff-only"], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to pull git changes",
    rootPath: input.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    message: "已拉取远端更新",
  });
}

export async function pushRuntimeWorkspaceGitRemote(input: {
  workspaceId: string;
  rootPath: string;
  setUpstream?: boolean;
}): Promise<WorkspaceGitOperationResult> {
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }
  if (changes.detached || !changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot push from detached HEAD", {
      workspaceId: input.workspaceId,
    });
  }
  const remote = await resolveDefaultGitRemote(changes.rootPath);
  const args = input.setUpstream && !changes.upstream
    ? ["push", "-u", remote || "origin", changes.branch]
    : ["push"];
  const result = await runGitCommand(changes.rootPath, args, 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to push git changes",
    rootPath: changes.rootPath,
    result,
  });
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: changes.rootPath,
    message: input.setUpstream && !changes.upstream ? "已发布当前分支" : "已推送分支更新",
    branch: changes.branch,
  });
}

export async function revertRuntimeWorkspaceGitCommit(input: {
  workspaceId: string;
  rootPath: string;
  hash: string;
}): Promise<WorkspaceGitOperationResult> {
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }
  if (changes.detached || !changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot revert commit from detached HEAD", {
      workspaceId: input.workspaceId,
    });
  }

  const hash = normalizeGitCommitHash(input.hash);
  const result = await runGitCommand(changes.rootPath, ["revert", "--no-edit", hash], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to revert git commit",
    rootPath: changes.rootPath,
    result,
  });

  const lastCommit = await readWorkspaceLastCommit(changes.rootPath);
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: changes.rootPath,
    message: `已还原提交 ${hash.slice(0, 7)}`,
    branch: changes.branch,
    commitHash: lastCommit.hash,
  });
}

export async function cherryPickRuntimeWorkspaceGitCommit(input: {
  workspaceId: string;
  rootPath: string;
  hash: string;
}): Promise<WorkspaceGitOperationResult> {
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }
  if (changes.detached || !changes.branch) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "cannot cherry-pick commit from detached HEAD", {
      workspaceId: input.workspaceId,
    });
  }

  const hash = normalizeGitCommitHash(input.hash);
  const result = await runGitCommand(changes.rootPath, ["cherry-pick", hash], 45_000);
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to cherry-pick git commit",
    rootPath: changes.rootPath,
    result,
  });

  const lastCommit = await readWorkspaceLastCommit(changes.rootPath);
  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: changes.rootPath,
    message: `已挑拣提交 ${hash.slice(0, 7)}`,
    branch: changes.branch,
    commitHash: lastCommit.hash,
  });
}

export async function resetRuntimeWorkspaceGitCommit(input: {
  workspaceId: string;
  rootPath: string;
  hash: string;
  mode?: WorkspaceGitCommitResetMode;
}): Promise<WorkspaceGitOperationResult> {
  const changes = await listRuntimeWorkspaceGitChanges({
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
  });
  if (!changes.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }

  const hash = normalizeGitCommitHash(input.hash);
  const mode = normalizeGitCommitResetMode(input.mode);
  const result = await runGitCommand(
    changes.rootPath,
    ["reset", mode === "hard" ? "--hard" : "--mixed", hash],
    45_000,
  );
  await ensureGitCommandSucceeded({
    workspaceId: input.workspaceId,
    action: "failed to reset git commit",
    rootPath: changes.rootPath,
    result,
  });

  return createRuntimeWorkspaceGitOperationResult({
    workspaceId: input.workspaceId,
    rootPath: changes.rootPath,
    message: mode === "hard"
      ? `已硬重置到 ${hash.slice(0, 7)}`
      : `已重置到 ${hash.slice(0, 7)}`,
    branch: changes.detached ? undefined : changes.branch,
    commitHash: hash,
  });
}

async function assertRuntimeWorkspaceGitRepository(input: {
  workspaceId: string;
  rootPath: string;
}): Promise<WorkspaceGitScope> {
  const probe = await probeWorkspaceGitRepository(input);
  if (!probe.isGitRepo) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "workspace is not a git repository", {
      workspaceId: input.workspaceId,
    });
  }

  return probe.scope;
}

async function validateGitBranchName(rootPath: string, name: string) {
  const result = await runGitCommand(rootPath, ["check-ref-format", "--branch", name]);
  if (!result.ok) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "invalid branch name", {
      branch: name,
      stderr: describeGitCommandError(result),
    });
  }
}

async function validateGitTagName(rootPath: string, name: string) {
  const result = await runGitCommand(rootPath, ["check-ref-format", `refs/tags/${name}`]);
  if (!result.ok) {
    throw new RuntimeWorkspaceError("INVALID_ARGUMENT", "invalid tag name", {
      tag: name,
      stderr: describeGitCommandError(result),
    });
  }
}

function normalizeGitActionPaths(paths: string[] | undefined): string[] {
  const normalized = (paths ?? [])
    .map((item) => normalizeRelativePath(item))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function createRuntimeWorkspaceGitOperationResult(input: {
  workspaceId: string;
  rootPath: string;
  message: string;
  branch?: string;
  commitHash?: string;
}): WorkspaceGitOperationResult {
  return {
    workspaceId: input.workspaceId,
    rootPath: input.rootPath,
    ok: true,
    message: input.message,
    branch: input.branch,
    commitHash: input.commitHash,
  };
}

async function resolveDefaultGitRemote(rootPath: string): Promise<string | undefined> {
  const result = await runGitCommand(rootPath, ["remote"]);
  if (!result.ok) {
    return undefined;
  }

  const remotes = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (remotes.includes("origin")) {
    return "origin";
  }
  return remotes[0] || undefined;
}
