import { promises as fs } from "node:fs";
import { resolve } from "node:path";

import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopGitBranchNameInput,
  DesktopGitBranchesResult,
  DesktopGitCheckoutBranchInput,
  DesktopGitCommitChangesInput,
  DesktopGitCommitHashInput,
  DesktopGitCommitMessageSuggestionsQuery,
  DesktopGitCommitMessageSuggestionsResult,
  DesktopGitCompareQuery,
  DesktopGitCompareResult,
  DesktopGitCreateBranchInput,
  DesktopGitCreateTagInput,
  DesktopGitCreateStashInput,
  DesktopGitDeleteBranchInput,
  DesktopGitDiscardChangesInput,
  DesktopGitHistoryDetailResult,
  DesktopGitHistoryQuery,
  DesktopGitHistoryResult,
  DesktopGitHunkMutationInput,
  DesktopGitHunksQuery,
  DesktopGitHunksResult,
  DesktopGitIgnoreResult,
  DesktopGitModuleSnapshotQuery,
  DesktopGitModuleSnapshotResult,
  DesktopGitOperationResult,
  DesktopGitPushRemoteInput,
  DesktopGitRenameBranchInput,
  DesktopGitResetCommitInput,
  DesktopGitReviewDetailQuery,
  DesktopGitReviewDetailResult,
  DesktopGitReviewResult,
  DesktopGitSaveIgnoreInput,
  DesktopGitStageChangesInput,
  DesktopGitStashRefInput,
  DesktopGitStashesResult,
  DesktopGitUnstageChangesInput,
  DesktopGitChangesResult,
} from "../../abstraction/models/desktop-git.models";
import type { DesktopGitPort } from "../../abstraction/ports/desktop-git.ports";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import { buildHeuristicGitCommitSuggestions, pickGitCommitScope, summarizeGitCommitItems } from "./desktop-git-commit-message";
import { DesktopGitError } from "./desktop-git-error";
import {
  applyRuntimeWorkspaceGitStash,
  checkoutRuntimeWorkspaceGitBranch,
  cherryPickRuntimeWorkspaceGitCommit,
  commitRuntimeWorkspaceGitChanges,
  compareRuntimeWorkspaceGitRefs,
  createRuntimeWorkspaceGitBranch,
  createRuntimeWorkspaceGitTag,
  createRuntimeWorkspaceGitStash,
  deleteRuntimeWorkspaceGitBranch,
  discardRuntimeWorkspaceGitChanges,
  discardRuntimeWorkspaceGitHunks,
  dropRuntimeWorkspaceGitStash,
  fetchRuntimeWorkspaceGitRemote,
  getRuntimeWorkspaceGitHistoryDetail,
  getRuntimeWorkspaceGitReviewDetail,
  initRuntimeWorkspaceGitRepository,
  listRuntimeWorkspaceGitBranches,
  listRuntimeWorkspaceGitChanges,
  listRuntimeWorkspaceGitHistory,
  listRuntimeWorkspaceGitHunks,
  listRuntimeWorkspaceGitReview,
  listRuntimeWorkspaceGitStashes,
  mergeRuntimeWorkspaceGitBranchIntoCurrent,
  popRuntimeWorkspaceGitStash,
  pullRuntimeWorkspaceGitRemote,
  pushRuntimeWorkspaceGitRemote,
  rebaseRuntimeWorkspaceCurrentGitBranch,
  renameRuntimeWorkspaceGitBranch,
  resetRuntimeWorkspaceGitCommit,
  revertRuntimeWorkspaceGitCommit,
  stageRuntimeWorkspaceGitChanges,
  stageRuntimeWorkspaceGitHunks,
  unstageRuntimeWorkspaceGitChanges,
  unstageRuntimeWorkspaceGitHunks,
} from "./desktop-git-inspector";

const WORKSPACE_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const CONVENTIONAL_COMMIT_PARSE_RE =
  /^(?<type>feat|fix|refactor|docs|style|test|perf|build|ci|chore)\s*(?:\(\s*(?<scope>[^)]+?)\s*\))?\s*(?<breaking>!)?\s*:\s*(?<subject>\S(?:[\s\S]*\S)?)\s*$/i;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWorkspaceId(input: unknown): string {
  if (typeof input !== "string") {
    throw new DesktopGitError("INVALID_ARGUMENT", "workspaceId is required");
  }
  const normalized = input.trim().toLowerCase();
  if (!WORKSPACE_ID_RE.test(normalized)) {
    throw new DesktopGitError("INVALID_ARGUMENT", "invalid workspaceId format", {
      workspaceId: input,
    });
  }
  return normalized;
}

