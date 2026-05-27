import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

const startDevPath = path.resolve(import.meta.dir, "start-dev.ts");
const bunIndexPath = path.resolve(import.meta.dir, "..", "src", "bun", "index.ts");
const startDevSource = readFileSync(startDevPath, "utf8");
const bunIndexSource = readFileSync(bunIndexPath, "utf8");

describe("start-dev existing HMR instance flow", () => {
  test("starts a managed HMR server and passes its URL to the existing instance refresh request", () => {
    expect(startDevSource).toContain("await attachExistingHmrInstance();");
    expect(startDevSource).toContain("async function attachExistingHmrInstance(): Promise<void>");
    expect(startDevSource).toContain("const { devServerProcess, devServerUrl } = await startManagedHmrDevServer();");
    expect(startDevSource).toContain("devServerUrl,");
    expect(startDevSource).toContain("Activated existing MaomiAgent hmr dev instance and switched it to");
  });

  test("desktop bun entry keeps a mutable dev server URL for refreshes on existing dev instances", () => {
    expect(bunIndexSource).toContain("let activeDevServerUrl = process.env.MAOMI_DESKTOP_DEV_SERVER_URL?.trim() ?? \"\";");
    expect(bunIndexSource).toContain("const devServerUrl = activeDevServerUrl;");
    expect(bunIndexSource).toContain("requestedDevServerUrl = typeof parsed.devServerUrl === \"string\"");
    expect(bunIndexSource).toContain("activeDevServerUrl = requestedDevServerUrl;");
  });
});
