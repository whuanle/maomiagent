import { describe, expect, test } from "bun:test";

import {
  normalizeConversationAttachedTabRequest,
  resolveConversationAttachedTabKey,
} from "./attached-tabs";

describe("attached tab feishu preview support", () => {
  test("normalizes feishu doc preview sources", () => {
    expect(normalizeConversationAttachedTabRequest({
      kind: "preview",
      title: "  飞书原文  ",
      workspaceId: " workspace-a ",
      source: {
        kind: "feishu-doc",
        docId: " doc-token ",
        path: ".maomi\\feishu-docs\\drafts\\doc-token.draft.md",
        fallbackPath: ".maomi\\feishu-docs\\doc-token.md",
        targetWorkspaceId: " workspace-b ",
        requestId: " req-1 ",
      },
    })).toEqual({
      kind: "preview",
      title: "飞书原文",
      workspaceId: "workspace-a",
      source: {
        kind: "feishu-doc",
        docId: "doc-token",
        path: ".maomi/feishu-docs/drafts/doc-token.draft.md",
        fallbackPath: ".maomi/feishu-docs/doc-token.md",
        targetWorkspaceId: "workspace-b",
        requestId: "req-1",
      },
    });
  });

  test("uses a stable key for feishu doc previews", () => {
    expect(resolveConversationAttachedTabKey({
      kind: "preview",
      title: "飞书原文",
      workspaceId: "workspace-a",
      source: {
        kind: "feishu-doc",
        docId: "doc-token",
        path: ".maomi/feishu-docs/drafts/doc-token.draft.md",
        fallbackPath: ".maomi/feishu-docs/doc-token.md",
      },
    })).toBe("attached::feishu-doc:workspace-a:default:doc-token:.maomi/feishu-docs/drafts/doc-token.draft.md");
  });
});
