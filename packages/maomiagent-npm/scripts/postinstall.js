import { fileURLToPath } from "node:url";

import { ensureRuntimeExtracted } from "../lib/extract-runtime.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

ensureRuntimeExtracted(packageRoot).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
