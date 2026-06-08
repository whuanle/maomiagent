import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assembleMaomiAgentNpmPackage } from "./assemble-maomiagent-npm-package.mjs";
import { RUNTIME_PACKAGE_LAYOUTS } from "../packages/maomiagent-npm/lib/runtime-package-metadata.js";

let tempRoot = "";

afterEach(async () => {
  if (!tempRoot) {
    return;
  }

  await rm(tempRoot, { recursive: true, force: true });
  tempRoot = "";
});

describe("assembleMaomiAgentNpmPackage", () => {
  test("copies each platform archive into its matching runtime package", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-npm-assemble-"));

    const artifactRoot = path.join(tempRoot, "artifacts");
    const packageRoot = path.join(tempRoot, "packages", "maomiagent-npm");
    const runtimePackageRoots = Object.fromEntries(
      RUNTIME_PACKAGE_LAYOUTS.map((layout) => [
        layout.packageName,
        path.join(tempRoot, "packages", layout.packageDirectoryName),
      ]),
    );

    await mkdir(artifactRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "maomiagent",
        version: "0.0.0-dev",
        optionalDependencies: Object.fromEntries(
          RUNTIME_PACKAGE_LAYOUTS.map((layout) => [layout.packageName, "0.0.0-dev"]),
        ),
      }, null, 2),
      "utf8",
    );

    for (const layout of RUNTIME_PACKAGE_LAYOUTS) {
      await mkdir(runtimePackageRoots[layout.packageName], { recursive: true });
      await mkdir(
        path.join(runtimePackageRoots[layout.packageName], "runtime-bundles"),
        { recursive: true },
      );
      await writeFile(
        path.join(runtimePackageRoots[layout.packageName], "runtime-bundles", "stale.txt"),
        "stale",
        "utf8",
      );
      await writeFile(
        path.join(runtimePackageRoots[layout.packageName], "package.json"),
        JSON.stringify({
          name: layout.packageName,
          version: "0.0.0-dev",
        }, null, 2),
        "utf8",
      );
      await writeFile(path.join(artifactRoot, layout.bundleName), layout.bundleName, "utf8");
    }

    await assembleMaomiAgentNpmPackage({
      artifactRoot,
      packageRoot,
      runtimePackageRoots,
      version: "1.2.3",
    });

    for (const layout of RUNTIME_PACKAGE_LAYOUTS) {
      expect(
        await readFile(
          path.join(runtimePackageRoots[layout.packageName], "runtime-bundles", layout.bundleName),
          "utf8",
        ),
      ).toBe(layout.bundleName);
    }
  });

  test("updates main-package and runtime-package versions during assembly", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomiagent-npm-assemble-"));

    const artifactRoot = path.join(tempRoot, "artifacts");
    const packageRoot = path.join(tempRoot, "packages", "maomiagent-npm");
    const runtimePackageRoots = Object.fromEntries(
      RUNTIME_PACKAGE_LAYOUTS.map((layout) => [
        layout.packageName,
        path.join(tempRoot, "packages", layout.packageDirectoryName),
      ]),
    );

    await mkdir(artifactRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "maomiagent",
        version: "0.0.0-dev",
        optionalDependencies: Object.fromEntries(
          RUNTIME_PACKAGE_LAYOUTS.map((layout) => [layout.packageName, "0.0.0-dev"]),
        ),
      }, null, 2),
      "utf8",
    );

    for (const layout of RUNTIME_PACKAGE_LAYOUTS) {
      await mkdir(runtimePackageRoots[layout.packageName], { recursive: true });
      await writeFile(
        path.join(runtimePackageRoots[layout.packageName], "package.json"),
        JSON.stringify({
          name: layout.packageName,
          version: "0.0.0-dev",
        }, null, 2),
        "utf8",
      );
      await writeFile(path.join(artifactRoot, layout.bundleName), layout.bundleName, "utf8");
    }

    await assembleMaomiAgentNpmPackage({
      artifactRoot,
      packageRoot,
      runtimePackageRoots,
      version: "2.4.6",
    });

    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    expect(packageJson.version).toBe("2.4.6");
    expect(packageJson.optionalDependencies).toEqual(
      Object.fromEntries(RUNTIME_PACKAGE_LAYOUTS.map((layout) => [layout.packageName, "2.4.6"])),
    );

    for (const layout of RUNTIME_PACKAGE_LAYOUTS) {
      const runtimePackageJson = JSON.parse(
        await readFile(path.join(runtimePackageRoots[layout.packageName], "package.json"), "utf8"),
      );
      expect(runtimePackageJson.version).toBe("2.4.6");
    }
  });
});
