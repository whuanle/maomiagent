import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { applyManifestToRoots } from "./apply-recovery-batch";

let tempRoot = "";

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  }
});

describe("applyManifestToRoots", () => {
  test("writes a dry-run report without touching the target", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomi-recovery-apply-"));
    const targetRoot = path.join(tempRoot, "target");
    const layerBRoot = path.join(tempRoot, "layerB");
    const reportRoot = path.join(tempRoot, "reports");

    await mkdir(path.join(targetRoot, "apps"), { recursive: true });
    await mkdir(path.join(layerBRoot, "apps"), { recursive: true });
    await writeFile(path.join(targetRoot, "apps", "file.ts"), "export const value = 'target';\n", "utf8");
    await writeFile(path.join(layerBRoot, "apps", "file.ts"), "export const value = 'layerB';\n", "utf8");

    const reportPath = await applyManifestToRoots({
      manifest: {
        id: "B-TEST-001",
        mode: "copy",
        entries: [{
          targetPath: "apps/file.ts",
          sourceLayer: "layerB",
          sourcePath: "apps/file.ts",
        }],
      },
      roots: {
        target: targetRoot,
        layerA: path.join(tempRoot, "layerA"),
        layerB: layerBRoot,
        reportRoot,
      },
      apply: false,
    });

    expect(await readFile(path.join(targetRoot, "apps", "file.ts"), "utf8")).toBe(
      "export const value = 'target';\n",
    );
    expect(await readFile(reportPath, "utf8")).toContain("\"dryRun\": true");
  });

  test("backs up and overwrites the target file on apply", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "maomi-recovery-apply-"));
    const targetRoot = path.join(tempRoot, "target");
    const layerBRoot = path.join(tempRoot, "layerB");
    const reportRoot = path.join(tempRoot, "reports");

    await mkdir(path.join(targetRoot, "apps"), { recursive: true });
    await mkdir(path.join(layerBRoot, "apps"), { recursive: true });
    await writeFile(path.join(targetRoot, "apps", "file.ts"), "export const value = 'target';\n", "utf8");
    await writeFile(path.join(layerBRoot, "apps", "file.ts"), "export const value = 'layerB';\n", "utf8");

    const reportPath = await applyManifestToRoots({
      manifest: {
        id: "B-TEST-001",
        mode: "copy",
        entries: [{
          targetPath: "apps/file.ts",
          sourceLayer: "layerB",
          sourcePath: "apps/file.ts",
        }],
      },
      roots: {
        target: targetRoot,
        layerA: path.join(tempRoot, "layerA"),
        layerB: layerBRoot,
        reportRoot,
      },
      apply: true,
    });

    expect(await readFile(path.join(targetRoot, "apps", "file.ts"), "utf8")).toBe(
      "export const value = 'layerB';\n",
    );
    expect(await readFile(path.join(reportRoot, "backups", "B-TEST-001", "apps", "file.ts"), "utf8")).toBe(
      "export const value = 'target';\n",
    );
    expect(await readFile(reportPath, "utf8")).toContain("\"dryRun\": false");
  });
});
