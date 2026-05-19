import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  LAYER_A_ROOT,
  LAYER_B_ROOT,
  TARGET_ROOT,
  normalizeRepoPath,
  resolveRecoveryOutputPath,
} from "./recovery-paths";
import type { RecoveryManifest } from "./build-recovery-batch-map";

export type CopyManifestEntry = {
  targetPath: string;
  sourceLayer: "layerA" | "layerB";
  sourcePath: string;
};

export type CopyManifest = Pick<RecoveryManifest, "id" | "mode"> & {
  entries: CopyManifestEntry[];
};

type ApplyManifestInput = {
  manifest: CopyManifest;
  roots: {
    target: string;
    layerA: string;
    layerB: string;
    reportRoot: string;
  };
  apply: boolean;
};

function resolveRootedPath(root: string, repoPath: string) {
  return path.resolve(root, normalizeRepoPath(repoPath));
}

async function ensureParentDir(filePath: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(sourcePath: string, destinationPath: string) {
  await ensureParentDir(destinationPath);
  await copyFile(sourcePath, destinationPath);
}

export async function applyManifestToRoots(input: ApplyManifestInput) {
  const operations: Array<{
    targetPath: string;
    sourceLayer: "layerA" | "layerB";
    sourcePath: string;
    applied: boolean;
    backedUp: boolean;
    targetPreviouslyExisted: boolean;
  }> = [];

  for (const entry of input.manifest.entries) {
    const targetPath = resolveRootedPath(input.roots.target, entry.targetPath);
    const sourceRoot = entry.sourceLayer === "layerA" ? input.roots.layerA : input.roots.layerB;
    const sourcePath = resolveRootedPath(sourceRoot, entry.sourcePath);
    const backupPath = resolveRootedPath(
      path.resolve(input.roots.reportRoot, "backups", input.manifest.id),
      entry.targetPath,
    );
    const targetPreviouslyExisted = await pathExists(targetPath);

    if (input.apply && targetPreviouslyExisted) {
      await copyIfPresent(targetPath, backupPath);
    }

    if (input.apply) {
      await copyIfPresent(sourcePath, targetPath);
    }

    operations.push({
      targetPath: entry.targetPath,
      sourceLayer: entry.sourceLayer,
      sourcePath: entry.sourcePath,
      applied: input.apply,
      backedUp: input.apply && targetPreviouslyExisted,
      targetPreviouslyExisted,
    });
  }

  const reportPath = path.resolve(input.roots.reportRoot, `${input.manifest.id}.json`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify({
      batchId: input.manifest.id,
      dryRun: !input.apply,
      operations,
    }, null, 2)}\n`,
    "utf8",
  );

  return reportPath;
}

async function readManifestFromCli() {
  const batchFlagIndex = process.argv.findIndex((value) => value === "--batch");
  if (batchFlagIndex < 0 || !process.argv[batchFlagIndex + 1]) {
    throw new Error("Usage: bun scripts/recovery/apply-recovery-batch.ts --batch <manifest-path> [--apply]");
  }

  const manifestPath = path.resolve(process.argv[batchFlagIndex + 1]);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CopyManifest;
  if (manifest.mode !== "copy") {
    throw new Error(`Batch ${manifest.id} is ${manifest.mode}; only copy manifests can be applied by this script.`);
  }

  return { manifestPath, manifest };
}

if (import.meta.main) {
  const { manifestPath, manifest } = await readManifestFromCli();
  const reportPath = await applyManifestToRoots({
    manifest,
    roots: {
      target: TARGET_ROOT,
      layerA: LAYER_A_ROOT,
      layerB: LAYER_B_ROOT,
      reportRoot: resolveRecoveryOutputPath("reports"),
    },
    apply: process.argv.includes("--apply"),
  });

  console.log(`Applied ${manifest.id} from ${manifestPath} -> ${reportPath}`);
}