function normalizeConventionalCommitScope(scope: string | undefined): string | undefined {
  if (!scope) {
    return undefined;
  }
  const normalized = scope
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9./-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-./]+|[-./]+$/g, "");
  return normalized || undefined;
}

function extractPreferredCommitScope(items: string[]): string | undefined {
  for (const item of items) {
    const match = item.match(CONVENTIONAL_COMMIT_PARSE_RE);
    const scope = normalizeConventionalCommitScope(match?.groups?.scope);
    if (scope) {
      return scope;
    }
  }
  return undefined;
}

function buildCommitMessageBaseSummary(input: {
  changes: DesktopGitChangesResult;
  scope: "changed" | "staged";
  items: Array<Pick<DesktopGitReviewResult["items"][number], "path" | "status" | "additions" | "deletions">>;
}) {
  return [
    `branch=${input.changes.branch || "-"}; upstream=${input.changes.upstream || "-"}; scope=${input.scope}; files=${input.items.length}`,
    summarizeGitCommitItems(input.items),
  ].join("\n");
}

export class DesktopGitService implements DesktopGitPort {
  constructor(
    private readonly workspaceQuery: DesktopWorkspaceQueryPort,
    private readonly logger: RuntimeLogger,
  ) {}

  async getGitIgnore(workspaceId: string): Promise<DesktopGitIgnoreResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    const absolutePath = resolve(rootPath, ".gitignore");
    const changes = await this.getGitChanges(id);

    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      return {
        workspaceId: id,
        rootPath,
        isGitRepo: changes.isGitRepo,
        path: ".gitignore",
        absolutePath,
        exists: true,
        content,
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
        return {
          workspaceId: id,
          rootPath,
          isGitRepo: changes.isGitRepo,
          path: ".gitignore",
          absolutePath,
          exists: false,
          content: "",
        };
      }

      throw new DesktopGitError("IO_ERROR", "failed to read .gitignore", {
        workspaceId: id,
        path: ".gitignore",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getGitChanges(workspaceId: string): Promise<DesktopGitChangesResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return listRuntimeWorkspaceGitChanges({ workspaceId: id, rootPath });
  }

  async getGitReview(
    workspaceId: string,
    input?: { scope?: "changed" | "staged" },
  ): Promise<DesktopGitReviewResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return listRuntimeWorkspaceGitReview({ workspaceId: id, rootPath, scope: input?.scope });
  }

