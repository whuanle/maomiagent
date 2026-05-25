import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { FeishuDocWorkspaceRuntime } from "./feishu-doc-workspace-runtime";

function ir(revisionId = "1"): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: { id: "docx_1", title: "Demo", revisionId, rootBlockId: "docx_1", pulledAt: "2026-05-23T00:00:00.000Z", source: { documentIdType: "document_id" } },
    blocks: { docx_1: { id: "docx_1", type: "page", parentId: null, children: [], editable: false, text: [], resource: null, attrs: {}, raw: {} } },
    assets: {},
    integrity: { contentHash: `sha256:${revisionId}`, rawHash: "sha256:raw" },
  };
}

describe("FeishuDocWorkspaceRuntime", () => {
  test("opens local IR without calling remote", async () => {
    let remoteCalls = 0;
    const runtime = new FeishuDocWorkspaceRuntime({
      cache: { readDocument: async () => ir("local"), writeDocument: async () => {}, writeBase: async () => {}, writeRemote: async () => {}, backupDocument: async () => "" },
      remote: { pull: async () => { remoteCalls += 1; return ir("remote"); } },
      assets: { hydrateAssets: async (next) => next },
      push: { execute: async () => ({ status: "succeeded" as const }) },
    });

    expect((await runtime.openDocument({ docId: "docx_1", workspaceId: "ws1" })).ir.document.revisionId).toBe("local");
    expect(remoteCalls).toBe(0);
  });

  test("pull latest backs up and overwrites when confirmed", async () => {
    const writes: string[] = [];
    const runtime = new FeishuDocWorkspaceRuntime({
      cache: {
        readDocument: async () => ir("old"),
        writeDocument: async (_docId, next) => { writes.push(next.document.revisionId); },
        writeBase: async (_docId, next) => { writes.push(`base:${next.document.revisionId}`); },
        writeRemote: async (_docId, next) => { writes.push(`remote:${next.document.revisionId}`); },
        backupDocument: async () => "backup",
      },
      remote: { pull: async () => ir("new") },
      assets: { hydrateAssets: async (next) => next },
      push: { execute: async () => ({ status: "succeeded" as const }) },
    });

    await runtime.pullLatest({ docId: "docx_1", workspaceId: "ws1", overwrite: true });
    expect(writes).toEqual(["remote:new", "new", "base:new"]);
  });
});