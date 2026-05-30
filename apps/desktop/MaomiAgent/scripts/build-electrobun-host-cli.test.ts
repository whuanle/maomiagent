import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  ELECTROBUN_HOST_CLI_TEMPLATE_STUB,
  resolveElectrobunHostCliPaths,
  stageElectrobunHostCli,
} from "./build-electrobun-host-cli";

describe("electrobun host cli staging", () => {
  test("stages a host-run CLI from the published package assets", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maomiagent-electrobun-host-cli-"));

    try {
      const generatedFolder = join(tempRoot, ".generated");
      const electrobunPackageRoot = join(tempRoot, "electrobun");
      const stagedPaths = resolveElectrobunHostCliPaths(generatedFolder);

      mkdirSync(join(electrobunPackageRoot, "src", "cli"), { recursive: true });
      mkdirSync(join(electrobunPackageRoot, "dist", "api", "shared"), { recursive: true });

      writeFileSync(
        join(electrobunPackageRoot, "src", "cli", "index.ts"),
        'import "../shared/platform";\nimport "./templates/embedded";\n',
      );
      writeFileSync(
        join(electrobunPackageRoot, "dist", "api", "shared", "platform.ts"),
        'export const platform = "win";\n',
      );
      writeFileSync(
        join(electrobunPackageRoot, "dist", "api", "shared", "naming.ts"),
        'export const naming = "test";\n',
      );
      writeFileSync(
        join(electrobunPackageRoot, "package.json"),
        JSON.stringify({ name: "electrobun", version: "1.16.0", type: "module" }, null, 2),
      );

      mkdirSync(stagedPaths.root, { recursive: true });
      writeFileSync(join(stagedPaths.root, "stale.txt"), "stale");

      const cliEntrypoint = stageElectrobunHostCli({
        generatedFolder,
        electrobunPackageRoot,
      });

      expect(cliEntrypoint).toBe(stagedPaths.cliEntrypoint);
      expect(existsSync(stagedPaths.cliEntrypoint)).toBe(true);
      expect(existsSync(join(stagedPaths.sharedDir, "platform.ts"))).toBe(true);
      expect(existsSync(join(stagedPaths.sharedDir, "naming.ts"))).toBe(true);
      expect(existsSync(join(stagedPaths.root, "stale.txt"))).toBe(false);
      expect(readFileSync(join(stagedPaths.templatesDir, "embedded.ts"), "utf8")).toBe(
        ELECTROBUN_HOST_CLI_TEMPLATE_STUB,
      );
      expect(readFileSync(join(stagedPaths.root, "package.json"), "utf8")).toContain(
        '"version": "1.16.0"',
      );
      expect(readFileSync(join(stagedPaths.root, "package.json"), "utf8")).toContain(
        '"type": "module"',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
