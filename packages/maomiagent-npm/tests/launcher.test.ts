import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureRuntimeExtracted } from "../lib/extract-runtime.js";
import { launchGui } from "../lib/launch-gui.js";
import {
  resolveLaunchPath,
  resolveRuntimeBundleName,
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
  test("extracts into runtime/active/<os>-<arch>, writes install metadata, and reuses existing installs", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-runtime-"));

    const target = resolveTargetPlatform();
    const bundleName = resolveRuntimeBundleName(target);
    const bundlePath = path.join(tempRoot, "runtime-bundles", bundleName);
    const runtimeRoot = path.join(tempRoot, "runtime", "active", `${target.os}-${target.arch}`);
    const launchPath = resolveLaunchPath(runtimeRoot, target);
    const markerPath = path.join(runtimeRoot, ".installed.json");
    let extractCalls = 0;

    await mkdir(path.dirname(bundlePath), { recursive: true });
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
    });

    expect(firstInstall).toEqual({
      runtimeRoot,
      target,
    });
    expect(extractCalls).toBe(1);

    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    expect(marker.bundleName).toBe(bundleName);
    expect(marker.target).toEqual(target);

    const secondInstall = await ensureRuntimeExtracted(tempRoot, {
      target,
      extractRuntime,
    });

    expect(secondInstall).toEqual({
      runtimeRoot,
      target,
    });
    expect(extractCalls).toBe(1);
  });
});
