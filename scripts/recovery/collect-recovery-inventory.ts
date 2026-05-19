import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import {
  LAYER_A_ROOT,
  LAYER_B_ROOT,
  TARGET_ROOT,
  RECOVERY_DATE,
  classifyModuleBucket,
  isDocsPath,
  normalizeRepoPath,
  resolveRecoveryOutputPath,
} from "./recovery-paths";

const execFileAsync = promisify(execFile);

export type GitStatusKind = "modified" | "deleted" | "untracked";

export type GitStatusEntry = {
  code: string;
  kind: GitStatusKind;
  module: string;
  path: string;
};

export const KNOWN_THINKING_EVIDENCE = [
  {
    objectId: "220329d065802b2e527ec55c874c061fbc30c73c",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx",
    signal: "settings panel toggle labels and workspaceSettings.thinkingEnabled !== false",
  },
  {
    objectId: "b09a82412cb6804f90ae2a1965d861d8b070fb49",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts",
    signal: "workspace settings storage variant with thinkingEnabled",
  },
  {
    objectId: "5de30339d2b0609b5438698423a785961a905e4f",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts",
    signal: "newer workspace settings storage variant with thinkingEnabled",
  },
  {
    objectId: "1410904f1a8dbbe4e941a7223b84014ed751d59b",
    targetHint: "apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts",
    signal: "DesktopConversationSessionSettings.thinkingEnabled",
  },
  {
    objectId: "c010498ad69f7e3be1bc01a6a1f1b2f75d5604b3",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.test.ts",
    signal: "buildConversationSessionDefaultMetadata test with thinkingEnabled: true",
  },
  {
    objectId: "1900ab8414aa18853825ee95bb0bfffb4710d4e0",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.test.ts",
    signal: "newer buildConversationSessionDefaultMetadata test with thinkingEnabled: true",
  },
  {
    objectId: "0f048928ed0943c701142e714f41a5fbbb93bc7a",
    targetHint: "apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts",
    signal: "applyConversationThinkingPreferenceToServiceConfig",
  },
  {
    objectId: "5b0a0b9fba7a1cec58ad7c21fa604d5274951aaf",
    targetHint: "apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts",
    signal: "conversation service variant carrying thinkingEnabled in session settings",
  },
  {
    objectId: "348e82317a4d150abc689d2e24738f2f42112f03",
    targetHint: "apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts",
    signal: "newer conversation service variant carrying thinkingEnabled in session settings",
  },
  {
    objectId: "2422334588bb25dfbef6f1c56e1ada62cd0e62a4",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.test.ts",
    signal: "storage test with thinkingEnabled: true",
  },
  {
    objectId: "898f4a7fe253ec175eda4d8a7c6c0fde95ac70bd",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.test.ts",
    signal: "newer storage test with thinkingEnabled: true",
  },
  {
    objectId: "04aba9afa4baf6814021c6806e2e74153e26165d",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts",
    signal: "helper metadata variant with thinkingEnabled",
  },
  {
    objectId: "5f6ea0e6050e5be3c7fce2d9fd57e90380c96f4b",
    targetHint: "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts",
    signal: "newer helper metadata variant with thinkingEnabled",
  },
] as const;

type ModuleSummaryItem = {
  modified: number;
  deleted: number;
  untracked: number;
  total: number;
};

function parseStatusKind(code: string): GitStatusKind {
  if (code === "??") {
    return "untracked";
  }

  if (code.includes("D")) {
    return "deleted";
  }

  return "modified";
}

export function parseGitStatusPorcelain(lines: readonly string[]): GitStatusEntry[] {
  return lines
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2);
      const repoPath = normalizeRepoPath(line.slice(3));
      return {
        code,
        kind: parseStatusKind(code),
        module: classifyModuleBucket(repoPath),
        path: repoPath,
      };
    });
}

export function summarizeModuleBuckets(entries: readonly GitStatusEntry[]) {
  return entries.reduce<Record<string, ModuleSummaryItem>>((summary, entry) => {
    const current = summary[entry.module] ?? {
      modified: 0,
      deleted: 0,
      untracked: 0,
      total: 0,
    };
    current[entry.kind] += 1;
    current.total += 1;
    summary[entry.module] = current;
    return summary;
  }, {});
}

