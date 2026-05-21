import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger, RuntimeLogRecord } from "../../../logs";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuStore } from "./desktop-feishu-store";

function createConfiguration(storeFilePath: string): DesktopConfigurationPort {
  return {
    get: (key) => (key === "desktop.feishu.store.path" ? storeFilePath : undefined),
    getString: (key, fallback) => (key === "desktop.feishu.store.path" ? storeFilePath : fallback),
    getBoolean: (_key, fallback) => fallback,
    getNumber: (_key, fallback) => fallback,
    getRecord: () => undefined,
    requireString: (key) => {
      if (key === "desktop.feishu.store.path") {
        return storeFilePath;
      }
      throw new Error(`Missing configuration value: ${key}`);
    },
    snapshot: () => ({ values: {} }),
  };
}

function createLogger(): RuntimeLogger {
  const write = async (level: RuntimeLogRecord["level"], message: string): Promise<RuntimeLogRecord> => ({
    id: `${level}-${message}`,
    at: new Date(0).toISOString(),
    level,
    source: "desktop-test",
    module: "desktop.feishu.store.test",
    message,
  });

  return {
    write,
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
  };
}

async function createStoreFixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-store-"));
  const storeFilePath = join(tempRoot, "feishu-store.json");
  const store = new DesktopFeishuStore(createConfiguration(storeFilePath), createLogger());

  return {
    store,
    storeFilePath,
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  };
}

describe("DesktopFeishuStore", () => {
  test("migrates legacy snapshots with developer and doc tree defaults", async () => {
    const fixture = await createStoreFixture();

    try {
      await writeFile(fixture.storeFilePath, JSON.stringify({ docs: {} }), "utf8");

      const snapshot = await fixture.store.read();

      expect(snapshot.docTreeCache).toEqual({
        roots: {},
        branches: {},
        contents: {},
      });
      expect(snapshot.developerCredential).toEqual({
        appSecret: "",
      });
      expect(snapshot.developerToken).toEqual({
        accessToken: "",
        refreshToken: "",
        accessTokenExpiresAt: "",
        refreshTokenExpiresAt: "",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  test("persists docs and doc tree roots without dropping either collection", async () => {
    const fixture = await createStoreFixture();

    try {
      const initial = await fixture.store.read();
      const snapshot: DesktopFeishuStoreSnapshot = {
        ...initial,
        docs: {
          doc_1: {
            docId: "doc_1",
            title: "Existing Doc",
            markdown: "# Existing Doc",
            updatedAt: "2026-05-21T00:00:00.000Z",
          },
        },
        docTreeCache: {
          ...initial.docTreeCache,
          roots: {
            root_token: {
              token: "root_token",
              kind: "document",
              rootNodeId: "doc_1",
              title: "Existing Doc",
              loadedAt: "2026-05-21T00:00:00.000Z",
            },
          },
        },
      };

      await fixture.store.write(snapshot);

      const persisted = JSON.parse(await readFile(fixture.storeFilePath, "utf8")) as DesktopFeishuStoreSnapshot;
      expect(persisted.docs.doc_1).toMatchObject({
        docId: "doc_1",
        title: "Existing Doc",
      });
      expect(persisted.docTreeCache.roots.root_token).toMatchObject({
        token: "root_token",
        kind: "document",
        rootNodeId: "doc_1",
        title: "Existing Doc",
      });

      const reloaded = await fixture.store.read();
      expect(reloaded.docs.doc_1).toMatchObject({
        docId: "doc_1",
        title: "Existing Doc",
      });
      expect(reloaded.docTreeCache.roots.root_token).toMatchObject({
        token: "root_token",
        kind: "document",
        rootNodeId: "doc_1",
      });
    } finally {
      await fixture.cleanup();
    }
  });
});
