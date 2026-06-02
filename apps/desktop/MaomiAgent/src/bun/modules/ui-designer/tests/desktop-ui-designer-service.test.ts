import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeLogger } from "../../../../shared/runtime-logs";
import { DesktopUiDesignerService } from "../implementation/services/desktop-ui-designer-service";

function createLoggerStub(): RuntimeLogger {
  const write = async () => ({
    id: "log-1",
    at: new Date().toISOString(),
    level: "info" as const,
    source: "desktop",
    module: "desktop.ui-designer",
    message: "ok",
  });

  return {
    write,
    debug: write,
    info: write,
    warn: write,
    error: write,
  };
}

test("reports missing readiness fields for a new workspace design package", async () => {
  const directoryPath = await mkdtemp(join(tmpdir(), "maomi-ui-designer-service-"));
  const service = new DesktopUiDesignerService(
    {
      async list() {
        throw new Error("not used");
      },
      async get(workspaceId) {
        return {
          workspaceId,
          name: "UI Workspace",
          directoryPath,
          isPinned: false,
          tags: [],
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
        };
      },
      async getFileTree() {
        throw new Error("not used");
      },
      async getFileContent() {
        throw new Error("not used");
      },
    },
    createLoggerStub(),
  );

  try {
    const state = await service.getState({ workspaceId: "workspace-1" });

    expect(state.workspaceId).toBe("workspace-1");
    expect(state.designPackagePath.endsWith("design")).toBe(true);
    expect(state.designRoot.endsWith("design")).toBe(true);
    expect(state.hasDesignSpec).toBe(false);
    expect(state.shouldSendKickoff).toBe(true);
    expect(state.kickoffPrompt).toContain("前端框架");
    expect(state.readiness.ready).toBe(false);
    expect(state.readiness.missing).toContain("stack.framework");
    expect(state.readiness.missing).toContain("theme.style");
    expect(state.readiness.missing).toContain("pages.templates");
    expect(state.preview.mode).toBe("preview-app");
    expect(state.preview.status).toBe("idle");
  } finally {
    await rm(directoryPath, { recursive: true, force: true });
  }
});
