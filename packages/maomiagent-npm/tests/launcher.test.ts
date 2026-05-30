import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { launchGui } from "../lib/launch-gui.js";
import { resolveRuntimeBundleName, resolveTargetPlatform } from "../lib/platform.js";

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
