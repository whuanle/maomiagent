import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { RUNTIME_PACKAGE_LAYOUTS } from "../packages/maomiagent-npm/lib/runtime-package-metadata.js";

export async function assembleMaomiAgentNpmPackage({
  artifactRoot,
  packageRoot,
  runtimePackageRoots,
  version,
}) {
  const resolvedArtifactRoot = path.resolve(artifactRoot);
  const resolvedMainPackageRoot = path.resolve(packageRoot);
  const resolvedRuntimePackageRoots = runtimePackageRoots ?? Object.fromEntries(
    RUNTIME_PACKAGE_LAYOUTS.map((layout) => [
      layout.packageName,
      path.resolve(resolvedMainPackageRoot, "..", layout.packageDirectoryName),
    ]),
  );
  const mainPackageJsonPath = path.join(resolvedMainPackageRoot, "package.json");
  const mainPackageJson = JSON.parse(await readFile(mainPackageJsonPath, "utf8"));

  mainPackageJson.version = version;
  mainPackageJson.optionalDependencies = Object.fromEntries(
    RUNTIME_PACKAGE_LAYOUTS.map((layout) => [layout.packageName, version]),
  );
  await writeFile(mainPackageJsonPath, `${JSON.stringify(mainPackageJson, null, 2)}\n`, "utf8");

  for (const layout of RUNTIME_PACKAGE_LAYOUTS) {
    const runtimePackageRoot = resolvedRuntimePackageRoots[layout.packageName];
    const runtimeBundleRoot = path.join(runtimePackageRoot, "runtime-bundles");
    const runtimePackageJsonPath = path.join(runtimePackageRoot, "package.json");
    const runtimePackageJson = JSON.parse(await readFile(runtimePackageJsonPath, "utf8"));

    await rm(runtimeBundleRoot, { recursive: true, force: true });
    await mkdir(runtimeBundleRoot, { recursive: true });
    await cp(
      path.join(resolvedArtifactRoot, layout.bundleName),
      path.join(runtimeBundleRoot, layout.bundleName),
      { force: true },
    );

    runtimePackageJson.version = version;
    await writeFile(runtimePackageJsonPath, `${JSON.stringify(runtimePackageJson, null, 2)}\n`, "utf8");
  }
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
