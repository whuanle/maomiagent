# Feishu Doc Whiteboard Reversible Mermaid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull reversible Feishu Mermaid whiteboards into local Mermaid source blocks, keep their original whiteboard tokens in cache-only metadata, and push safe Mermaid edits back to the same remote whiteboards without falling back to snapshot images locally.

**Architecture:** Keep the new behavior centered on Feishu doc IR assets. Pull enriches IR assets with reversible Mermaid metadata after querying whiteboard code, then `feishuDocIRToSourceMarkdown(...)` emits Mermaid fences instead of token blocks. Push reuses that metadata to build a stable ordinal mapping, rewrites the document body with original whiteboard token placeholders, and updates changed whiteboards through the board API only when the mapping is still safe.

**Tech Stack:** TypeScript, Bun tests, Feishu docx/docs_ai/board OpenAPI, desktop workspace markdown/IR/source caches, existing Mermaid local preview renderer

---

## File Map

- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.ts`
  - pure helpers for reversible Mermaid metadata, checksum generation, token collection, Mermaid fence parsing, stable push-plan building, and post-push metadata settlement
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts`
  - focused unit coverage for reversible asset helpers and push-plan matching
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.ts`
  - board API wrapper for whiteboard code query and Mermaid update with token refresh retry
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts`
  - board API request/response normalization tests
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-feishu-doc-ir.ts`
  - extend `FeishuDocIRAsset` with optional reversible Mermaid metadata
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-source-markdown-codec.ts`
  - emit Mermaid fenced blocks for reversible Mermaid assets
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts`
  - query reversible Mermaid whiteboards during pull and persist enriched IR
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
  - pull-side recovery coverage for Mermaid and unsupported whiteboards
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
  - add safe reversible Mermaid push interception before existing push branches
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
  - push-side coverage for stable token reuse and ambiguity blockers
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/composition/feishu.module.ts`
  - wire a shared whiteboard API instance into pull and push services
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts`
  - confirm reversible asset metadata survives cache roundtrip
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts`
  - lock the regression that Mermaid fences do not trigger whiteboard preview token extraction

### Task 1: Add Reversible Mermaid Metadata And Source Markdown Support

**Files:**
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-feishu-doc-ir.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-source-markdown-codec.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts`
- Test: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the helper test file and add the two regression tests:

```ts
import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { feishuDocIRToSourceMarkdown } from "./feishu-doc-source-markdown-codec";
import {
  applyRecoveredMermaidWhiteboards,
  buildReversibleMermaidPushPlan,
} from "./feishu-doc-whiteboard-reversible";