  async getGitReviewDetail(
    workspaceId: string,
    input: DesktopGitReviewDetailQuery,
  ): Promise<DesktopGitReviewDetailResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return getRuntimeWorkspaceGitReviewDetail({
      workspaceId: id,
      rootPath,
      path: input.path,
      scope: input.scope,
      baseRef: input.baseRef,
      headRef: input.headRef,
    });
  }

  async compareGitRefs(
    workspaceId: string,
    input: DesktopGitCompareQuery,
  ): Promise<DesktopGitCompareResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return compareRuntimeWorkspaceGitRefs({
      workspaceId: id,
      rootPath,
      baseRef: input.baseRef,
      headRef: input.headRef,
    });
  }

  async getGitBranches(workspaceId: string): Promise<DesktopGitBranchesResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return listRuntimeWorkspaceGitBranches({ workspaceId: id, rootPath });
  }

  async getGitStashes(workspaceId: string): Promise<DesktopGitStashesResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return listRuntimeWorkspaceGitStashes({ workspaceId: id, rootPath });
  }

  async getGitHistory(
    workspaceId: string,
    input?: DesktopGitHistoryQuery,
  ): Promise<DesktopGitHistoryResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return listRuntimeWorkspaceGitHistory({
      workspaceId: id,
      rootPath,
      limit: input?.limit,
      offset: input?.offset,
      ref: input?.ref,
      refs: input?.refs,
      includeStats: input?.includeStats,
      scope: input?.scope,
    });
  }

  async getGitHistoryDetail(
    workspaceId: string,
    hash: string,
  ): Promise<DesktopGitHistoryDetailResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return getRuntimeWorkspaceGitHistoryDetail({ workspaceId: id, rootPath, hash });
  }

  async getGitModuleSnapshot(
    workspaceId: string,
    input?: DesktopGitModuleSnapshotQuery,
  ): Promise<DesktopGitModuleSnapshotResult> {
    const [changes, branches, stashes, history] = await Promise.all([
      this.getGitChanges(workspaceId),
      this.getGitBranches(workspaceId),
      this.getGitStashes(workspaceId),
      this.getGitHistory(workspaceId, {
        limit: input?.historyLimit,
        includeStats: false,
      }),
    ]);

    return {
      workspaceId: changes.workspaceId,
      rootPath: changes.rootPath || branches.rootPath || stashes.rootPath || history.rootPath,
      isGitRepo: changes.isGitRepo || branches.isGitRepo || stashes.isGitRepo || history.isGitRepo,
      fetchedAt: nowIso(),
      historyLimit:
        typeof input?.historyLimit === "number" && Number.isFinite(input.historyLimit)
          ? Math.max(1, Math.trunc(input.historyLimit))
          : history.items.length,
      changes,
      branches,
      stashes,
      history,
    };
  }

  async getGitHunks(
    workspaceId: string,
    input: DesktopGitHunksQuery,
  ): Promise<DesktopGitHunksResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return listRuntimeWorkspaceGitHunks({
      workspaceId: id,
      rootPath,
      path: input.path,
      section: input.section,
    });
  }

  async generateGitCommitMessage(
    workspaceId: string,
    input?: DesktopGitCommitMessageSuggestionsQuery,
  ): Promise<DesktopGitCommitMessageSuggestionsResult> {
    const changes = await this.getGitChanges(workspaceId);
    if (!changes.isGitRepo) {
      throw new DesktopGitError("INVALID_ARGUMENT", "workspace is not a git repository", {
        workspaceId,
      });
    }

    const scoped = pickGitCommitScope({
      changes,
      requestedScope: input?.scope,
    });
    if (scoped.items.length === 0) {
      throw new DesktopGitError(
        "INVALID_ARGUMENT",
        "no git changes available for commit message generation",
        {
          workspaceId,
          scope: scoped.scope,
        },
      );
    }

    const requestedChannelId = input?.channelId?.trim() || undefined;
    const requestedModelId = input?.modelId?.trim() || undefined;
    const heuristicSuggestions = buildHeuristicGitCommitSuggestions(scoped.items);
    const preferredScope = extractPreferredCommitScope(heuristicSuggestions);
    void preferredScope;

    return {
      workspaceId: changes.workspaceId,
      strategy: "heuristic",
      scope: scoped.scope,
      summary: buildCommitMessageBaseSummary({
        changes,
        scope: scoped.scope,
        items: scoped.items,
      }),
      suggestions: heuristicSuggestions,
      resolvedChannelId: requestedChannelId,
      resolvedModelId: requestedModelId,
      failureReason: "desktop Git currently uses heuristic commit suggestions",
    };
  }

  async saveGitIgnore(
    workspaceId: string,
    input: DesktopGitSaveIgnoreInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    const absolutePath = resolve(rootPath, ".gitignore");
    try {
      await fs.writeFile(absolutePath, input.content, "utf-8");
      return {
        workspaceId: id,
        rootPath,
        ok: true,
        message: "Saved .gitignore",
      };
    } catch (error) {
      throw new DesktopGitError("IO_ERROR", "failed to save .gitignore", {
        workspaceId: id,
        path: ".gitignore",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async initGitRepository(workspaceId: string): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return initRuntimeWorkspaceGitRepository({ workspaceId: id, rootPath });
  }

  async stageGitChanges(
    workspaceId: string,
    input: DesktopGitStageChangesInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return stageRuntimeWorkspaceGitChanges({
      workspaceId: id,
      rootPath,
      all: input.all,
      paths: input.paths,
    });
  }

  async unstageGitChanges(
    workspaceId: string,
    input: DesktopGitUnstageChangesInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return unstageRuntimeWorkspaceGitChanges({
      workspaceId: id,
      rootPath,
      all: input.all,
      paths: input.paths,
    });
  }

  async discardGitChanges(
    workspaceId: string,
    input: DesktopGitDiscardChangesInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return discardRuntimeWorkspaceGitChanges({
      workspaceId: id,
      rootPath,
      all: input.all,
      paths: input.paths,
    });
  }

  async commitGitChanges(
    workspaceId: string,
    input: DesktopGitCommitChangesInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return commitRuntimeWorkspaceGitChanges({
      workspaceId: id,
      rootPath,
      message: input.message,
      amend: input.amend,
      stageAll: input.stageAll,
    });
  }

  async createGitStash(
    workspaceId: string,
    input?: DesktopGitCreateStashInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return createRuntimeWorkspaceGitStash({
      workspaceId: id,
      rootPath,
      message: input?.message,
      includeUntracked: input?.includeUntracked,
    });
  }

  async applyGitStash(
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return applyRuntimeWorkspaceGitStash({ workspaceId: id, rootPath, ref: input.ref });
  }

  async popGitStash(
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return popRuntimeWorkspaceGitStash({ workspaceId: id, rootPath, ref: input.ref });
  }

  async dropGitStash(
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return dropRuntimeWorkspaceGitStash({ workspaceId: id, rootPath, ref: input.ref });
  }

  async createGitBranch(
    workspaceId: string,
    input: DesktopGitCreateBranchInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return createRuntimeWorkspaceGitBranch({
      workspaceId: id,
      rootPath,
      name: input.name,
      startPoint: input.startPoint,
      checkout: input.checkout,
    });
  }

  async createGitTag(
    workspaceId: string,
    input: DesktopGitCreateTagInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return createRuntimeWorkspaceGitTag({
      workspaceId: id,
      rootPath,
      name: input.name,
      message: input.message,
      ref: input.ref,
      push: input.push,
    });
  }

  async checkoutGitBranch(
    workspaceId: string,
    input: DesktopGitCheckoutBranchInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return checkoutRuntimeWorkspaceGitBranch({
      workspaceId: id,
      rootPath,
      name: input.name,
      detach: input.detach,
    });
  }

  async mergeGitBranchIntoCurrent(
    workspaceId: string,
    input: DesktopGitBranchNameInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return mergeRuntimeWorkspaceGitBranchIntoCurrent({
      workspaceId: id,
      rootPath,
      name: input.name,
    });
  }

  async rebaseCurrentGitBranch(
    workspaceId: string,
    input: DesktopGitBranchNameInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return rebaseRuntimeWorkspaceCurrentGitBranch({
      workspaceId: id,
      rootPath,
      name: input.name,
    });
  }

  async renameGitBranch(
    workspaceId: string,
    input: DesktopGitRenameBranchInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return renameRuntimeWorkspaceGitBranch({
      workspaceId: id,
      rootPath,
      name: input.name,
      nextName: input.nextName,
    });
  }

  async deleteGitBranch(
    workspaceId: string,
    input: DesktopGitDeleteBranchInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return deleteRuntimeWorkspaceGitBranch({
      workspaceId: id,
      rootPath,
      name: input.name,
      force: input.force,
    });
  }

  async fetchGitRemote(workspaceId: string): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return fetchRuntimeWorkspaceGitRemote({ workspaceId: id, rootPath });
  }

  async pullGitRemote(workspaceId: string): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return pullRuntimeWorkspaceGitRemote({ workspaceId: id, rootPath });
  }

  async pushGitRemote(
    workspaceId: string,
    input?: DesktopGitPushRemoteInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return pushRuntimeWorkspaceGitRemote({
      workspaceId: id,
      rootPath,
      setUpstream: input?.setUpstream,
    });
  }

  async revertGitCommit(
    workspaceId: string,
    input: DesktopGitCommitHashInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return revertRuntimeWorkspaceGitCommit({ workspaceId: id, rootPath, hash: input.hash });
  }

  async cherryPickGitCommit(
    workspaceId: string,
    input: DesktopGitCommitHashInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return cherryPickRuntimeWorkspaceGitCommit({ workspaceId: id, rootPath, hash: input.hash });
  }

  async resetGitCommit(
    workspaceId: string,
    input: DesktopGitResetCommitInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return resetRuntimeWorkspaceGitCommit({
      workspaceId: id,
      rootPath,
      hash: input.hash,
      mode: input.mode,
    });
  }

  async stageGitHunks(
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return stageRuntimeWorkspaceGitHunks({
      workspaceId: id,
      rootPath,
      path: input.path,
      hunkIndices: input.hunkIndices,
    });
  }

  async unstageGitHunks(
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return unstageRuntimeWorkspaceGitHunks({
      workspaceId: id,
      rootPath,
      path: input.path,
      hunkIndices: input.hunkIndices,
    });
  }

  async discardGitHunks(
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    return discardRuntimeWorkspaceGitHunks({
      workspaceId: id,
      rootPath,
      path: input.path,
      hunkIndices: input.hunkIndices,
    });
  }

  private async resolveWorkspaceRoot(workspaceId: string): Promise<{ workspaceId: string; rootPath: string }> {
    const id = normalizeWorkspaceId(workspaceId);
    const item = await this.workspaceQuery.get(id);
    if (!item?.directoryPath) {
      throw new DesktopGitError("NOT_FOUND", "workspace not found", { workspaceId: id });
    }
    return { workspaceId: id, rootPath: item.directoryPath };
  }

  private async notImplemented(
    workspaceId: string,
    action: string,
  ): Promise<DesktopGitOperationResult> {
    const { workspaceId: id, rootPath } = await this.resolveWorkspaceRoot(workspaceId);
    await this.logger.warn("Desktop Git mutation not implemented", {
      workspaceId: id,
      context: { action },
    });
    throw new DesktopGitError("NOT_IMPLEMENTED", `Desktop Git action is not implemented yet: ${action}`, {
      workspaceId: id,
      rootPath,
      action,
    });
  }
}
