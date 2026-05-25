import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { FeishuDocIRWorkspaceCache } from "./feishu-doc-ir-workspace-cache";

function sampleIR(id: string, title = "Cached Doc"): FeishuDocIR {
  const rootBlockId = `${id}_root`;

  return {
    schemaVersion: 1,
    document: {
      id,
      title,
      revisionId: `${id}_revision`,
      rootBlockId,
      pulledAt: "2026-05-23T00:00:00.000Z",
      source: {
        documentIdType: "document_id",
      },
    },
    blocks: {
      [rootBlockId]: {
        id: rootBlockId,
        type: "page",
        parentId: null,
        children: [],
        editable: true,
        text: [{ kind: "text", text: title, attrs: {}, raw: null }],
        resource: null,
        attrs: {},
        raw: null,
      },
    },
    assets: {},
    integrity: {
      contentHash: `${id}_content_hash`,
      rawHash: `${id}_raw_hash`,
    },
  };
}

async function withWorkspace(run: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-ir-"));
  try {
    await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

describe("FeishuDocIRWorkspaceCache", () => {
  test("writes and reads document and base IR", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const cache = new FeishuDocIRWorkspaceCache(workspaceRoot);
      const documentIR = sampleIR("doc_1", "Document IR");
      const baseIR = sampleIR("doc_1", "Base IR");

      await cache.writeDocument(" doc/1 ", documentIR);
      await cache.writeBase(" doc/1 ", baseIR);

      expect(await cache.readDocument("doc/1")).toEqual(documentIR);
      expect(await cache.readBase("doc/1")).toEqual(baseIR);
      expect(await cache.readDocument("missing_doc")).toBeNull();
    });
  });

  test("backs up current document before overwrite", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const cache = new FeishuDocIRWorkspaceCache(workspaceRoot);
      const firstIR = sampleIR("doc_2", "First Version");
      const nextIR = sampleIR("doc_2", "Next Version");

      await cache.writeDocument("doc:2", firstIR);
      const backupPath = await cache.backupDocument("doc:2", "2026-05-23T12:34:56.000Z");
      await cache.writeDocument("doc:2", nextIR);

      expect(backupPath).toBe(join(
        workspaceRoot,
        ".maomi",
        "feishu-docs",
        "doc_2",
        "backups",
        "2026-05-23T12_34_56.000Z.ir.json",
      ));
      expect(JSON.parse(await readFile(backupPath, "utf8"))).toEqual(firstIR);
      expect(await cache.readDocument("doc:2")).toEqual(nextIR);
    });
  });
});