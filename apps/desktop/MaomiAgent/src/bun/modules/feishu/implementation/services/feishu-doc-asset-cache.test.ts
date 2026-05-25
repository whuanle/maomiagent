import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FeishuDocAssetCache } from "./feishu-doc-asset-cache";

describe("FeishuDocAssetCache", () => {
  test("stores asset bytes by workspace doc and token", async () => {
    const root = await mkdtemp(join(tmpdir(), "maomi-feishu-assets-"));
    try {
      const cache = new FeishuDocAssetCache(root);
      const item = await cache.writeAsset({
        workspaceId: "ws1",
        docId: "doc1",
        token: "img1",
        kind: "image",
        mime: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      });

      expect(item.status).toBe("cached");
      expect(item.cacheKey).toBe("sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
      expect(item.localPath).toContain(join("ws1", "doc1", "img1-"));
      expect(item.absolutePath).toBe(join(root, item.localPath));
      expect(await readFile(item.absolutePath)).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});