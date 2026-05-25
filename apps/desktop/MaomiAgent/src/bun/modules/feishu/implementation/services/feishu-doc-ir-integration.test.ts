import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { FeishuDocWorkspaceRuntime } from "./feishu-doc-workspace-runtime";

function sampleIR(revisionId = "local"): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "docx_1",
      title: "Local first",
      revisionId,
      rootBlockId: "docx_1",
      pulledAt: "2026-05-23T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      docx_1: {
        id: "docx_1",
        type: "page",
        parentId: null,
        children: [],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
    },
    assets: {},
    integrity: { contentHash: `sha256:${revisionId}`, rawHash: "sha256:raw" },
  };
}

async function openCachedDocumentForTest(input: {
  docId: string;
  remotePull: () => Promise<FeishuDocIR>;
}) {
  const runtime = new FeishuDocWorkspaceRuntime({
    cache: {
      readDocument: async (docId) => docId === input.docId ? sampleIR("cached") : null,
      writeDocument: async () => {},
      writeBase: async () => {},
      writeRemote: async () => {},
      backupDocument: async () => "",
    },
    remote: { pull: input.remotePull },
    assets: { hydrateAssets: async (ir) => ir },
    push: { execute: async () => ({ status: "succeeded" as const }) },
  });

  return runtime.openDocument({ docId: input.docId, workspaceId: "workspace-1" });
}

describe("Feishu document IR integration", () => {
  test("local cache open does not invoke remote pull", async () => {
    let remotePulls = 0;
    const cached = await openCachedDocumentForTest({
      docId: "docx_1",
      remotePull: async () => {
        remotePulls += 1;
        throw new Error("must not pull");
      },
    });

    expect(cached.source).toBe("cache");
    expect(cached.ir.document.revisionId).toBe("cached");
    expect(remotePulls).toBe(0);
  });
});
