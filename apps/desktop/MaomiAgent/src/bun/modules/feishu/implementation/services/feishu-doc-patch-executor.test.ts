import { describe, expect, test } from "bun:test";

import { FeishuDocPatchExecutor } from "./feishu-doc-patch-executor";

describe("FeishuDocPatchExecutor", () => {
  test("blocks plans with blocked changes before remote calls", async () => {
    let calls = 0;
    const executor = new FeishuDocPatchExecutor({
      updateText: async () => { calls += 1; },
      uploadAsset: async () => { calls += 1; return { token: "new" }; },
    });

    const result = await executor.execute({
      documentId: "docx_1",
      baseRevisionId: "1",
      operations: [{ kind: "blocked_change", blockId: "b1", reason: "bitable raw changed" }],
    });

    expect(result.status).toBe("blocked");
    expect(calls).toBe(0);
  });

  test("executes text operations with revision id", async () => {
    const calls: unknown[] = [];
    const executor = new FeishuDocPatchExecutor({
      updateText: async (input) => { calls.push(input); },
      uploadAsset: async () => ({ token: "new" }),
    });

    await executor.execute({
      documentId: "docx_1",
      baseRevisionId: "7",
      operations: [{ kind: "update_text", blockId: "p1", text: "New" }],
    });

    expect(calls).toEqual([{ documentId: "docx_1", revisionId: "7", blockId: "p1", text: "New" }]);
  });

  test("returns failed when update text throws", async () => {
    const executor = new FeishuDocPatchExecutor({
      updateText: async () => { throw new Error("revision mismatch"); },
      uploadAsset: async () => ({ token: "new" }),
    });

    await expect(executor.execute({
      documentId: "docx_1",
      baseRevisionId: "7",
      operations: [{ kind: "update_text", blockId: "p1", text: "New" }],
    })).resolves.toEqual({ status: "failed", message: "revision mismatch" });
  });

  test("blocks unsupported operations instead of reporting success", async () => {
    let calls = 0;
    const executor = new FeishuDocPatchExecutor({
      updateText: async () => { calls += 1; },
      uploadAsset: async () => { calls += 1; return { token: "new" }; },
    });

    await expect(executor.execute({
      documentId: "docx_1",
      baseRevisionId: "7",
      operations: [{ kind: "delete_block", blockId: "p1" }],
    })).resolves.toEqual({ status: "blocked", message: "Unsupported patch operation: delete_block" });
    expect(calls).toBe(0);
  });
});