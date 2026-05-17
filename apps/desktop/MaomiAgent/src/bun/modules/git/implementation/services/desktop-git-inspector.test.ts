import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopGitError } from "./desktop-git-error";
import { createRuntimeWorkspaceGitTag } from "./desktop-git-inspector";

const tempDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempDirectories].map((directory) => rm(directory, { recursive: true, force: true })),
  );
  tempDirectories.clear();
});

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }

  return result.stdout.trim();
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.add(directory);
  return directory;
}

async function initializeRepository(options?: {
  withRemote?: boolean;
}): Promise<{ repoPath: string; remotePath?: string; initialCommitHash: string }> {
  const rootPath = await createTempDirectory("maomi-desktop-git-tag-");
  const repoPath = join(rootPath, "repo");
  runGit(rootPath, ["init", "-b", "main", repoPath]);
  runGit(repoPath, ["config", "user.name", "MaomiAgent"]);
  runGit(repoPath, ["config", "user.email", "maomi@example.com"]);

  await writeFile(join(repoPath, "README.md"), "# test\n", "utf8");
  runGit(repoPath, ["add", "README.md"]);
  runGit(repoPath, ["commit", "-m", "chore: initial commit"]);
  const initialCommitHash = runGit(repoPath, ["rev-parse", "HEAD"]);

  if (!options?.withRemote) {
    return { repoPath, initialCommitHash };
  }

  const remotePath = join(rootPath, "remote.git");
  runGit(rootPath, ["init", "--bare", remotePath]);
  runGit(repoPath, ["remote", "add", "origin", remotePath]);
  return { repoPath, remotePath, initialCommitHash };
}

async function createCommit(repoPath: string, fileName: string, content: string, message: string): Promise<string> {
  await writeFile(join(repoPath, fileName), content, "utf8");
  runGit(repoPath, ["add", fileName]);
  runGit(repoPath, ["commit", "-m", message]);
  return runGit(repoPath, ["rev-parse", "HEAD"]);
}

describe("createRuntimeWorkspaceGitTag", () => {
  test("creates an annotated tag without pushing when push is disabled", async () => {
    const repository = await initializeRepository();

    const result = await createRuntimeWorkspaceGitTag({
      workspaceId: "workspace-demo",
      rootPath: repository.repoPath,
      name: "v1.0.0",
      message: "release v1.0.0",
      push: false,
    });

    expect(result.message).toBe("已创建标签 v1.0.0");
    expect(result.commitHash).toBe(repository.initialCommitHash);
    expect(runGit(repository.repoPath, ["rev-list", "-n", "1", "refs/tags/v1.0.0"])).toBe(repository.initialCommitHash);
    expect(
      runGit(repository.repoPath, ["for-each-ref", "refs/tags/v1.0.0", "--format=%(contents)"]),
    ).toContain("release v1.0.0");
  });

  test("creates and pushes an annotated tag to the default remote", async () => {
    const repository = await initializeRepository({ withRemote: true });

    const result = await createRuntimeWorkspaceGitTag({
      workspaceId: "workspace-demo",
      rootPath: repository.repoPath,
      name: "v1.2.3",
      message: "release v1.2.3",
      push: true,
    });

    expect(result.message).toBe("已创建并推送标签 v1.2.3");
    expect(result.commitHash).toBe(repository.initialCommitHash);
    expect(
      runGit(repository.repoPath, ["--git-dir", repository.remotePath!, "rev-list", "-n", "1", "refs/tags/v1.2.3"]),
    ).toBe(repository.initialCommitHash);
  });

  test("rejects reusing an existing tag name for a different commit", async () => {
    const repository = await initializeRepository();
    runGit(repository.repoPath, ["tag", "-a", "v2.0.0", "-m", "release v2.0.0", repository.initialCommitHash]);
    const nextCommitHash = await createCommit(
      repository.repoPath,
      "CHANGELOG.md",
      "second commit\n",
      "docs: add release notes",
    );

    let thrown: unknown;
    try {
      await createRuntimeWorkspaceGitTag({
        workspaceId: "workspace-demo",
        rootPath: repository.repoPath,
        name: "v2.0.0",
        ref: nextCommitHash,
        push: false,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DesktopGitError);
    expect((thrown as DesktopGitError).code).toBe("INVALID_ARGUMENT");
    expect((thrown as DesktopGitError).message).toBe("tag already exists on another commit");
  });
});
