#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { ensureRuntimeExtracted } from "../lib/extract-runtime.js";
import { launchGui } from "../lib/launch-gui.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

try {
  const { runtimeRoot, target } = await ensureRuntimeExtracted(packageRoot);
  await launchGui({ runtimeRoot, target });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
