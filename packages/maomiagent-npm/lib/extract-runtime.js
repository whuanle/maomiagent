import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  resolveLaunchPath,
  resolveRuntimeBundleName,
  resolveTargetPlatform,
} from "./platform.js";

let extractRuntimeLoader;

async function loadExtractRuntime() {
  if (!extractRuntimeLoader) {
    extractRuntimeLoader = import("extract-zip").then((module) => module.default);
  }

  return extractRuntimeLoader;
}

export async function ensureRuntimeExtracted(packageRoot, options = {}) {
  const target = options.target ?? resolveTargetPlatform();
  const bundleName = resolveRuntimeBundleName(target);
  const runtimeRoot = path.join(packageRoot, "runtime", "active", `${target.os}-${target.arch}`);
  const bundlePath = path.join(packageRoot, "runtime-bundles", bundleName);
  const markerPath = path.join(runtimeRoot, ".installed.json");
  const launchPath = resolveLaunchPath(runtimeRoot, target);

  if (existsSync(markerPath) && existsSync(launchPath)) {
    return { runtimeRoot, target };
  }

  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });

  const extractRuntime = options.extractRuntime ?? await loadExtractRuntime();
  await extractRuntime(bundlePath, { dir: runtimeRoot });
  await writeFile(
    markerPath,
    `${JSON.stringify({
      bundleName,
      installedAt: new Date().toISOString(),
      target,
    }, null, 2)}\n`,
    "utf8",
  );

  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (marker.bundleName !== bundleName || !existsSync(launchPath)) {
    throw new Error(`Extracted runtime is incomplete for ${bundleName}.`);
  }

  return { runtimeRoot, target };
}