function createWhiteboardIR(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "doc_1",
      title: "Demo",
      revisionId: "7",
      rootBlockId: "doc_1",
      pulledAt: "2026-05-29T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      doc_1: {
        id: "doc_1",
        type: "page",
        parentId: null,
        children: ["whiteboard_1", "text_1"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      whiteboard_1: {
        id: "whiteboard_1",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "wb_1", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      text_1: {
        id: "text_1",
        type: "text",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [{ kind: "text", text: "After board", attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
    },
    assets: {
      wb_1: {
        token: "wb_1",
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
      },
    },
    integrity: {
      contentHash: "content",
      rawHash: "raw",
    },
  };
}

describe("feishu-doc-whiteboard-reversible", () => {
  test("emits Mermaid fences for recovered whiteboards and keeps token blocks for unsupported boards", () => {
    const recovered = applyRecoveredMermaidWhiteboards({
      ir: createWhiteboardIR(),
      recovered: [{
        whiteboardToken: "wb_1",
        format: "mermaid",
        source: "flowchart TD\\nA-->B",
        origin: "whiteboard_code_export",
        resolvedAt: "2026-05-29T00:00:00.000Z",
      }],
    });

    expect(feishuDocIRToSourceMarkdown(recovered)).toContain("```mermaid\\nflowchart TD\\nA-->B\\n```");
    expect(recovered.assets.wb_1?.reversible).toEqual(expect.objectContaining({
      format: "mermaid",
      ordinal: 0,
      origin: "whiteboard_code_export",
    }));
  });

  test("builds a stable push plan from pulled Mermaid whiteboards", () => {
    const recovered = applyRecoveredMermaidWhiteboards({
      ir: createWhiteboardIR(),
      recovered: [{
        whiteboardToken: "wb_1",
        format: "mermaid",
        source: "flowchart TD\\nA-->B",
        origin: "whiteboard_code_export",
        resolvedAt: "2026-05-29T00:00:00.000Z",
      }],
    });

    const plan = buildReversibleMermaidPushPlan({
      draftMarkdown: "```mermaid\\nflowchart TD\\nA-->C\\n```\\n\\nAfter board\\n",
      baseIr: recovered,
    });

    expect(plan.kind).toBe("update");
    if (plan.kind !== "update") {
      throw new Error("expected update plan");
    }
    expect(plan.documentMarkdown).toContain('<whiteboard token="wb_1" />');
    expect(plan.changedWhiteboards).toEqual([expect.objectContaining({
      whiteboardToken: "wb_1",
      source: "flowchart TD\\nA-->C",
    })]);
  });
});
```

Extend the cache and preview regression tests:

```ts
test("round-trips reversible Mermaid asset metadata", async () => {
  const cache = new FeishuDocIRWorkspaceCache(workspaceRoot);
  const ir = {
    ...sampleIR("doc_1"),
    assets: {
      wb_1: {
        token: "wb_1",
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        reversible: {
          format: "mermaid",
          source: "flowchart TD\\nA-->B",
          sourceChecksum: "sha256:test",
          ordinal: 0,
          origin: "whiteboard_code_export",
          state: "mermaid",
          lastResolvedAt: "2026-05-29T00:00:00.000Z",
        },
      },
    },
  };

  await cache.writeDocument("doc_1", ir);
  await expect(cache.readDocument("doc_1")).resolves.toEqual(expect.objectContaining({
    assets: {
      wb_1: expect.objectContaining({
        reversible: expect.objectContaining({
          format: "mermaid",
          ordinal: 0,
        }),
      }),
    },
  }));
});
```

```ts
test("does not extract whiteboard preview tokens from Mermaid fences", () => {
  expect(extractFeishuWhiteboardTokens("```mermaid\\nflowchart TD\\nA-->B\\n```")).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts
```

Expected:

- the new helper test file fails because the helper module does not exist
- the cache test fails because `FeishuDocIRAsset` does not yet define `reversible`
- the preview regression may already pass; keep it committed as a locked invariant

- [ ] **Step 3: Write the minimal implementation**

Extend the shared IR asset type:

```ts
export type FeishuDocIRReversibleState = "mermaid" | "unsupported" | "error";

export type FeishuDocIRReversibleSource = {
  format: "mermaid";
  source: string;
  sourceChecksum: string;
  ordinal: number;
  origin: "whiteboard_code_export" | "docs_ai_markdown";
  state: FeishuDocIRReversibleState;
  lastResolvedAt: string;
  lastError?: string;
};

export type FeishuDocIRAsset = {
  token: string;
  kind: "image" | "file" | "whiteboard" | "mindnote" | "diagram" | "unknown";
  mime: string;
  cacheKey: string;
  status: "missing" | "cached" | "error";
  localPath: string;
  absolutePath?: string;
  checksum: string;
  width?: number;
  height?: number;
  name?: string;
  error?: string;
  reversible?: FeishuDocIRReversibleSource;
};
```

Create the helper module:

```ts
import { createHash } from "node:crypto";

import type { FeishuDocIR, FeishuDocIRAsset, FeishuDocIRBlock } from "../../../../../shared/desktop-feishu-doc-ir";

export function computeReversibleSourceChecksum(source: string): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export function applyRecoveredMermaidWhiteboards(input: {
  ir: FeishuDocIR;
  recovered: Array<{
    whiteboardToken: string;
    format: "mermaid";
    source: string;
    origin: "whiteboard_code_export" | "docs_ai_markdown";
    resolvedAt: string;
  }>;
}): FeishuDocIR {
  const ordinalByToken = new Map(
    Object.values(input.ir.blocks)
      .filter((block) => isWhiteboardLike(block) && block.resource?.token)
      .map((block, index) => [block.resource!.token, index]),
  );
  const nextAssets = { ...input.ir.assets };

  for (const entry of input.recovered) {
    const asset = nextAssets[entry.whiteboardToken];
    if (!asset) {
      continue;
    }
    nextAssets[entry.whiteboardToken] = {
      ...asset,
      reversible: {
        format: "mermaid",
        source: entry.source,
        sourceChecksum: computeReversibleSourceChecksum(entry.source),
        ordinal: ordinalByToken.get(entry.whiteboardToken) ?? 0,
        origin: entry.origin,
        state: "mermaid",
        lastResolvedAt: entry.resolvedAt,
      },
    };
  }

  return {
    ...input.ir,
    assets: nextAssets,
  };
}

export function isReversibleMermaidAsset(asset: FeishuDocIRAsset | undefined): asset is FeishuDocIRAsset & {
  reversible: NonNullable<FeishuDocIRAsset["reversible"]>;
} {
  return asset?.reversible?.format === "mermaid" && asset.reversible.state === "mermaid";
}

function isWhiteboardLike(block: FeishuDocIRBlock): boolean {
  return block.type === "whiteboard" || block.type === "board" || block.type === "diagram";
}

export function parseMermaidFences(markdown: string): Array<{ start: number; end: number; source: string }> {
  const pattern = /```mermaid\s*\n([\s\S]*?)\n```/g;
  const fences: Array<{ start: number; end: number; source: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      source: match[1]?.trim() ?? "",
    });
  }

  return fences;
}
```

Update the source markdown codec to emit Mermaid fences when the block resource points at a reversible Mermaid asset:

```ts
import { isReversibleMermaidAsset } from "./feishu-doc-whiteboard-reversible";

function blockToSourceMarkdown(ir: FeishuDocIR, blockId: string): string {
  const block = ir.blocks[blockId];
  if (!block) {
    return "";
  }

  const reversibleAsset = block.resource?.token
    ? ir.assets[block.resource.token]
    : undefined;
  if (isReversibleMermaidAsset(reversibleAsset)) {
    return `\`\`\`mermaid\n${reversibleAsset.reversible.source}\n\`\`\``;
  }

  // keep the existing block rendering below this branch
}
```

Add the initial push-plan helper in the same module so later tasks can reuse it:

```ts
export function buildReversibleMermaidPushPlan(input: {
  draftMarkdown: string;
  baseIr: FeishuDocIR;
}):
  | { kind: "none" }
  | { kind: "blocked"; message: string }
  | {
      kind: "update";
      documentMarkdown: string;
      changedWhiteboards: Array<{
        whiteboardToken: string;
        source: string;
        sourceChecksum: string;
        ordinal: number;
      }>;
    } {
  const assets = Object.values(input.baseIr.assets)
    .filter(isReversibleMermaidAsset)
    .sort((left, right) => left.reversible.ordinal - right.reversible.ordinal);

  if (assets.length === 0) {
    return { kind: "none" };
  }

  const fences = parseMermaidFences(input.draftMarkdown);
  if (fences.length !== assets.length) {
    return {
      kind: "blocked",
      message: "当前文档的 Mermaid 白板数量已变化，暂不支持安全回写。已保留本地草稿。",
    };
  }

  let documentMarkdown = input.draftMarkdown;
  const changedWhiteboards: Array<{
    whiteboardToken: string;
    source: string;
    sourceChecksum: string;
    ordinal: number;
  }> = [];

  for (let index = fences.length - 1; index >= 0; index -= 1) {
    const fence = fences[index];
    const asset = assets[index];
    if (!asset || asset.reversible.ordinal !== index) {
      return {
        kind: "blocked",
        message: "当前文档的 Mermaid 白板顺序已变化，暂不支持安全回写。已保留本地草稿。",
      };
    }

    documentMarkdown = `${documentMarkdown.slice(0, fence.start)}<whiteboard token="${asset.token}" />${documentMarkdown.slice(fence.end)}`;

    const sourceChecksum = computeReversibleSourceChecksum(fence.source);
    if (sourceChecksum !== asset.reversible.sourceChecksum) {
      changedWhiteboards.unshift({
        whiteboardToken: asset.token,
        source: fence.source,
        sourceChecksum,
        ordinal: index,
      });
    }
  }

  return {
    kind: "update",
    documentMarkdown,
    changedWhiteboards,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts
```

Expected:

- helper tests PASS
- cache roundtrip PASS
- preview token extraction regression PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/shared/desktop-feishu-doc-ir.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-source-markdown-codec.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts
git commit -m "feat: add reversible feishu whiteboard metadata"
```

### Task 2: Add A Whiteboard Board-API Wrapper For Query And Mermaid Update

**Files:**
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the API wrapper test file:

```ts
import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { FeishuDocRemoteWhiteboardApi } from "./feishu-doc-remote-whiteboard-api";

describe("FeishuDocRemoteWhiteboardApi", () => {
  test("queries whiteboard code through the board nodes endpoint", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("GET");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/board/v1/whiteboards/wb_1/nodes");
        expect(target.searchParams.get("output_as")).toBe("code");

        return new Response(JSON.stringify({
          code: 0,
          data: {
            format: "mermaid",
            source: "flowchart TD\\nA-->B",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteWhiteboardApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.queryWhiteboardCode({ whiteboardToken: "wb_1" })).resolves.toEqual({
      format: "mermaid",
      source: "flowchart TD\\nA-->B",
    });
  });

  test("updates whiteboard Mermaid source with overwrite semantics", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("POST");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/board/v1/whiteboards/wb_1/nodes");
        expect(target.searchParams.get("idempotent_token")).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toEqual({
          input_format: "mermaid",
          source: "flowchart TD\\nA-->C",
          overwrite: true,
        });

        return new Response(JSON.stringify({
          code: 0,
          data: {
            result: "success",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteWhiteboardApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.updateWhiteboard({
      whiteboardToken: "wb_1",
      inputFormat: "mermaid",
      source: "flowchart TD\\nA-->C",
      overwrite: true,
    })).resolves.toEqual({ result: "success" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts
```

Expected: FAIL because the API wrapper file does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create the wrapper:

```ts
import { randomUUID } from "node:crypto";

import {
  DesktopFeishuOpenApiClient,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";

type FeishuDocRemoteWhiteboardApiDeps = {
  client: DesktopFeishuOpenApiClient;
  baseUrl: string;
  accessToken: (input?: { forceRefresh?: boolean }) => Promise<string>;
};

type WhiteboardCodeResponse = {
  format?: string;
  source?: string;
  code?: string;
};

type WhiteboardUpdateResponse = {
  result?: string;
};

export class FeishuDocRemoteWhiteboardApi {
  constructor(private readonly deps: FeishuDocRemoteWhiteboardApiDeps) {}

  async queryWhiteboardCode(input: { whiteboardToken: string }): Promise<{ format: string; source: string } | null> {
    const url = new URL(
      `${this.deps.baseUrl}/board/v1/whiteboards/${encodeURIComponent(input.whiteboardToken)}/nodes`,
    );
    url.searchParams.set("output_as", "code");

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.getJson<WhiteboardCodeResponse>(
      url.toString(),
      accessToken,
    ));

    const source = typeof response.source === "string"
      ? response.source.trim()
      : typeof response.code === "string"
        ? response.code.trim()
        : "";

    if (!source) {
      return null;
    }

    return {
      format: typeof response.format === "string" && response.format.trim() ? response.format.trim().toLowerCase() : "unknown",
      source,
    };
  }

  async updateWhiteboard(input: {
    whiteboardToken: string;
    inputFormat: "mermaid";
    source: string;
    overwrite: boolean;
  }): Promise<{ result: string }> {
    const url = new URL(
      `${this.deps.baseUrl}/board/v1/whiteboards/${encodeURIComponent(input.whiteboardToken)}/nodes`,
    );
    url.searchParams.set("idempotent_token", randomUUID());

    const response = await this.requestWithRefresh((accessToken) => this.deps.client.postAuthorizedJson<WhiteboardUpdateResponse>(
      url.toString(),
      accessToken,
      {
        input_format: input.inputFormat,
        source: input.source,
        overwrite: input.overwrite,
      },
    ));

    return {
      result: typeof response.result === "string" && response.result.trim() ? response.result.trim() : "success",
    };
  }

  private async requestWithRefresh<T>(request: (accessToken: string) => Promise<T>): Promise<T> {
    const run = async (forceRefresh: boolean) => request(await this.deps.accessToken({ forceRefresh }));

    try {
      return await run(false);
    } catch (error) {
      if (!isDesktopFeishuAccessTokenExpiredError(error)) {
        throw error;
      }
      return run(true);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts
```

Expected: PASS for whiteboard code query and Mermaid update request normalization.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts
git commit -m "feat: add feishu whiteboard remote api wrapper"
```

### Task 3: Recover Reversible Mermaid Whiteboards During Pull

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/composition/feishu.module.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the tree-source test helper to accept a whiteboard API stub, then add these tests:

```ts
function createSource(
  responses: Record<string, unknown>,
  options: {
    whiteboard?: Record<string, { format: string; source: string } | null | Error>;
  } = {},
  requests: RequestRecord[] = [],
) {
  return new FeishuDocTreeRemoteSource({
    reader: {
      getJson: async (url: string, accessToken: string) => {
        requests.push({ url, token: accessToken });
        const match = Object.entries(responses).find(([key]) => url.includes(key));
        if (!match) {
          throw new Error(`No mock for ${url}`);
        }
        const value = match[1];
        if (value instanceof Error) {
          throw value;
        }
        return value;
      },
    },
    whiteboardApi: {
      queryWhiteboardCode: async ({ whiteboardToken }) => {
        const value = options.whiteboard?.[whiteboardToken];
        if (value instanceof Error) {
          throw value;
        }
        return value ?? null;
      },
    },
  });
}

test("readDocumentBundle recovers Mermaid whiteboards into source markdown", async () => {
  const source = createSource({
    "/docx/v1/documents/doc_1/blocks": {
      items: [
        { block_id: "doc_1", block_type: 1, children: ["wb_1"] },
        { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
      ],
    },
    "/docx/v1/documents/doc_1": {
      document: { document_id: "doc_1", title: "Mermaid Doc", revision_id: 7 },
    },
  }, {
    whiteboard: {
      whiteboard_token_1: {
        format: "mermaid",
        source: "flowchart TD\\nA-->B",
      },
    },
  });

  const bundle = await source.readDocumentBundle("access", "doc_1");

  expect(bundle.content.markdown).toContain("```mermaid\\nflowchart TD\\nA-->B\\n```");
  expect(bundle.ir.assets.whiteboard_token_1?.reversible).toEqual(expect.objectContaining({
    format: "mermaid",
    origin: "whiteboard_code_export",
  }));
});

test("readDocumentBundle keeps token blocks when whiteboard recovery is unsupported", async () => {
  const source = createSource({
    "/docx/v1/documents/doc_1/blocks": {
      items: [
        { block_id: "doc_1", block_type: 1, children: ["wb_1"] },
        { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
      ],
    },
    "/docx/v1/documents/doc_1": {
      document: { document_id: "doc_1", title: "PlantUML Doc", revision_id: 7 },
    },
  }, {
    whiteboard: {
      whiteboard_token_1: {
        format: "plantuml",
        source: "@startuml\\nAlice -> Bob\\n@enduml",
      },
    },
  });

  const bundle = await source.readDocumentBundle("access", "doc_1");

  expect(bundle.content.markdown).toContain('<whiteboard token="whiteboard_token_1" />');
  expect(bundle.content.markdown).not.toContain("```mermaid");
  expect(bundle.ir.assets.whiteboard_token_1?.reversible).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts
```

Expected: FAIL because `FeishuDocTreeRemoteSource` does not yet accept a whiteboard API dependency and does not recover Mermaid whiteboards before generating source Markdown.

- [ ] **Step 3: Write the minimal implementation**

Update the tree source constructor and pull path:

```ts
type FeishuDocTreeRemoteSourceDeps = {
  reader: FeishuOpenApiReader;
  whiteboardApi?: {
    queryWhiteboardCode(input: { whiteboardToken: string }): Promise<{ format: string; source: string } | null>;
  };
};

export class FeishuDocTreeRemoteSource {
  constructor(private readonly deps: FeishuDocTreeRemoteSourceDeps) {}

  async readDocumentBundle(accessToken: string, docId: string): Promise<ResolvedFeishuDocxDocument> {
    try {
      return await this.readDocxDocument(accessToken, docId, "document_id");
    } catch (error) {
      if (!shouldFallbackToDocument(error)) {
        throw error;
      }

      return await this.readDocxDocument(accessToken, docId, "wiki_node_token");
    }
  }

  private async readDocxDocument(
    accessToken: string,
    docId: string,
    documentIdType: "document_id" | "wiki_node_token",
  ): Promise<ResolvedFeishuDocxDocument> {
    // keep the existing docx fetch code above this point

    const normalizedIr = normalizeFeishuDocBlocksToIR({
      documentId: resolvedDocId,
      title,
      revisionId: readRevisionId(document.revision_id),
      pulledAt,
      documentIdType,
      nodeToken: documentIdType === "wiki_node_token" ? docId : undefined,
      blocks,
    });

    const recoveredIr = await this.reverseWhiteboardsInIR({
      accessToken,
      ir: normalizedIr,
      pulledAt,
    });
    const markdown = feishuDocIRToSourceMarkdown(recoveredIr).trimEnd();

    return {
      ir: recoveredIr,
      source: {
        requestedDocId: docId,
        resolvedDocId,
        documentIdType,
        fetchedAt: pulledAt,
        sourceKind: "docx_remote_raw",
        document,
        blocks: rawBlocks,
      },
      content: {
        docId: resolvedDocId,
        title,
        markdown,
        length: markdown.length,
        totalLength: markdown.length,
        offset: 0,
        updatedAt: new Date().toISOString(),
        blocks,
        analysis: {
          riskyBlocks,
          riskySync: false,
          syncMode: null,
          riskyBlockMode: riskyBlocks.length > 0 ? "preserved" : "safe",
        },
      } as FeishuDocContentView,
    };
  }

  private async reverseWhiteboardsInIR(input: {
    accessToken: string;
    ir: FeishuDocIR;
    pulledAt: string;
  }): Promise<FeishuDocIR> {
    if (!this.deps.whiteboardApi) {
      return input.ir;
    }

    const tokens = [...new Set(Object.values(input.ir.blocks)
      .filter((block) => block.resource?.token && (block.type === "whiteboard" || block.type === "board" || block.type === "diagram"))
      .map((block) => block.resource!.token))];
    if (tokens.length === 0) {
      return input.ir;
    }

    const recovered = (await Promise.all(tokens.map(async (whiteboardToken) => {
      const result = await this.deps.whiteboardApi?.queryWhiteboardCode({ whiteboardToken });
      if (!result || result.format !== "mermaid") {
        return null;
      }
      return {
        whiteboardToken,
        format: "mermaid" as const,
        source: result.source,
        origin: "whiteboard_code_export" as const,
        resolvedAt: input.pulledAt,
      };
    }))).filter((value): value is NonNullable<typeof value> => value !== null);

    return applyRecoveredMermaidWhiteboards({
      ir: input.ir,
      recovered,
    });
  }
}
```

Wire the shared API instance in the module:

```ts
const whiteboardApi = new FeishuDocRemoteWhiteboardApi({
  client: openApiClient,
  baseUrl: "https://open.feishu.cn/open-apis",
  accessToken,
});

const remoteSource = new FeishuDocTreeRemoteSource({
  reader: {
    getJson: async <T>(url: string, _accessToken: string) => withDesktopFeishuDeveloperAccessTokenRetry(
      { store, openApiClient },
      ({ accessToken }) => openApiClient.getJson<T>(url, accessToken),
    ),
  },
  whiteboardApi,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts
```

Expected:

- tree-source Mermaid recovery tests PASS
- helper tests still PASS after tree-source integration

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/composition/feishu.module.ts
git commit -m "feat: recover mermaid whiteboards on pull"
```

### Task 4: Push Stable Mermaid Edits Back To The Original Whiteboard Tokens

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/composition/feishu.module.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these runtime tests:

```ts
test("pushWorkspaceDoc updates a pulled reversible Mermaid whiteboard through its original token", async () => {
  const snapshot = createSnapshot();
  const nodeToken = "wiki_node_1";
  const resolvedDocId = "doc_1";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-reversible-mermaid-push-"));
  let docsAiWrites = 0;
  const whiteboardUpdates: Array<{
    whiteboardToken: string;
    inputFormat: "mermaid";
    source: string;
    overwrite: boolean;
  }> = [];

  try {
    const runtime = createRuntimeWithContentSource(
      snapshot,
      {
        readDocumentContent: async () => createContentView(nodeToken, "Mermaid Doc", "```mermaid\\nflowchart TD\\nA-->B\\n```"),
        readDocumentBundle: async () => ({
          content: createContentView(nodeToken, "Mermaid Doc", "```mermaid\\nflowchart TD\\nA-->B\\n```"),
          ir: createDocumentIRWithReversibleMermaid({
            resolvedDocId,
            whiteboardToken: "wb_1",
            source: "flowchart TD\\nA-->B",
          }),
          source: createSourceSnapshot(nodeToken, "Mermaid Doc", resolvedDocId),
        }),
      },
      createWorkspaceQuery("ws_1", workspaceRoot),
      async (url, init) => {
        const target = new URL(String(url));

        if (target.pathname === `/open-apis/docs_ai/v1/documents/${nodeToken}`) {
          docsAiWrites += 1;
          expect(init?.method).toBe("PUT");
          expect(JSON.parse(String(init?.body)).content).toContain('<whiteboard token="wb_1" />');
          return new Response(JSON.stringify({ code: 0, data: { document: { revision_id: 9 }, result: "success", warnings: [] } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        throw new Error(`unexpected fetch url: ${String(url)}`);
      },
      {
        whiteboardApi: {
          queryWhiteboardCode: async () => ({ format: "mermaid", source: "flowchart TD\\nA-->B" }),
          updateWhiteboard: async (input) => {
            whiteboardUpdates.push(input);
            return { result: "success" };
          },
        },
      },
    );

    await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

    const pushed = await runtime.pushWorkspaceDoc({
      workspaceId: "ws_1",
      docId: nodeToken,
      markdown: "```mermaid\\nflowchart TD\\nA-->C\\n```\\n",
      force: true,
    });

    expect(docsAiWrites).toBe(1);
    expect(whiteboardUpdates).toEqual([{
      whiteboardToken: "wb_1",
      inputFormat: "mermaid",
      source: "flowchart TD\\nA-->C",
      overwrite: true,
    }]);
    expect(pushed.pushStatus).toBe("succeeded");
    expect(pushed.item.markdown).toContain("```mermaid\\nflowchart TD\\nA-->C\\n```");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("pushWorkspaceDoc blocks when reversible Mermaid whiteboards are reordered", async () => {
  const snapshot = createSnapshot();
  const nodeToken = "wiki_node_1";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-reversible-mermaid-blocked-"));
  let remoteWrites = 0;

  try {
    const runtime = createRuntimeWithContentSource(
      snapshot,
      {
        readDocumentContent: async () => createContentView(nodeToken, "Mermaid Doc", "```mermaid\\nflowchart TD\\nA-->B\\n```\\n\\n```mermaid\\nflowchart TD\\nC-->D\\n```"),
        readDocumentBundle: async () => ({
          content: createContentView(nodeToken, "Mermaid Doc", "```mermaid\\nflowchart TD\\nA-->B\\n```\\n\\n```mermaid\\nflowchart TD\\nC-->D\\n```"),
          ir: createDocumentIRWithTwoReversibleMermaidBoards(),
          source: createSourceSnapshot(nodeToken, "Mermaid Doc", "doc_1"),
        }),
      },
      createWorkspaceQuery("ws_1", workspaceRoot),
      async () => {
        remoteWrites += 1;
        throw new Error("remote write should not happen");
      },
      {
        whiteboardApi: {
          queryWhiteboardCode: async () => null,
          updateWhiteboard: async () => {
            remoteWrites += 1;
            return { result: "success" };
          },
        },
      },
    );

    await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

    const pushed = await runtime.pushWorkspaceDoc({
      workspaceId: "ws_1",
      docId: nodeToken,
      markdown: "```mermaid\\nflowchart TD\\nC-->D\\n```\\n\\n```mermaid\\nflowchart TD\\nA-->B\\n```",
      force: true,
    });

    expect(remoteWrites).toBe(0);
    expect(pushed.pushStatus).toBe("blocked");
    expect(pushed.message).toContain("Mermaid 白板顺序已变化");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
```

Add the runtime test helpers alongside `createDocumentIRWithText(...)`:

```ts
function createDocumentIRWithReversibleMermaid(input: {
  resolvedDocId: string;
  whiteboardToken: string;
  source: string;
}): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: input.resolvedDocId,
      title: "Mermaid Doc",
      revisionId: "7",
      rootBlockId: input.resolvedDocId,
      pulledAt: "2026-05-29T00:00:00.000Z",
      source: { documentIdType: "wiki_node_token", nodeToken: "wiki_node_1" },
    },
    blocks: {
      [input.resolvedDocId]: {
        id: input.resolvedDocId,
        type: "page",
        parentId: null,
        children: ["whiteboard_1"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      whiteboard_1: {
        id: "whiteboard_1",
        type: "whiteboard",
        parentId: input.resolvedDocId,
        children: [],
        editable: true,
        text: [],
        resource: { token: input.whiteboardToken, kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {
      [input.whiteboardToken]: {
        token: input.whiteboardToken,
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        reversible: {
          format: "mermaid",
          source: input.source,
          sourceChecksum: "sha256:original",
          ordinal: 0,
          origin: "whiteboard_code_export",
          state: "mermaid",
          lastResolvedAt: "2026-05-29T00:00:00.000Z",
        },
      },
    },
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

function createDocumentIRWithTwoReversibleMermaidBoards(): FeishuDocIR {
  const first = createDocumentIRWithReversibleMermaid({
    resolvedDocId: "doc_1",
    whiteboardToken: "wb_1",
    source: "flowchart TD\\nA-->B",
  });

  return {
    ...first,
    blocks: {
      ...first.blocks,
      doc_1: {
        ...first.blocks.doc_1,
        children: ["whiteboard_1", "whiteboard_2"],
      },
      whiteboard_2: {
        id: "whiteboard_2",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "wb_2", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {
      ...first.assets,
      wb_2: {
        token: "wb_2",
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        reversible: {
          format: "mermaid",
          source: "flowchart TD\\nC-->D",
          sourceChecksum: "sha256:second",
          ordinal: 1,
          origin: "whiteboard_code_export",
          state: "mermaid",
          lastResolvedAt: "2026-05-29T00:00:00.000Z",
        },
      },
    },
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
```

Expected: FAIL because the current runtime still routes Mermaid fences through docs v2 overwrite without preserving original whiteboard tokens and does not block reordered reversible Mermaid sequences.

- [ ] **Step 3: Write the minimal implementation**

Extend the helper with post-push settlement:

```ts
export function applyReversibleMermaidPushResult(input: {
  ir: FeishuDocIR;
  changedWhiteboards: Array<{
    whiteboardToken: string;
    source: string;
    sourceChecksum: string;
  }>;
  pushedAt: string;
}): FeishuDocIR {
  if (input.changedWhiteboards.length === 0) {
    return input.ir;
  }

  const changedByToken = new Map(input.changedWhiteboards.map((entry) => [entry.whiteboardToken, entry]));
  const nextAssets = Object.fromEntries(
    Object.entries(input.ir.assets).map(([token, asset]) => {
      const changed = changedByToken.get(token);
      if (!changed || !isReversibleMermaidAsset(asset)) {
        return [token, asset];
      }

      return [token, {
        ...asset,
        reversible: {
          ...asset.reversible,
          source: changed.source,
          sourceChecksum: changed.sourceChecksum,
          lastResolvedAt: input.pushedAt,
          state: "mermaid",
          lastError: undefined,
        },
      }];
    }),
  );

  return {
    ...input.ir,
    assets: nextAssets,
  };
}
```

Add the runtime interception before the existing push branches:

```ts
const reversiblePlan = buildReversibleMermaidPushPlan({
  draftMarkdown: item.markdown,
  baseIr,
});

if (reversiblePlan.kind === "blocked") {
  return {
    item,
    pushStatus: "blocked",
    message: reversiblePlan.message,
  };
}

if (reversiblePlan.kind === "update") {
  return await this.pushWorkspaceDocWithReversibleMermaid({
    workspaceId: input.workspaceId,
    docId: input.docId,
    pushTitle,
    fallbackItem: item,
    sourceState,
    baseIr,
    plan: reversiblePlan,
  });
}
```

Implement the new push helper in `desktop-feishu-doc-runtime.ts`:

```ts
private async pushWorkspaceDocWithReversibleMermaid(input: {
  workspaceId: string;
  docId: string;
  pushTitle: string;
  fallbackItem: FeishuDocContentView;
  sourceState: {
    document: FeishuDocSourceWorkspaceEntry | null;
    base: FeishuDocSourceWorkspaceEntry | null;
  } | null;
  baseIr: FeishuDocIR;
  plan: Extract<ReturnType<typeof buildReversibleMermaidPushPlan>, { kind: "update" }>;
}): Promise<{ item: FeishuDocContentView; pushStatus: "succeeded" | "blocked"; message?: string }> {
  if (!this.accessToken || !this.whiteboardApi) {
    return {
      item: input.fallbackItem,
      pushStatus: "blocked",
      message: "当前白板回写不可用，已保留本地草稿。",
    };
  }

  const documentIdType = input.sourceState?.document?.snapshot.documentIdType
    ?? input.sourceState?.base?.snapshot.documentIdType
    ?? input.baseIr.document.source.documentIdType
    ?? "document_id";
  const resolvedDocumentId = trimText(input.sourceState?.document?.snapshot.resolvedDocId)
    ?? trimText(input.sourceState?.base?.snapshot.resolvedDocId)
    ?? trimText(input.fallbackItem.resolvedDocId)
    ?? input.docId;
  const documentToken = documentIdType === "wiki_node_token" ? input.docId : resolvedDocumentId;

  const markdownApi = new FeishuDocRemoteMarkdownApi({
    client: new DesktopFeishuOpenApiClient({ fetch: this.fetchImpl }),
    baseUrl: FEISHU_OPEN_API_BASE_URL,
    accessToken: this.accessToken,
  });
  const whiteboardApi = this.whiteboardApi;

  try {
    await markdownApi.overwriteDocumentV2({
      documentToken,
      content: input.plan.documentMarkdown,
      format: "markdown",
      revisionId: -1,
    });

    for (const update of input.plan.changedWhiteboards) {
      await whiteboardApi.updateWhiteboard({
        whiteboardToken: update.whiteboardToken,
        inputFormat: "mermaid",
        source: update.source,
        overwrite: true,
      });
    }

    const pushedAt = new Date().toISOString();
    const settledIr = applyReversibleMermaidPushResult({
      ir: input.baseIr,
      changedWhiteboards: input.plan.changedWhiteboards,
      pushedAt,
    });
    const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
      workspaceId: input.workspaceId,
      docId: input.docId,
      title: input.pushTitle,
      markdown: input.fallbackItem.markdown,
      existing: input.fallbackItem,
      ir: settledIr,
      source: input.sourceState?.document?.snapshot ?? input.sourceState?.base?.snapshot ?? null,
    });

    return {
      item: settled,
      pushStatus: "succeeded",
    };
  } catch (error) {
    const normalizedError = normalizeFeishuDocPermissionError(error);
    return {
      item: input.fallbackItem,
      pushStatus: "blocked",
      message: normalizedError.message,
    };
  }
}
```

Extend the runtime deps and test helper plumbing so the runtime can receive either the real API or a stub:

```ts
type DesktopFeishuDocRuntimeDeps =
  | DesktopFeishuStorePort
  | DesktopFeishuDocTreeLoaderPort
  | {
      store: DesktopFeishuStorePort;
      loader: DesktopFeishuDocTreeLoaderPort;
      contentSource?: DesktopFeishuDocContentSourcePort;
      accessToken?: (input?: { forceRefresh?: boolean }) => Promise<string>;
      fetchImpl?: typeof fetch;
      docWorkspaceRuntime?: DesktopFeishuDocWorkspaceRuntimePort;
      remoteWriter?: FeishuDocRemoteWriterPort;
      workspaceQuery?: DesktopWorkspaceQueryPort;
      whiteboardApi?: {
        queryWhiteboardCode(input: { whiteboardToken: string }): Promise<{ format: string; source: string } | null>;
        updateWhiteboard(input: {
          whiteboardToken: string;
          inputFormat: "mermaid";
          source: string;
          overwrite: boolean;
        }): Promise<{ result: string }>;
      };
    };

function createRuntimeWithContentSource(
  snapshot: DesktopFeishuStoreSnapshot,
  contentSource: {
    readDocumentContent(accessToken: string, docId: string): Promise<FeishuDocContentView>;
    readDocumentBundle?(accessToken: string, docId: string): Promise<{
      content: FeishuDocContentView;
      ir: FeishuDocIR;
      source: FeishuDocSourceSnapshot;
    }>;
    readDocumentIR?(accessToken: string, docId: string): Promise<FeishuDocIR>;
  },
  workspaceQuery?: DesktopWorkspaceQueryPort,
  fetchImpl?: FetchLike,
  extraDeps?: {
    docWorkspaceRuntime?: {
      openDocument(input: { workspaceId: string; docId: string }): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }>;
      pullLatest(input: { workspaceId: string; docId: string; overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }>;
      pushDocument(input: { workspaceId: string; docId: string }): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }>;
    };
    remoteWriter?: { createDocument(input: { accessToken: string; title: string }): Promise<{ documentId: string; title: string }> };
    accessToken?: (input?: { forceRefresh?: boolean }) => Promise<string>;
    whiteboardApi?: {
      queryWhiteboardCode(input: { whiteboardToken: string }): Promise<{ format: string; source: string } | null>;
      updateWhiteboard(input: {
        whiteboardToken: string;
        inputFormat: "mermaid";
        source: string;
        overwrite: boolean;
      }): Promise<{ result: string }>;
    };
  },
) {
  return new DesktopFeishuDocRuntime({
    store: createStore(snapshot),
    loader: {
      loadRoot: async () => { throw new Error("not used"); },
      loadBranch: async () => { throw new Error("not used"); },
    },
    contentSource,
    accessToken: extraDeps?.accessToken ?? (async () => "access"),
    workspaceQuery,
    ...(extraDeps?.docWorkspaceRuntime ? { docWorkspaceRuntime: extraDeps.docWorkspaceRuntime } : {}),
    ...(extraDeps?.remoteWriter ? { remoteWriter: extraDeps.remoteWriter } : {}),
    ...(extraDeps?.whiteboardApi ? { whiteboardApi: extraDeps.whiteboardApi } : {}),
    ...(fetchImpl ? { fetchImpl: fetchImpl as typeof fetch } : {}),
  });
}
```

Wire the API into the runtime constructor path:

```ts
return new DesktopFeishuDocRuntime({
  store,
  loader: treeLoader,
  contentSource: remoteSource,
  accessToken,
  workspaceQuery: services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
  whiteboardApi,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-ir-workspace-cache.test.ts
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-preview-support.test.ts
```

Expected:

- all reversible Mermaid helper, board API, pull, push, cache, and preview regression suites PASS
- reordered or count-mismatched Mermaid sequences block before any remote write

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-whiteboard-reversible.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/composition/feishu.module.ts
git commit -m "feat: push reversible mermaid whiteboards safely"
```
