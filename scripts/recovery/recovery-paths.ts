import path from "node:path";

export const RECOVERY_DATE = "2026-05-18";

export const TARGET_ROOT = path.resolve("e:/workspace/MaomiAgent");
export const LAYER_A_ROOT = path.resolve("G:/demo/a/MaomiAgent");
export const LAYER_B_ROOT = path.resolve("G:/demo/MaomiAgent");
export const RECOVERY_OUTPUT_ROOT = path.resolve(
  TARGET_ROOT,
  "docs/superpowers/recovery",
  RECOVERY_DATE,
);

export type RecoveryLayer = "target" | "layerA" | "layerB";

export function normalizeRepoPath(input: string): string {
  return input
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replace(/^\/+/u, "");
}

export function isDocsPath(repoPath: string): boolean {
  return normalizeRepoPath(repoPath).startsWith("docs/");
}

export function classifyModuleBucket(repoPath: string): string {
  const normalized = normalizeRepoPath(repoPath);

  const mainviewModuleMatch =
    /^apps\/desktop\/MaomiAgent\/src\/mainview\/modules\/([^/]+)\//u.exec(normalized);
  if (mainviewModuleMatch?.[1]) {
    return mainviewModuleMatch[1];
  }

  const bunModuleMatch =
    /^apps\/desktop\/MaomiAgent\/src\/bun\/modules\/([^/]+)\//u.exec(normalized);
  if (bunModuleMatch?.[1]) {
    return bunModuleMatch[1];
  }

  if (normalized.startsWith("apps/desktop/MaomiAgent/src/shared/")) {
    return "shared";
  }

  if (normalized.startsWith("apps/desktop/MaomiAgent/src/mainview/lib/")) {
    return "mainview-lib";
  }

  if (normalized.startsWith("apps/desktop/MaomiAgent/src/")) {
    return "desktop-other";
  }

  if (normalized.startsWith("docs/")) {
    return "docs";
  }

  return "other";
}

export function resolveLayerRoot(layer: RecoveryLayer): string {
  switch (layer) {
    case "target":
      return TARGET_ROOT;
    case "layerA":
      return LAYER_A_ROOT;
    case "layerB":
      return LAYER_B_ROOT;
  }
}

export function resolveLayerPath(layer: RecoveryLayer, repoPath: string): string {
  return path.resolve(resolveLayerRoot(layer), normalizeRepoPath(repoPath));
}

export function resolveRecoveryOutputPath(...segments: string[]): string {
  return path.resolve(
    RECOVERY_OUTPUT_ROOT,
    ...segments.map((segment) => normalizeRepoPath(segment)),
  );
}
