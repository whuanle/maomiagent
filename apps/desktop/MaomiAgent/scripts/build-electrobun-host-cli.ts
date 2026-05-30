import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ELECTROBUN_HOST_CLI_TEMPLATE_STUB = `export function getTemplateNames(): string[] {
  return [];
}

export function getTemplate(): null {
  return null;
}
`;

type ElectrobunHostCliStageInput = {
  generatedFolder: string;
  electrobunPackageRoot: string;
};

type ElectrobunHostCliPaths = {
  root: string;
  cliEntrypoint: string;
  sharedDir: string;
  templatesDir: string;
};

export function resolveElectrobunHostCliPaths(generatedFolder: string): ElectrobunHostCliPaths {
  const root = join(generatedFolder, "electrobun-host-cli");
  const sourceRoot = join(root, "src");
  const cliDir = join(sourceRoot, "cli");

  return {
    root,
    cliEntrypoint: join(cliDir, "index.ts"),
    sharedDir: join(sourceRoot, "shared"),
    templatesDir: join(cliDir, "templates"),
  };
}

export function stageElectrobunHostCli(input: ElectrobunHostCliStageInput): string {
  const stagedPaths = resolveElectrobunHostCliPaths(input.generatedFolder);
  const cliSourcePath = join(input.electrobunPackageRoot, "src", "cli", "index.ts");
  const packageJsonSourcePath = join(input.electrobunPackageRoot, "package.json");
  const sharedSourceDir = join(input.electrobunPackageRoot, "dist", "api", "shared");

  rmSync(stagedPaths.root, { recursive: true, force: true });
  mkdirSync(dirname(stagedPaths.cliEntrypoint), { recursive: true });
  mkdirSync(stagedPaths.sharedDir, { recursive: true });
  mkdirSync(stagedPaths.templatesDir, { recursive: true });

  cpSync(cliSourcePath, stagedPaths.cliEntrypoint, { force: true });

  for (const entry of readdirSync(sharedSourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    cpSync(join(sharedSourceDir, entry.name), join(stagedPaths.sharedDir, entry.name), {
      force: true,
    });
  }

  writeFileSync(join(stagedPaths.templatesDir, "embedded.ts"), ELECTROBUN_HOST_CLI_TEMPLATE_STUB);
  cpSync(packageJsonSourcePath, join(stagedPaths.root, "package.json"), { force: true });

  return stagedPaths.cliEntrypoint;
}
