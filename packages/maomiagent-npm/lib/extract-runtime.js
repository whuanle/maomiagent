import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  resolveLaunchPath,
  resolveRuntimeBundleName,
  resolveTargetPlatform,
} from "./platform.js";

export const REQUIRED_RUNTIME_BUNDLE_NAMES = [
  "win-x64.zip",
  "linux-x64.zip",
  "macos-arm64-app.zip",
  "macos-x64-app.zip",
];

let extractRuntimeLoader;

async function loadExtractRuntime() {
  if (!extractRuntimeLoader) {
    extractRuntimeLoader = import("extract-zip").then((module) => module.default);
  }

  return extractRuntimeLoader;
}

function resolveRuntimeBundlePath(packageRoot, bundleName) {
  return path.join(packageRoot, "runtime-bundles", bundleName);
}

function createMissingRuntimeBundlesError(missingBundleNames) {
  return new Error(
    `Missing runtime bundles: ${missingBundleNames.join(", ")}. `
      + "The maomiagent package must be assembled before packing or publishing.",
  );
}

async function readPackageVersion(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  return packageJson.version;
}

async function readInstalledMarker(markerPath) {
  try {
    return JSON.parse(await readFile(markerPath, "utf8"));
  } catch {
    return null;
  }
}

function matchesTarget(actualTarget, expectedTarget) {
  return actualTarget?.os === expectedTarget.os && actualTarget?.arch === expectedTarget.arch;
}

function isReusableInstalledMarker(marker, expectedMarker) {
  return marker?.bundleName === expectedMarker.bundleName
    && marker?.packageVersion === expectedMarker.packageVersion
    && matchesTarget(marker?.target, expectedMarker.target);
}

export async function validateRuntimeBundles(packageRoot, options = {}) {
  const bundleNames = options.target
    ? [resolveRuntimeBundleName(options.target)]
    : REQUIRED_RUNTIME_BUNDLE_NAMES;
  const missingBundleNames = bundleNames.filter(
    (bundleName) => !existsSync(resolveRuntimeBundlePath(packageRoot, bundleName)),
  );

  if (missingBundleNames.length > 0) {
    throw createMissingRuntimeBundlesError(missingBundleNames);
  }

  return bundleNames.map((bundleName) => resolveRuntimeBundlePath(packageRoot, bundleName));
}

export async function ensureRuntimeExtracted(packageRoot, options = {}) {
  const target = options.target ?? resolveTargetPlatform();
  const packageVersion = options.packageVersion ?? await readPackageVersion(packageRoot);
  const bundleName = resolveRuntimeBundleName(target);
  const runtimeRoot = path.join(packageRoot, "runtime", "active", `${target.os}-${target.arch}`);
  const bundlePath = resolveRuntimeBundlePath(packageRoot, bundleName);
  const markerPath = path.join(runtimeRoot, ".installed.json");
  const launchPath = resolveLaunchPath(runtimeRoot, target);
  const expectedMarker = {
    bundleName,
    packageVersion,
    target,
  };

  if (existsSync(markerPath) && existsSync(launchPath)) {
    const marker = await readInstalledMarker(markerPath);

    if (isReusableInstalledMarker(marker, expectedMarker)) {
      return { runtimeRoot, target };
    }
  }

  await validateRuntimeBundles(packageRoot, { target });
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });

  const extractRuntime = options.extractRuntime ?? await loadExtractRuntime();
  await extractRuntime(bundlePath, { dir: runtimeRoot });
  await writeFile(
    markerPath,
    `${JSON.stringify({
      bundleName,
      installedAt: new Date().toISOString(),
      packageVersion,
      target,
    }, null, 2)}\n`,
    "utf8",
  );

  const marker = await readInstalledMarker(markerPath);
  if (!isReusableInstalledMarker(marker, expectedMarker) || !existsSync(launchPath)) {
    throw new Error(`Extracted runtime is incomplete for ${bundleName}.`);
  }

  return { runtimeRoot, target };
}
