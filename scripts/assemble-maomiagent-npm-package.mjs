import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RUNTIME_BUNDLES = [
  "win-x64.zip",
  "linux-x64.zip",
  "macos-arm64-app.zip",
  "macos-x64-app.zip",
];

export async function assembleMaomiAgentNpmPackage({
  artifactRoot,
  packageRoot,
  version,
}) {
  const resolvedArtifactRoot = path.resolve(artifactRoot);
  const resolvedPackageRoot = path.resolve(packageRoot);
  const runtimeBundleRoot = path.join(resolvedPackageRoot, "runtime-bundles");
  const packageJsonPath = path.join(resolvedPackageRoot, "package.json");

  await rm(runtimeBundleRoot, { recursive: true, force: true });
  await mkdir(runtimeBundleRoot, { recursive: true });

  for (const bundleName of RUNTIME_BUNDLES) {
    await cp(
      path.join(resolvedArtifactRoot, bundleName),
      path.join(runtimeBundleRoot, bundleName),
      { force: true },
    );
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.version = version;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function runCli() {
  const artifactRootValue = process.env.MAOMI_AGENT_NPM_ARTIFACT_ROOT;

  if (!artifactRootValue) {
    throw new Error("MAOMI_AGENT_NPM_ARTIFACT_ROOT is required.");
  }

  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  await assembleMaomiAgentNpmPackage({
    artifactRoot: path.resolve(repositoryRoot, artifactRootValue),
    packageRoot: path.resolve(repositoryRoot, "packages/maomiagent-npm"),
    version: process.env.MAOMI_AGENT_NPM_VERSION ?? "0.0.0-dev",
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
