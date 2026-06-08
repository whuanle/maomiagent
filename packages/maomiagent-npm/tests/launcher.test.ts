import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ensureRuntimeExtracted,
  validateRuntimeBundles,
} from "../lib/extract-runtime.js";
import { launchGui } from "../lib/launch-gui.js";
import {
  resolveLaunchPath,
  resolveRuntimeBundleName,
  resolveRuntimePackageName,
  resolveTargetPlatform,
} from "../lib/platform.js";

let tempRoot = "";

afterEach(async () => {
  if (!tempRoot) {
    return;
  }

  await rm(tempRoot, { recursive: true, force: true });
  tempRoot = "";
});

describe("resolveTargetPlatform", () => {
  test("maps win32/x64 to win/x64", () => {
    expect(resolveTargetPlatform("win32", "x64")).toEqual({
      os: "win",
      arch: "x64",
    });
  });

  test("maps linux/x64 to linux/x64", () => {
    expect(resolveTargetPlatform("linux", "x64")).toEqual({
      os: "linux",
      arch: "x64",
    });
  });

  test("maps darwin/arm64 to macos/arm64", () => {
    expect(resolveTargetPlatform("darwin", "arm64")).toEqual({
      os: "macos",
      arch: "arm64",
    });
  });

  test("maps darwin/x64 to macos/x64", () => {
    expect(resolveTargetPlatform("darwin", "x64")).toEqual({
      os: "macos",
      arch: "x64",
    });
  });
});

describe("resolveRuntimeBundleName", () => {
  test("maps macOS arm64 to macos-arm64-app.zip", () => {
    expect(
      resolveRuntimeBundleName({
        os: "macos",
        arch: "arm64",
      }),
    ).toBe("macos-arm64-app.zip");
  });
});

describe("resolveRuntimePackageName", () => {
  test("maps macOS arm64 to maomiagent-runtime-macos-arm64", () => {
    expect(
      resolveRuntimePackageName({
        os: "macos",
        arch: "arm64",
      }),
    ).toBe("maomiagent-runtime-macos-arm64");
  });
});

describe("launchGui", () => {
  test("prints the launch path and skips spawning during dry runs", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-launcher-"));
    const runtimeRoot = path.join(tempRoot, "runtime");
    const launchPath = path.join(runtimeRoot, "MaomiAgent", "bin", "launcher");

    await mkdir(path.dirname(launchPath), { recursive: true });
    await writeFile(launchPath, "#!/usr/bin/env sh\n", "utf8");

    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await launchGui({
      runtimeRoot,
      target: {
        os: "linux",
        arch: "x64",
      },
      dryRun: true,
    });

    expect(result).toEqual({
      didLaunch: false,
      launchPath,
    });
    expect(consoleSpy).toHaveBeenCalledWith(launchPath);
  });
});

describe("ensureRuntimeExtracted", () => {
  test("fails clearly when the optional runtime package is missing", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-runtime-bundles-"));

    await writeFile(
      path.join(tempRoot, "package.json"),
      JSON.stringify({
        name: "maomiagent",
        version: "1.0.0",
      }, null, 2),
      "utf8",
    );

    await expect(validateRuntimeBundles(tempRoot, {
      target: {
        os: "linux",
        arch: "x64",
      },
      resolveRuntimePackageJsonPath: () => {
        throw new Error("not installed");
      },
    })).rejects.toThrow(
      "Missing runtime bundle linux-x64.zip from optional dependency maomiagent-runtime-linux-x64 for linux-x64. Reinstall maomiagent on a supported platform.",
    );
  });

  test("extracts into runtime/active/<os>-<arch>, writes install metadata, reuses matching installs, and re-extracts on marker drift", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-runtime-"));

    const target = {
      os: "linux",
      arch: "x64",
    };
    const bundleName = resolveRuntimeBundleName(target);
    const runtimePackageRoot = path.join(
      tempRoot,
      "node_modules",
      resolveRuntimePackageName(target),
    );
    const bundlePath = path.join(runtimePackageRoot, "runtime-bundles", bundleName);
    const runtimeRoot = path.join(tempRoot, "runtime", "active", `${target.os}-${target.arch}`);
    const launchPath = resolveLaunchPath(runtimeRoot, target);
    const markerPath = path.join(runtimeRoot, ".installed.json");
    const packageJsonPath = path.join(tempRoot, "package.json");
    const runtimePackageJsonPath = path.join(runtimePackageRoot, "package.json");
    let extractCalls = 0;

    await mkdir(path.dirname(bundlePath), { recursive: true });
    await writeFile(
      runtimePackageJsonPath,
      JSON.stringify({
        name: resolveRuntimePackageName(target),
        version: "1.0.0",
      }, null, 2),
      "utf8",
    );
    await writeFile(
      packageJsonPath,
      JSON.stringify({
        name: "maomiagent",
        version: "1.0.0",
      }, null, 2),
      "utf8",
    );
    await writeFile(bundlePath, "bundle", "utf8");

    const extractRuntime = async (sourcePath, options) => {
      extractCalls += 1;
      expect(sourcePath).toBe(bundlePath);
      expect(options.dir).toBe(runtimeRoot);
      await mkdir(path.dirname(launchPath), { recursive: true });
      await writeFile(launchPath, "launcher", "utf8");
    };

    const firstInstall = await ensureRuntimeExtracted(tempRoot, {
      target,
      extractRuntime,
      resolveRuntimePackageJsonPath: () => runtimePackageJsonPath,
    });

    expect(firstInstall).toEqual({
      runtimeRoot,
      target,
    });
    expect(extractCalls).toBe(1);

    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    expect(marker.bundleName).toBe(bundleName);
    expect(marker.packageVersion).toBe("1.0.0");
    expect(marker.target).toEqual(target);

    const secondInstall = await ensureRuntimeExtracted(tempRoot, {
      target,
      extractRuntime,
      resolveRuntimePackageJsonPath: () => runtimePackageJsonPath,
    });

    expect(secondInstall).toEqual({
      runtimeRoot,
      target,
    });
    expect(extractCalls).toBe(1);

    await writeFile(
      packageJsonPath,
      JSON.stringify({
        name: "maomiagent",
        version: "2.0.0",
      }, null, 2),
      "utf8",
    );

    const thirdInstall = await ensureRuntimeExtracted(tempRoot, {
      target,
      extractRuntime,
      resolveRuntimePackageJsonPath: () => runtimePackageJsonPath,
    });

    expect(thirdInstall).toEqual({
      runtimeRoot,
      target,
    });
    expect(extractCalls).toBe(2);

    await writeFile(markerPath, "{not-json", "utf8");

    const fourthInstall = await ensureRuntimeExtracted(tempRoot, {
      target,
      extractRuntime,
      resolveRuntimePackageJsonPath: () => runtimePackageJsonPath,
    });

    expect(fourthInstall).toEqual({
      runtimeRoot,
      target,
    });
    expect(extractCalls).toBe(3);
  });
});
