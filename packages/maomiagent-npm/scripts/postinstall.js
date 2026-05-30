import { fileURLToPath } from "node:url";

import { ensureRuntimeExtracted, validateRuntimeBundles } from "../lib/extract-runtime.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

async function run() {
  if (process.argv.includes("--validate-runtime-bundles")) {
    await validateRuntimeBundles(packageRoot);
    return;
  }

  await ensureRuntimeExtracted(packageRoot);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
