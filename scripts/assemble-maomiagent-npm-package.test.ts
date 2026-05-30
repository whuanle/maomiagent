import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assembleMaomiAgentNpmPackage } from "./assemble-maomiagent-npm-package.mjs";

let tempRoot = "";

afterEach(async () => {
  if (!tempRoot) {
    return;
  }

  await rm(tempRoot, { recursive: true, force: true });
  tempRoot = "";
});

describe("assembleMaomiAgentNpmPackage", () => {
  test("copies each platform archive into runtime-bundles with stable internal names", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-npm-assemble-"));

    const artifactRoot = path.join(tempRoot, "artifacts");
    const packageRoot = path.join(tempRoot, "package");
    const runtimeBundleRoot = path.join(packageRoot, "runtime-bundles");

    await mkdir(artifactRoot, { recursive: true });
    await mkdir(runtimeBundleRoot, { recursive: true });
    await writeFile(path.join(runtimeBundleRoot, "stale.txt"), "stale", "utf8");
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "maomiagent",
        version: "0.0.0-dev",
      }, null, 2),
      "utf8",
    );

    await writeFile(path.join(artifactRoot, "win-x64.zip"), "windows", "utf8");
    await writeFile(path.join(artifactRoot, "linux-x64.zip"), "linux", "utf8");
    await writeFile(path.join(artifactRoot, "macos-arm64-app.zip"), "macos-arm64", "utf8");
    await writeFile(path.join(artifactRoot, "macos-x64-app.zip"), "macos-x64", "utf8");

    await assembleMaomiAgentNpmPackage({
      artifactRoot,
      packageRoot,
      version: "1.2.3",
    });

    expect(await readFile(path.join(runtimeBundleRoot, "win-x64.zip"), "utf8")).toBe("windows");
    expect(await readFile(path.join(runtimeBundleRoot, "linux-x64.zip"), "utf8")).toBe("linux");
    expect(await readFile(path.join(runtimeBundleRoot, "macos-arm64-app.zip"), "utf8")).toBe(
      "macos-arm64",
    );
    expect(await readFile(path.join(runtimeBundleRoot, "macos-x64-app.zip"), "utf8")).toBe(
      "macos-x64",
    );
  });

  test("updates package version during assembly", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-npm-assemble-"));

    const artifactRoot = path.join(tempRoot, "artifacts");
    const packageRoot = path.join(tempRoot, "package");

    await mkdir(artifactRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(artifactRoot, "win-x64.zip"), "windows", "utf8");
    await writeFile(path.join(artifactRoot, "linux-x64.zip"), "linux", "utf8");
    await writeFile(path.join(artifactRoot, "macos-arm64-app.zip"), "macos-arm64", "utf8");
    await writeFile(path.join(artifactRoot, "macos-x64-app.zip"), "macos-x64", "utf8");
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "maomiagent",
        version: "0.0.0-dev",
      }, null, 2),
      "utf8",
    );

    await assembleMaomiAgentNpmPackage({
      artifactRoot,
      packageRoot,
      version: "2.4.6",
    });

    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    expect(packageJson.version).toBe("2.4.6");
  });
});