async function execGit(root: string, args: string[]) {
  try {
    return await execFileAsync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 32,
      windowsHide: true,
    });
  } catch (error) {
    const withStreams = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: number;
    };
    if (typeof withStreams.stdout === "string") {
      return {
        stdout: withStreams.stdout,
        stderr: withStreams.stderr ?? "",
      };
    }
    throw error;
  }
}

async function gitLines(root: string, args: string[]) {
  const { stdout } = await execGit(root, args);
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

async function readHead(root: string) {
  const [branch] = await gitLines(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const [commit] = await gitLines(root, ["rev-parse", "--short", "HEAD"]);
  return { branch, commit };
}

function countPrefix(lines: readonly string[], prefix: string) {
  return lines.filter((line) => line.startsWith(prefix)).length;
}

export async function collectRecoveryInventory() {
  const [targetHead, layerAHead, layerBHead, statusLines, fsckLines, reflogLines] = await Promise.all([
    readHead(TARGET_ROOT),
    readHead(LAYER_A_ROOT),
    readHead(LAYER_B_ROOT),
    gitLines(LAYER_B_ROOT, ["status", "--porcelain=v1"]),
    gitLines(LAYER_B_ROOT, ["fsck", "--full", "--no-reflogs", "--unreachable", "--lost-found"]),
    gitLines(LAYER_B_ROOT, ["reflog", "--date=short", "--format=%gd %cd %gs"]),
  ]);

  const statusEntries = parseGitStatusPorcelain(statusLines);
  const modifiedEntries = statusEntries.filter((entry) => entry.kind === "modified");
  const deletedEntries = statusEntries.filter((entry) => entry.kind === "deleted");
  const untrackedEntries = statusEntries.filter((entry) => entry.kind === "untracked");

  return {
    generatedAt: new Date().toISOString(),
    recoveryDate: RECOVERY_DATE,
    sources: {
      target: {
        root: TARGET_ROOT,
        ...targetHead,
      },
      layerA: {
        root: LAYER_A_ROOT,
        ...layerAHead,
      },
      layerB: {
        root: LAYER_B_ROOT,
        ...layerBHead,
      },
    },
    layerB: {
      statusEntries,
      totals: {
        modified: modifiedEntries.length,
        deleted: deletedEntries.length,
        untracked: untrackedEntries.length,
        total: statusEntries.length,
      },
      moduleSummary: summarizeModuleBuckets(statusEntries),
      deletedNonDocsPaths: deletedEntries
        .map((entry) => entry.path)
        .filter((repoPath) => !isDocsPath(repoPath)),
      untrackedPaths: untrackedEntries.map((entry) => entry.path),
    },
    layerC: {
      unreachableBlobCount: countPrefix(fsckLines, "unreachable blob "),
      unreachableTreeCount: countPrefix(fsckLines, "unreachable tree "),
      danglingCommitCount: countPrefix(fsckLines, "dangling commit "),
      danglingTreeCount: countPrefix(fsckLines, "dangling tree "),
      reflogCount: reflogLines.length,
      latestReflogEntry: reflogLines[0] ?? "",
      earliestReflogEntry: reflogLines.at(-1) ?? "",
      thinkingEvidence: KNOWN_THINKING_EVIDENCE,
    },
  };
}

if (import.meta.main) {
  const inventory = await collectRecoveryInventory();

  await mkdir(resolveRecoveryOutputPath("batches"), { recursive: true });
  await mkdir(resolveRecoveryOutputPath("reports"), { recursive: true });

  await writeFile(
    resolveRecoveryOutputPath("inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    resolveRecoveryOutputPath("source-heads.json"),
    `${JSON.stringify(inventory.sources, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    resolveRecoveryOutputPath("layer-c-thinking-evidence.json"),
    `${JSON.stringify(inventory.layerC.thinkingEvidence, null, 2)}\n`,
    "utf8",
  );

  console.log(`Recovery inventory written to ${resolveRecoveryOutputPath("inventory.json")}`);
}
