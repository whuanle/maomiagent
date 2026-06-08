import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import {
  resolveLaunchPath,
  resolveRuntimeBundleName,
  resolveRuntimePackageName,
  resolveTargetPlatform,
} from "./platform.js";

let extractRuntimeLoader;

async function loadExtractRuntime() {
  if (!extractRuntimeLoader) {
    extractRuntimeLoader = import("extract-zip").then((module) => module.default);
  }

  return extractRuntimeLoader;
}

function resolveRuntimePackageJsonPath(packageRoot, runtimePackageName) {
  const packageRequire = createRequire(path.join(packageRoot, "package.json"));
  return packageRequire.resolve(`${runtimePackageName}/package.json`);
}

function createMissingRuntimeBundleError(target, runtimePackageName, bundleName) {
  return new Error(
    `Missing runtime bundle ${bundleName} from optional dependency ${runtimePackageName} `
      + `for ${target.os}-${target.arch}. Reinstall maomiagent on a supported platform.`,
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

function resolveInstalledRuntimeBundle(packageRoot, target, options = {}) {
  const bundleName = resolveRuntimeBundleName(target);
  const runtimePackageName = resolveRuntimePackageName(target);

  try {
    const runtimePackageJsonPath = (options.resolveRuntimePackageJsonPath
      ?? ((requestedPackageName) => resolveRuntimePackageJsonPath(packageRoot, requestedPackageName)))(
      runtimePackageName,
    );
    const runtimePackageRoot = path.dirname(runtimePackageJsonPath);

    return {
      bundleName,
      runtimePackageName,
      bundlePath: path.join(runtimePackageRoot, "runtime-bundles", bundleName),
    };
  } catch {
    return {
      bundleName,
      runtimePackageName,
      bundlePath: null,
    };
  }
}

export async function validateRuntimeBundles(packageRoot, options = {}) {
  const target = options.target ?? resolveTargetPlatform();
  const runtimeBundle = resolveInstalledRuntimeBundle(packageRoot, target, options);

  if (!runtimeBundle.bundlePath || !existsSync(runtimeBundle.bundlePath)) {
    throw createMissingRuntimeBundleError(
      target,
      runtimeBundle.runtimePackageName,
      runtimeBundle.bundleName,
    );
  }

  return [runtimeBundle.bundlePath];
}

export async function ensureRuntimeExtracted(packageRoot, options = {}) {
  const target = options.target ?? resolveTargetPlatform();
  const packageVersion = options.packageVersion ?? await readPackageVersion(packageRoot);
  const runtimeRoot = path.join(packageRoot, "runtime", "active", `${target.os}-${target.arch}`);
  const markerPath = path.join(runtimeRoot, ".installed.json");
  const launchPath = resolveLaunchPath(runtimeRoot, target);
  const runtimeBundle = resolveInstalledRuntimeBundle(packageRoot, target, options);
  const expectedMarker = {
    bundleName: runtimeBundle.bundleName,
    packageVersion,
    target,
  };

  if (existsSync(markerPath) && existsSync(launchPath)) {
    const marker = await readInstalledMarker(markerPath);

    if (isReusableInstalledMarker(marker, expectedMarker)) {
      return { runtimeRoot, target };
    }
  }

  await validateRuntimeBundles(packageRoot, {
    target,
    resolveRuntimePackageJsonPath: options.resolveRuntimePackageJsonPath,
  });
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });

  const extractRuntime = options.extractRuntime ?? await loadExtractRuntime();
  await extractRuntime(runtimeBundle.bundlePath, { dir: runtimeRoot });
  await writeFile(
    markerPath,
    `${JSON.stringify({
      bundleName: runtimeBundle.bundleName,
      installedAt: new Date().toISOString(),
      packageVersion,
      target,
    }, null, 2)}\n`,
    "utf8",
  );

  const marker = await readInstalledMarker(markerPath);
  if (!isReusableInstalledMarker(marker, expectedMarker) || !existsSync(launchPath)) {
    throw new Error(`Extracted runtime is incomplete for ${runtimeBundle.bundleName}.`);
  }

  return { runtimeRoot, target };
}
