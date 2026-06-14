import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { DesktopConfigurationService } from "../../configuration";
import { DesktopDatabaseService } from "../../database";
import type { DesktopRuntimeContext } from "../../foundation";
import { RuntimeLogsService } from "../../logs";
import { RuntimeLogsStore } from "../../logs/implementation/stores/runtime-logs-store";
import { DesktopWorkspaceService } from "../implementation/services/desktop-workspace-service";
import { DesktopWorkspaceStore } from "../implementation/stores/desktop-workspace-store";

function createRuntimeContext(tempRoot: string): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      registerHttpRoute() {
        return () => {};
      },
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    window: {
      title: "MaomiAgent Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: join(tempRoot, "logs.sqlite"),
            },
            workspace: {
              path: join(tempRoot, "workspace.sqlite"),
            },
          },
        },
      },
    },
    createWindow() {
      throw new Error("not needed");
    },
    installProcessHandlers: false,
  };
}

describe("DesktopWorkspaceService", () => {
  test("manages directory records without workspace lifecycle side effects", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-workspace-"));
    const workspaceDirectory = await mkdtemp(join(tempRoot, "repo-"));
    const database = new DesktopDatabaseService(new DesktopConfigurationService(createRuntimeContext(tempRoot)));

    try {
      const logs = new RuntimeLogsService(
        new RuntimeLogsStore(database.getConnection("runtimeLogs")),
        console,
      );
      const workspace = new DesktopWorkspaceService(
        new DesktopWorkspaceStore(database.getConnection("workspace")),
        logs.createLogger({ source: "desktop", module: "desktop.workspace" }),
      );

      const created = await workspace.create({
        name: "Main Repo",
        directoryPath: workspaceDirectory,
        isPinned: true,
        tags: ["core", "core", "desktop"],
      });
      expect(created.created).toBe(true);
      expect(created.item.workspaceId).toStartWith("repo-");
      expect(created.item.tags).toEqual(["core", "desktop"]);
      expect(created.item.directoryPath).toBe(workspaceDirectory);

      await expect(workspace.create({
        name: "No Directory",
        directoryPath: "",
      })).rejects.toThrow("workspace directoryPath is required");

      const updated = await workspace.update(created.item.workspaceId, {
        note: "local project",
        isPinned: false,
      });
      expect(updated).toMatchObject({
        workspaceId: created.item.workspaceId,
        note: "local project",
        isPinned: false,
      });

      const list = await workspace.list({ q: "main" });
      expect(list.items).toHaveLength(1);
      expect(list.items[0]?.workspaceId).toBe(created.item.workspaceId);

      expect(await workspace.remove(created.item.workspaceId)).toBe(true);
      expect(await workspace.get(created.item.workspaceId)).toBeNull();

      const logsWritten = logs.query({ module: "desktop.workspace" });
      expect(logsWritten.items.map((item) => item.message)).toContain("Desktop workspace created");
      expect(logsWritten.items.map((item) => item.message)).toContain("Desktop workspace updated");
      expect(logsWritten.items.map((item) => item.message)).toContain("Desktop workspace removed");
    } finally {
      database.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test("lists workspace files and returns text or image preview content", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-workspace-files-"));
    const workspaceDirectory = await mkdtemp(join(tempRoot, "repo-"));
    const sourceDirectory = join(workspaceDirectory, "src");
    const encodedFilePath = join(sourceDirectory, "notes #1.md");
    const outsideFilePath = join(tempRoot, "outside.txt");
    const database = new DesktopDatabaseService(new DesktopConfigurationService(createRuntimeContext(tempRoot)));

    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(workspaceDirectory, "README.md"), "# Desktop Workspace\n\nhello bridge\n", "utf-8");
    await writeFile(encodedFilePath, "encoded path content\n", "utf-8");
    await writeFile(outsideFilePath, "outside\n", "utf-8");
    await writeFile(
      join(workspaceDirectory, "big.txt"),
      `start-${"a".repeat(300 * 1024)}\n${"b".repeat(300 * 1024)}-end`,
      "utf-8",
    );
    await writeFile(
      join(workspaceDirectory, "logo.png"),
      new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn0X1sAAAAASUVORK5CYII=", "base64")),
    );

    try {
      const logs = new RuntimeLogsService(
        new RuntimeLogsStore(database.getConnection("runtimeLogs")),
        console,
      );
      const workspace = new DesktopWorkspaceService(
        new DesktopWorkspaceStore(database.getConnection("workspace")),
        logs.createLogger({ source: "desktop", module: "desktop.workspace" }),
      );

      const created = await workspace.create({
        workspaceId: "repo-files",
        name: "Repo Files",
        directoryPath: workspaceDirectory,
      });

      const rootTree = await workspace.getFileTree(created.item.workspaceId);
      expect(rootTree.path).toBe("");
      expect(rootTree.nodes.map((node) => node.path)).toEqual(["src", "big.txt", "logo.png", "README.md"]);

      const sourceTree = await workspace.getFileTree(
        created.item.workspaceId,
        `${pathToFileURL(sourceDirectory).toString()}?view=list#top`,
      );
      expect(sourceTree.path).toBe("src");
      expect(sourceTree.nodes.map((node) => node.path)).toEqual(["src/notes #1.md"]);

      const readme = await workspace.getFileContent(created.item.workspaceId, "README.md");
      expect(readme.binary).toBe(false);
      expect(readme.truncated).toBe(false);
      expect(readme.path).toBe("README.md");
      expect(readme.content).toContain("hello bridge");
      expect(readme.previewHeadContent).toBeUndefined();
      expect(readme.previewTailContent).toBeUndefined();

      const readmeByAbsolutePath = await workspace.getFileContent(
        created.item.workspaceId,
        join(workspaceDirectory, "README.md"),
      );
      expect(readmeByAbsolutePath.path).toBe("README.md");
      expect(readmeByAbsolutePath.content).toContain("hello bridge");

      const encodedFile = await workspace.getFileContent(
        created.item.workspaceId,
        `${pathToFileURL(encodedFilePath).toString()}?line=1#note`,
      );
      expect(encodedFile.binary).toBe(false);
      expect(encodedFile.path).toBe("src/notes #1.md");
      expect(encodedFile.content).toContain("encoded path content");

      const big = await workspace.getFileContent(created.item.workspaceId, "big.txt");
      expect(big.binary).toBe(false);
      expect(big.truncated).toBe(true);
      expect(big.content.startsWith("start-")).toBe(true);
      expect(big.content.endsWith("-end")).toBe(false);
      expect(big.previewHeadContent?.startsWith("start-")).toBe(true);
      expect(big.previewTailContent?.endsWith("-end")).toBe(true);

      const image = await workspace.getFileContent(created.item.workspaceId, "logo.png");
      expect(image.binary).toBe(true);
      expect(image.content).toBe("");
      expect(image.truncated).toBe(false);
      expect(image.mimeType).toBe("image/png");
      expect(typeof image.previewBase64).toBe("string");
      expect(image.previewBase64?.length).toBeGreaterThan(16);

      const written = await workspace.writeTextFile(
        created.item.workspaceId,
        "docs/plan.md",
        "# Plan\n\nShip it.\n",
      );
      expect(written.binary).toBe(false);
      expect(written.path).toBe("docs/plan.md");
      expect(written.content).toContain("Ship it.");

      const reviewCache = await workspace.writeTextFile(
        created.item.workspaceId,
        ".maomi/git-review/commit/example.json",
        "{\"version\":1}",
      );
      expect(reviewCache.binary).toBe(false);
      expect(reviewCache.path).toBe(".maomi/git-review/commit/example.json");
      expect(reviewCache.content).toContain("\"version\":1");

      const writtenByFileUrl = await workspace.writeTextFile(
        created.item.workspaceId,
        pathToFileURL(join(workspaceDirectory, "docs", "roadmap.md")).toString(),
        "# Roadmap\n",
      );
      expect(writtenByFileUrl.path).toBe("docs/roadmap.md");
      expect(writtenByFileUrl.content).toContain("# Roadmap");

      await expect(
        workspace.getFileContent(created.item.workspaceId, outsideFilePath),
      ).rejects.toThrow("workspace path escapes root directory");
    } finally {
      database.dispose();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
