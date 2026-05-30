# Feishu Doc Permission Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Feishu whiteboard pull permission failures to users, preserve structured pull diagnostics for the current document, and add a document-scoped permission self-check that explains why local content still falls back to preview images.

**Architecture:** Keep the change centered on two new diagnostic contracts: pull-time whiteboard recovery diagnostics and an on-demand permission inspection view. Pull continues to be best-effort, but `FeishuDocTreeRemoteSource` now records classified failures instead of swallowing them, `DesktopFeishuDocRuntime` persists the latest pull diagnostics into the current document snapshot, and `DesktopFeishuService` exposes a read-only permission inspection query built from the current token, current document IR, and direct OpenAPI probes.

**Tech Stack:** TypeScript, Bun tests, React + Ant Design, desktop Feishu RPC bridge, Feishu docx/wiki/board OpenAPI, existing workspace markdown and IR caches

---

## File Map

- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.ts`
  - pure helpers for classifying Feishu pull failures, building pull-time whiteboard recovery summaries, and extracting inspectable whiteboard tokens from IR
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.test.ts`
  - focused coverage for permission/auth/network/unknown classification and summary building
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.ts`
  - direct OpenAPI probing for current-doc wiki/docx/whiteboard read access
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.test.ts`
  - probe normalization tests for wiki/docx/whiteboard self-check results
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.ts`
  - JWT payload decoding helper for actual granted access-token scopes
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.test.ts`
  - token-claim decoding coverage for scope extraction and malformed token fallback
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-permission-inspect-modal.tsx`
  - current-document permission self-check modal component
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-permission-inspect-modal.test.tsx`
  - rendering coverage for the permission self-check modal
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts`
  - add shared diagnostic and inspection view types, plus optional persisted diagnostics on `FeishuDocContentView`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts`
  - collect whiteboard recovery diagnostics during pull instead of swallowing all errors
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
  - lock the regression that forbidden board code export degrades to token blocks with structured diagnostics
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
  - thread pull diagnostics through the workspace pull path and persist `latestPull` diagnostics into the stored document view
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
  - verify workspace pull returns diagnostics and stores them on the current document
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts`
  - expose a current-document permission self-check query using the current token, the current document IR, and the latest pull diagnostics snapshot
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts`
  - service-level coverage for the new permission inspection query
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/abstraction/ports/desktop-feishu.ports.ts`
  - add the new document permission inspection query to the desktop Feishu query port
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts`
  - register the new RPC request/response contract
- Modify: `apps/desktop/MaomiAgent/src/bun/index.ts`
  - wire the new query through the Bun-side RPC host
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/desktop-feishu.ts`
  - expose the new bridge method to the renderer
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/electrobun-window-bridge.ts`
  - register the window bridge entry for permission inspection
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts`
  - add a renderer-facing helper for current-document permission self-check
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx`
  - show a single warning after degraded pulls and add the permission self-check action plus modal state
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx`
  - string-level regression coverage for the new bridge helper and workbench wiring
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css`
  - add safe-top, 80vh-limited styling for the new permission self-check modal
- Modify: `apps/desktop/MaomiAgent/src/mainview/i18n/zh-CN.ts`
  - add Chinese copy for pull warnings and self-check modal fields
- Modify: `apps/desktop/MaomiAgent/src/mainview/i18n/en-US.ts`
  - add English copy for pull warnings and self-check modal fields
- Modify: `apps/desktop/MaomiAgent/src/mainview/i18n/feishu-docs-translations.test.ts`
  - verify the new keys resolve instead of echoing raw keys

### Task 1: Add Shared Diagnostic Types And Classification Helpers

**Files:**
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the helper test file with explicit classification and summary coverage:

```ts
import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";
import {
  classifyFeishuDocDiagnosticError,
  extractInspectableWhiteboardTokens,
  summarizeWhiteboardRecoveryDiagnostics,
} from "./feishu-doc-permission-diagnostics";

function createWhiteboardIR(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "doc_1",
      title: "Demo",
      revisionId: "7",
      rootBlockId: "doc_1",
      pulledAt: "2026-05-30T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      doc_1: {
        id: "doc_1",
        type: "page",
        parentId: null,
        children: ["wb_1", "wb_2", "wb_3", "wb_4"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      wb_1: {
        id: "wb_1",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_1", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      wb_2: {
        id: "wb_2",
        type: "diagram",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_2", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      wb_3: {
        id: "wb_3",
        type: "board",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_3", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      wb_4: {
        id: "wb_4",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_1", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {},
    integrity: {
      contentHash: "content",
      rawHash: "raw",
    },
  };
}

describe("feishu-doc-permission-diagnostics", () => {
  test("maps confirmed permission, auth, network, and unknown failures conservatively", () => {
    expect(classifyFeishuDocDiagnosticError(new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 403 (code 2890005): forbidden",
      status: 403,
      code: 2890005,
      responseText: JSON.stringify({ code: 2890005, msg: "forbidden" }),
    }))).toEqual(expect.objectContaining({
      category: "permission",
      code: 2890005,
    }));

    expect(classifyFeishuDocDiagnosticError(new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 401 (code 20006): access token expired",
      status: 401,
      code: 20006,
    }))).toEqual(expect.objectContaining({
      category: "auth",
      code: 20006,
    }));

    expect(classifyFeishuDocDiagnosticError(new Error("fetch failed"))).toEqual(
      expect.objectContaining({ category: "network" }),
    );

    expect(classifyFeishuDocDiagnosticError(new Error("unexpected payload"))).toEqual(
      expect.objectContaining({ category: "unknown" }),
    );
  });

  test("summarizes recovery fallback counts without inflating permission numbers", () => {
    const summary = summarizeWhiteboardRecoveryDiagnostics({
      recoveredCount: 1,
      entries: [
        {
          token: "board_1",
          stage: "whiteboard_code",
          code: 2890005,
          message: "forbidden",
          category: "permission",
          fallbackApplied: true,
        },
        {
          token: "board_2",
          stage: "whiteboard_code",
          code: undefined,
          message: "fetch failed",
          category: "network",
          fallbackApplied: true,
        },
      ],
    });

    expect(summary).toEqual({
      status: "partial",
      recoveredCount: 1,
      fallbackCount: 2,
      permissionDeniedCount: 1,
      documentPermissionDenied: false,
      entries: expect.any(Array),
    });
  });

  test("extracts at most three distinct inspectable whiteboard tokens from IR", () => {
    expect(extractInspectableWhiteboardTokens(createWhiteboardIR(), 3)).toEqual([
      "board_1",
      "board_2",
      "board_3",
    ]);
  });
});
```

Extend the shared document view types in `desktop-feishu.ts` so later tasks can compile against real names:

```ts
export type FeishuDocPermissionDiagnosticCategory = "permission" | "auth" | "network" | "unknown";

export type FeishuDocPermissionDiagnosticStage = "wiki" | "docx" | "whiteboard_code";

export type FeishuDocPermissionDiagnosticEntryView = {
  token?: string
  stage: FeishuDocPermissionDiagnosticStage
  code?: number
  message: string
  category: FeishuDocPermissionDiagnosticCategory
  fallbackApplied: boolean
}

export type FeishuDocWhiteboardRecoveryDiagnosticsView = {
  status: "ok" | "partial" | "blocked"
  recoveredCount: number
  fallbackCount: number
  permissionDeniedCount: number
  documentPermissionDenied: boolean
  entries: FeishuDocPermissionDiagnosticEntryView[]
}

export type FeishuDocPullDiagnosticsView = {
  whiteboardRecovery?: FeishuDocWhiteboardRecoveryDiagnosticsView
}

export type FeishuDocStoredDiagnosticsView = {
  latestPull?: FeishuDocPullDiagnosticsView
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.test.ts
```

Expected:

- the new helper test file fails because `feishu-doc-permission-diagnostics.ts` does not exist
- if you pre-added shared types, the test still fails because the helper exports are not implemented

- [ ] **Step 3: Write the minimal implementation**

Create the helper module and finish the shared diagnostic types:

```ts
import type {
  FeishuDocPermissionDiagnosticCategory,
  FeishuDocPermissionDiagnosticEntryView,
  FeishuDocWhiteboardRecoveryDiagnosticsView,
} from "../../../../../shared/desktop-feishu";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import {
  DesktopFeishuOpenApiError,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";

const CONFIRMED_PERMISSION_CODES = new Set<number>([2890005, 131006, 1770032]);
const NETWORK_PATTERNS = ["fetch failed", "network", "timeout", "timed out", "econnreset", "econnrefused"];

export function classifyFeishuDocDiagnosticError(error: unknown): {
  category: FeishuDocPermissionDiagnosticCategory;
  code?: number;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown Feishu error");
  const normalized = message.toLowerCase();
  const code = error instanceof DesktopFeishuOpenApiError ? error.code : undefined;

  if (isDesktopFeishuAccessTokenExpiredError(error)) {
    return { category: "auth", code, message };
  }
  if (code != null && CONFIRMED_PERMISSION_CODES.has(code)) {
    return { category: "permission", code, message };
  }
  if (NETWORK_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return { category: "network", code, message };
  }
  return { category: "unknown", code, message };
}

export function summarizeWhiteboardRecoveryDiagnostics(input: {
  recoveredCount: number;
  entries: FeishuDocPermissionDiagnosticEntryView[];
}): FeishuDocWhiteboardRecoveryDiagnosticsView {
  const fallbackCount = input.entries.filter((entry) => entry.fallbackApplied).length;
  const permissionDeniedCount = input.entries.filter((entry) => entry.category === "permission").length;
  return {
    status: fallbackCount === 0 ? "ok" : input.recoveredCount > 0 ? "partial" : "blocked",
    recoveredCount: input.recoveredCount,
    fallbackCount,
    permissionDeniedCount,
    documentPermissionDenied: input.entries.some((entry) =>
      entry.category === "permission" && (entry.stage === "wiki" || entry.stage === "docx")
    ),
    entries: input.entries,
  };
}

export function extractInspectableWhiteboardTokens(ir: FeishuDocIR, limit = 3): string[] {
  const ordered = Object.values(ir.blocks)
    .filter((block) =>
      (block.type === "whiteboard" || block.type === "board" || block.type === "diagram")
      && block.resource?.token
    )
    .map((block) => block.resource!.token);
  return [...new Set(ordered)].slice(0, limit);
}
```

Finish the shared types in `desktop-feishu.ts`:

```ts
export type FeishuDocPermissionProbeView = {
  ok: boolean
  category: FeishuDocPermissionDiagnosticCategory
  code?: number
  message: string
}

export type FeishuDocPermissionScopeStatusView = {
  scope: string
  granted: boolean
}

export type FeishuDocPermissionInspectWhiteboardView = {
  token: string
  probeResult: FeishuDocPermissionProbeView
}

export type FeishuDocPermissionInspectView = {
  checkedAt: string
  identity: {
    authStatus: FeishuDeveloperAuthStatus
    lastAuthorizedAt?: string
    accessTokenExpiresAt?: string
    keyScopes: FeishuDocPermissionScopeStatusView[]
  }
  document: {
    wiki: FeishuDocPermissionProbeView
    docx: FeishuDocPermissionProbeView
  }
  whiteboards: FeishuDocPermissionInspectWhiteboardView[]
  latestPull?: FeishuDocPullDiagnosticsView
}

export type FeishuDocContentView = {
  docId: string
  resolvedDocId?: string
  title: string
  markdown: string
  length: number
  totalLength: number
  offset: number
  message?: string
  analysis: FeishuDocContentAnalysis
  cache?: FeishuDocCacheStateView
  diagnostics?: FeishuDocStoredDiagnosticsView
}

export type FeishuDocWorkspacePullResult = {
  item: FeishuDocContentView
  pullStatus: "created" | "updated" | "noop"
  message?: string
  diagnostics?: FeishuDocPullDiagnosticsView
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.test.ts
```

Expected:

- all tests in `feishu-doc-permission-diagnostics.test.ts` pass

- [ ] **Step 5: Commit**

```bash
git add \
  apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-diagnostics.test.ts
git commit -m "feat: add feishu doc permission diagnostic primitives"
```

### Task 2: Collect Pull Diagnostics And Persist The Latest Pull Summary

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add one remote-source regression and one workspace-runtime regression.

In `feishu-doc-tree-remote-source.test.ts`:

```ts
import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";

test("readDocumentBundle records permission fallback when whiteboard code export is forbidden", async () => {
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
      whiteboard_token_1: new DesktopFeishuOpenApiError({
        message: "Feishu API HTTP error 403 (code 2890005): forbidden",
        status: 403,
        code: 2890005,
        responseText: JSON.stringify({ code: 2890005, msg: "forbidden" }),
      }),
    },
  });

  const bundle = await source.readDocumentBundle("access", "doc_1");

  expect(bundle.content.markdown).toContain('<whiteboard blockId="wb_1" token="whiteboard_token_1" />');
  expect(bundle.diagnostics?.whiteboardRecovery).toEqual(expect.objectContaining({
    status: "blocked",
    permissionDeniedCount: 1,
    fallbackCount: 1,
  }));
  expect(bundle.diagnostics?.whiteboardRecovery?.entries).toEqual([
    expect.objectContaining({
      token: "whiteboard_token_1",
      stage: "whiteboard_code",
      code: 2890005,
      category: "permission",
      fallbackApplied: true,
    }),
  ]);
});
```

In `desktop-feishu-doc-runtime.test.ts`:

```ts
test("pullWorkspaceDoc returns and persists latest pull diagnostics for whiteboard fallback", async () => {
  const snapshot = createSnapshot();
  const nodeToken = "node_1";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-permission-pull-"));

  try {
    const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
    const runtime = createRuntimeWithContentSource(
      snapshot,
      {
        readDocumentBundle: async () => ({
          content: createContentView("doc_1", "Remote Doc", '<whiteboard blockId="wb_1" token="whiteboard_token_1" />'),
          ir: createDocumentIRWithWhiteboard("doc_1", "Remote Doc", "whiteboard_token_1"),
          source: createSourceSnapshot(nodeToken, "Remote Doc", "doc_1"),
          diagnostics: {
            whiteboardRecovery: {
              status: "blocked",
              recoveredCount: 0,
              fallbackCount: 1,
              permissionDeniedCount: 1,
              documentPermissionDenied: false,
              entries: [{
                token: "whiteboard_token_1",
                stage: "whiteboard_code",
                code: 2890005,
                message: "forbidden",
                category: "permission",
                fallbackApplied: true,
              }],
            },
          },
        }),
      },
      workspaceQuery,
    );

    const pullResult = await runtime.pullWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

    expect(pullResult.diagnostics?.whiteboardRecovery?.permissionDeniedCount).toBe(1);
    expect(pullResult.item.diagnostics?.latestPull?.whiteboardRecovery?.entries[0]?.code).toBe(2890005);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
```

Expected:

- the new remote-source assertions fail because `readDocumentBundle(...)` does not yet return `diagnostics`
- the workspace-runtime test fails because `pullWorkspaceDoc(...)` neither returns nor persists `latestPull` diagnostics

- [ ] **Step 3: Write the minimal implementation**

Extend the remote-source bundle contract and whiteboard recovery path:

```ts
type ResolvedFeishuDocxDocument = {
  content: FeishuDocContentView;
  ir: FeishuDocIR;
  source: FeishuDocSourceSnapshot;
  diagnostics?: FeishuDocPullDiagnosticsView;
};

private async reverseWhiteboardsInIR(input: {
  ir: FeishuDocIR;
  pulledAt: string;
}): Promise<{ ir: FeishuDocIR; diagnostics?: FeishuDocPullDiagnosticsView }> {
  if (!this.whiteboardApi) {
    return { ir: input.ir };
  }

  const attempts = await Promise.all(whiteboardTokens.map(async (whiteboardToken) => {
    try {
      const result = await this.whiteboardApi?.queryWhiteboardCode({ whiteboardToken });
      if (!result) {
        return { recovered: null, diagnostic: null };
      }
      const format = result.format.trim().toLowerCase();
      const source = result.source.trim();
      if (!source || (format && format !== "mermaid" && format !== "unknown") || (format !== "mermaid" && !looksLikeMermaidSource(source))) {
        return { recovered: null, diagnostic: null };
      }
      return {
        recovered: {
          whiteboardToken,
          format: "mermaid" as const,
          source,
          origin: "whiteboard_code_export" as const,
          resolvedAt: input.pulledAt,
        },
        diagnostic: null,
      };
    } catch (error) {
      const classified = classifyFeishuDocDiagnosticError(error);
      return {
        recovered: null,
        diagnostic: {
          token: whiteboardToken,
          stage: "whiteboard_code" as const,
          code: classified.code,
          message: classified.message,
          category: classified.category,
          fallbackApplied: true,
        },
      };
    }
  }));

  const recovered = attempts.flatMap((item) => item.recovered ? [item.recovered] : []);
  const entries = attempts.flatMap((item) => item.diagnostic ? [item.diagnostic] : []);
  const ir = recovered.length > 0
    ? applyRecoveredMermaidWhiteboards({ ir: input.ir, recovered })
    : input.ir;

  return {
    ir,
    diagnostics: entries.length > 0
      ? { whiteboardRecovery: summarizeWhiteboardRecoveryDiagnostics({ recoveredCount: recovered.length, entries }) }
      : undefined,
  };
}
```

Thread diagnostics through the workspace runtime and persist them onto the current document snapshot:

```ts
type FeishuWorkspaceRemoteContent = {
  ir: FeishuDocIR;
  markdown: string;
  title: string;
  workspaceRoot: string;
  requestedDocId?: string;
  resolvedDocId?: string;
  documentIdType?: "document_id" | "wiki_node_token";
  source?: FeishuDocSourceSnapshot;
  diagnostics?: FeishuDocPullDiagnosticsView;
};

private async readWorkspaceRemoteContentFromIR(...): Promise<FeishuWorkspaceRemoteContent | null> {
  const bundle = await this.contentSourceWithIR?.readDocumentBundle?.(accessToken, input.docId);
  if (!bundle) {
    return null;
  }
  return {
    ir: bundle.ir,
    markdown: bundle.content.markdown,
    title: bundle.content.title,
    workspaceRoot,
    requestedDocId: input.docId,
    resolvedDocId: bundle.content.resolvedDocId ?? bundle.content.docId,
    source: bundle.source,
    diagnostics: bundle.diagnostics,
  };
}

private async applyWorkspaceRemoteContent(...): Promise<FeishuDocWorkspacePullResult> {
  const nextItem = currentDraftState?.document
    ? await this.writeWorkspaceDoc({
        workspaceId: input.workspaceId,
        docId: input.docId,
        title: input.remote.title,
        markdown: input.remote.markdown,
        baselineMarkdown: input.remote.markdown,
        lastPulledAt: new Date().toISOString(),
        diagnostics: input.remote.diagnostics,
      }) ?? this.createDocContentView({
        docId: input.docId,
        resolvedDocId: input.remote.resolvedDocId,
        title: input.remote.title,
        markdown: input.remote.markdown,
        diagnostics: input.remote.diagnostics ? { latestPull: input.remote.diagnostics } : undefined,
      })
    : this.createDocContentView({
        docId: input.docId,
        resolvedDocId: input.remote.resolvedDocId,
        title: input.remote.title,
        markdown: input.remote.markdown,
        cache: this.buildWorkspaceCacheState(...),
        diagnostics: input.remote.diagnostics ? { latestPull: input.remote.diagnostics } : undefined,
      });

  return {
    item: nextItem,
    pullStatus,
    diagnostics: input.remote.diagnostics,
  };
}
```

Add an optional `diagnostics` parameter to `createDocContentView(...)` and `writeWorkspaceDoc(...)`, and preserve existing diagnostics on non-pull code paths.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
```

Expected:

- both suites pass, including the new forbidden-whiteboard regression and the persisted `latestPull` diagnostics check

- [ ] **Step 5: Commit**

```bash
git add \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
git commit -m "feat: persist feishu pull diagnostics"
```

### Task 3: Add A Current-Document Permission Self-Check Query

**Files:**
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.test.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/abstraction/ports/desktop-feishu.ports.ts`
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/index.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/desktop-feishu.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/electrobun-window-bridge.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create the inspector helper tests:

```ts
import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";
import { inspectFeishuDocPermissions } from "./feishu-doc-permission-inspector";

describe("inspectFeishuDocPermissions", () => {
  test("probes wiki, docx, and up to three whiteboards with classified results", async () => {
    const calls: string[] = [];
    const result = await inspectFeishuDocPermissions({
      client: {
        getJson: async (url: string) => {
          calls.push(url);
          if (url.includes("/wiki/v2/spaces/get_node")) {
            throw new DesktopFeishuOpenApiError({
              message: "Feishu API HTTP error 400 (code 131006): permission denied",
              status: 400,
              code: 131006,
            });
          }
          if (url.includes("/docx/v1/documents/doc_1")) {
            return { document: { document_id: "doc_1", title: "Doc" } };
          }
          if (url.includes("board_ok")) {
            return { data: { format: "mermaid", source: "flowchart TD\\nA-->B" } };
          }
          throw new DesktopFeishuOpenApiError({
            message: "Feishu API HTTP error 403 (code 2890005): forbidden",
            status: 403,
            code: 2890005,
          });
        },
      } as any,
      accessToken: "access-token",
      docId: "doc_1",
      whiteboardTokens: ["board_ok", "board_forbidden", "board_forbidden_2", "board_forbidden_3"],
    });

    expect(result.document.wiki).toEqual(expect.objectContaining({
      ok: false,
      category: "permission",
      code: 131006,
    }));
    expect(result.document.docx).toEqual(expect.objectContaining({
      ok: true,
      category: "unknown",
    }));
    expect(result.whiteboards).toHaveLength(3);
    expect(result.whiteboards[0]).toEqual(expect.objectContaining({
      token: "board_ok",
      probeResult: expect.objectContaining({ ok: true }),
    }));
    expect(result.whiteboards[1]?.probeResult).toEqual(expect.objectContaining({
      ok: false,
      category: "permission",
      code: 2890005,
    }));
  });
});
```

Create the token-claims helper tests:

```ts
import { describe, expect, test } from "bun:test";

import { readDesktopFeishuAccessTokenScopes } from "./desktop-feishu-access-token-claims";

function createJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
}

describe("readDesktopFeishuAccessTokenScopes", () => {
  test("reads the space-delimited scope claim from the JWT payload", () => {
    const token = createJwt({
      scope: "board:whiteboard:node:read docx:document:readonly wiki:node:read",
    });

    expect(readDesktopFeishuAccessTokenScopes(token)).toEqual([
      "board:whiteboard:node:read",
      "docx:document:readonly",
      "wiki:node:read",
    ]);
  });

  test("returns an empty array for malformed tokens", () => {
    expect(readDesktopFeishuAccessTokenScopes("broken")).toEqual([]);
  });
});
```

Add a service-level test in `desktop-feishu-service.catalog.test.ts`:

```ts
test("inspectWorkspaceDocPermissions reports current token scopes, current document probes, and latest pull summary", async () => {
  const snapshot = createStoreSnapshot();
  snapshot.state.smartAssistant = {
    ...snapshot.state.smartAssistant,
    enabled: true,
    authStatus: "authorized",
    accessTokenExpiresAt: "2026-05-30T10:00:00.000Z",
    lastAuthorizedAt: "2026-05-30T08:00:00.000Z",
  };
  snapshot.developerToken.accessToken = createJwt({
    scope: "board:whiteboard:node:read docx:document:readonly wiki:node:read",
  });

  const service = createService(snapshot, {
    docRuntime: {
      openDocIR: async () => ({
        source: "cache",
        ir: createInspectIR(["board_1", "board_2", "board_3", "board_4"]),
      }),
      getWorkspaceDocLocalDraft: async () => createDocContentView({
        docId: "doc_1",
        title: "Demo",
        markdown: "# Demo",
        diagnostics: {
          latestPull: {
            whiteboardRecovery: {
              status: "partial",
              recoveredCount: 1,
              fallbackCount: 1,
              permissionDeniedCount: 1,
              documentPermissionDenied: false,
              entries: [{
                token: "board_2",
                stage: "whiteboard_code",
                code: 2890005,
                message: "forbidden",
                category: "permission",
                fallbackApplied: true,
              }],
            },
          },
        },
      }),
    },
    openApiClient: createInspectOpenApiClient(),
  });

  const result = await service.inspectWorkspaceDocPermissions({ workspaceId: "ws_1", docId: "doc_1" });

  expect(result.identity.keyScopes).toEqual([
    { scope: "board:whiteboard:node:read", granted: true },
    { scope: "docx:document:readonly", granted: true },
    { scope: "wiki:node:read", granted: true },
  ]);
  expect(result.whiteboards).toHaveLength(3);
  expect(result.latestPull?.whiteboardRecovery?.permissionDeniedCount).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts
```

Expected:

- the new helper suites fail because the helper modules do not exist
- the service catalog test fails because `inspectWorkspaceDocPermissions(...)` does not exist and the helper `createService(...)` does not accept overrides yet

- [ ] **Step 3: Write the minimal implementation**

Create the token-claim helper:

```ts
export function readDesktopFeishuAccessTokenScopes(token: string): string[] {
  const payload = token.split(".")[1];
  if (!payload) {
    return [];
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as {
      scope?: string;
    };
    return typeof decoded.scope === "string"
      ? decoded.scope.split(" ").map((item) => item.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}
```

Create the direct probe helper:

```ts
import type { FeishuDocPermissionInspectView } from "../../../../../shared/desktop-feishu";
import { classifyFeishuDocDiagnosticError } from "./feishu-doc-permission-diagnostics";

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";

async function probe(getter: () => Promise<unknown>) {
  try {
    await getter();
    return { ok: true, category: "unknown" as const, message: "ok" };
  } catch (error) {
    const classified = classifyFeishuDocDiagnosticError(error);
    return {
      ok: false,
      category: classified.category,
      code: classified.code,
      message: classified.message,
    };
  }
}

export async function inspectFeishuDocPermissions(input: {
  client: { getJson<T>(url: string, accessToken: string): Promise<T> };
  accessToken: string;
  docId: string;
  whiteboardTokens: string[];
}): Promise<Pick<FeishuDocPermissionInspectView, "document" | "whiteboards">> {
  const wikiUrl = `${FEISHU_OPEN_API_BASE_URL}/wiki/v2/spaces/get_node?token=${encodeURIComponent(input.docId)}`;
  const docxUrl = `${FEISHU_OPEN_API_BASE_URL}/docx/v1/documents/${encodeURIComponent(input.docId)}`;

  const [wiki, docx, whiteboards] = await Promise.all([
    probe(() => input.client.getJson(wikiUrl, input.accessToken)),
    probe(() => input.client.getJson(docxUrl, input.accessToken)),
    Promise.all(input.whiteboardTokens.slice(0, 3).map(async (token) => ({
      token,
      probeResult: await probe(() => input.client.getJson(
        `${FEISHU_OPEN_API_BASE_URL}/board/v1/whiteboards/${encodeURIComponent(token)}/nodes?output_as=code`,
        input.accessToken,
      )),
    }))),
  ]);

  return {
    document: { wiki, docx },
    whiteboards,
  };
}
```

Add the new service query and bridge types.

In `desktop-feishu.ports.ts`:

```ts
import type {
  FeishuDocPermissionInspectView,
  FeishuWorkspaceDocInput,
} from "../../../../../shared/desktop-feishu";

export interface DesktopFeishuQueryPort {
  // existing methods...
  inspectWorkspaceDocPermissions(input: FeishuWorkspaceDocInput): Promise<FeishuDocPermissionInspectView>;
}
```

In `desktop-feishu-service.ts`:

```ts
async inspectWorkspaceDocPermissions(input: FeishuWorkspaceDocInput): Promise<FeishuDocPermissionInspectView> {
  const snapshot = await this.store.read();
  const hydrated = this.hydrateState(snapshot.state as FeishuStateView);
  const accessToken = snapshot.developerToken.accessToken.trim();
  if (!accessToken) {
    throw new Error("当前没有可用的飞书授权，请先重新授权。");
  }

  const [{ ir }, draft] = await Promise.all([
    this.docRuntime.openDocIR(input),
    this.docRuntime.getWorkspaceDocLocalDraft(input),
  ]);
  const grantedScopes = new Set(readDesktopFeishuAccessTokenScopes(accessToken));
  const probes = await inspectFeishuDocPermissions({
    client: this.openApiClient,
    accessToken,
    docId: input.docId,
    whiteboardTokens: extractInspectableWhiteboardTokens(ir, 3),
  });

  return {
    checkedAt: new Date().toISOString(),
    identity: {
      authStatus: hydrated.smartAssistant.authStatus,
      lastAuthorizedAt: hydrated.smartAssistant.lastAuthorizedAt,
      accessTokenExpiresAt: hydrated.smartAssistant.accessTokenExpiresAt,
      keyScopes: [
        "board:whiteboard:node:read",
        "docx:document:readonly",
        "wiki:node:read",
      ].map((scope) => ({ scope, granted: grantedScopes.has(scope) })),
    },
    document: probes.document,
    whiteboards: probes.whiteboards,
    latestPull: draft.diagnostics?.latestPull,
  };
}
```

Expose the query through RPC and renderer helpers:

```ts
// shared/desktop-rpc.ts
inspectDesktopFeishuWorkspaceDocPermissions: {
  params: { workspaceId: string; docId: string };
  response: FeishuDocPermissionInspectView;
};

// bun/index.ts
inspectDesktopFeishuWorkspaceDocPermissions: ({ workspaceId, docId }) =>
  resolveDesktopFeishuQueryPort(host).inspectWorkspaceDocPermissions({ workspaceId, docId }),

// mainview/lib/desktop-feishu.ts
export function inspectDesktopFeishuWorkspaceDocPermissions(
  workspaceId: string,
  docId: string,
): Promise<FeishuDocPermissionInspectView> {
  return getDesktopFeishuBridge().inspectDesktopFeishuWorkspaceDocPermissions(workspaceId, docId);
}

// mainview/lib/feishu.ts
export async function inspectFeishuWorkspaceDocPermissions(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
): Promise<FeishuDocPermissionInspectView> {
  return inspectDesktopFeishuWorkspaceDocPermissions(workspaceId, docId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts
```

Expected:

- all three suites pass
- the service catalog suite now proves the query returns actual token-scope booleans, current document probe results, and the persisted latest-pull summary

- [ ] **Step 5: Commit**

```bash
git add \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-permission-inspector.test.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-access-token-claims.test.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts \
  apps/desktop/MaomiAgent/src/bun/modules/feishu/abstraction/ports/desktop-feishu.ports.ts \
  apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts \
  apps/desktop/MaomiAgent/src/bun/index.ts \
  apps/desktop/MaomiAgent/src/mainview/lib/desktop-feishu.ts \
  apps/desktop/MaomiAgent/src/mainview/lib/electrobun-window-bridge.ts \
  apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts
git commit -m "feat: add feishu doc permission inspect query"
```

### Task 4: Surface Pull Warnings And The Permission Inspect Modal In The Docs Workbench

**Files:**
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-permission-inspect-modal.tsx`
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-permission-inspect-modal.test.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css`
- Modify: `apps/desktop/MaomiAgent/src/mainview/i18n/zh-CN.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/i18n/en-US.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/i18n/feishu-docs-translations.test.ts`
- Test: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-permission-inspect-modal.test.tsx`
- Test: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx`
- Test: `apps/desktop/MaomiAgent/src/mainview/i18n/feishu-docs-translations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create a renderer test for the modal component:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { FeishuDocPermissionInspectView } from "../../../../../shared/desktop-feishu";
import { FeishuDocPermissionInspectModal } from "../feishu-doc-permission-inspect-modal";

const inspectResult: FeishuDocPermissionInspectView = {
  checkedAt: "2026-05-30T09:00:00.000Z",
  identity: {
    authStatus: "authorized",
    lastAuthorizedAt: "2026-05-30T08:00:00.000Z",
    accessTokenExpiresAt: "2026-05-30T10:00:00.000Z",
    keyScopes: [
      { scope: "board:whiteboard:node:read", granted: true },
      { scope: "docx:document:readonly", granted: true },
      { scope: "wiki:node:read", granted: false },
    ],
  },
  document: {
    wiki: { ok: false, category: "permission", code: 131006, message: "permission denied" },
    docx: { ok: true, category: "unknown", message: "ok" },
  },
  whiteboards: [
    { token: "board_1", probeResult: { ok: false, category: "permission", code: 2890005, message: "forbidden" } },
  ],
  latestPull: {
    whiteboardRecovery: {
      status: "partial",
      recoveredCount: 1,
      fallbackCount: 1,
      permissionDeniedCount: 1,
      documentPermissionDenied: false,
      entries: [],
    },
  },
};

describe("FeishuDocPermissionInspectModal", () => {
  test("renders identity, document probes, whiteboard probes, and latest pull summary", () => {
    render(
      <FeishuDocPermissionInspectModal
        open
        loading={false}
        error=""
        result={inspectResult}
        t={(key: string) => key}
        onClose={() => {}}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText("飞书页.文档.权限检查.标题")).toBeInTheDocument();
    expect(screen.getByText("board:whiteboard:node:read")).toBeInTheDocument();
    expect(screen.getByText("131006")).toBeInTheDocument();
    expect(screen.getByText("board_1")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });
});
```

Update the existing string regression in `docs-workbench-ir-loading.test.tsx`:

```ts
expect(workbench).toContain('import { FeishuDocPermissionInspectModal } from "./feishu-doc-permission-inspect-modal"');
expect(workbench).toContain("inspectFeishuWorkspaceDocPermissions(props.baseUrl, props.workspaceId, currentDoc.docId)");
expect(workbench).toContain('props.t("飞书页.文档.按钮.权限自检")');
expect(workbench).toContain('notificationCenter.warning({');
expect(workbench).toContain('whiteboardRecovery?.permissionDeniedCount');
```

Extend `feishu-docs-translations.test.ts`:

```ts
test("resolves permission diagnostics copy instead of echoing raw keys", () => {
  const zh = createTranslator("zh-CN");
  const en = createTranslator("en-US");

  expect(zh("飞书页.文档.按钮.权限自检")).toBe("权限自检");
  expect(zh("飞书页.文档.反馈.拉取降级.权限.标题")).toBe("部分白板已回退为预览图");
  expect(en("飞书页.文档.按钮.权限自检")).toBe("Permission Check");
  expect(en("飞书页.文档.反馈.拉取降级.授权.标题")).toContain("authorization");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-permission-inspect-modal.test.tsx
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx
bun test apps/desktop/MaomiAgent/src/mainview/i18n/feishu-docs-translations.test.ts
```

Expected:

- the modal test fails because `feishu-doc-permission-inspect-modal.tsx` does not exist
- the string regression fails because the workbench does not yet wire the permission self-check or pull warning logic
- the translation test fails because the new keys are missing

- [ ] **Step 3: Write the minimal implementation**

Create the modal component with a title-bar-safe AntD modal:

```tsx
import { Alert, Button, Descriptions, Modal, Space, Tag, Typography } from "antd";
import type { FeishuDocPermissionInspectView } from "../../../../shared/desktop-feishu";
import type { FeishuTranslate as Translate } from "../types";

const { Text } = Typography;

type Props = {
  open: boolean;
  loading: boolean;
  error: string;
  result: FeishuDocPermissionInspectView | null;
  t: Translate;
  onClose: () => void;
  onRetry: () => void;
};

export function FeishuDocPermissionInspectModal(props: Props) {
  return (
    <Modal
      rootClassName="feishu-doc-permission-inspect-modal"
      open={props.open}
      title={props.t("飞书页.文档.权限检查.标题")}
      footer={[
        <Button key="retry" loading={props.loading} onClick={props.onRetry}>
          {props.t("飞书页.文档.权限检查.按钮.重新检查")}
        </Button>,
        <Button key="close" type="primary" onClick={props.onClose}>
          {props.t("危险操作.弹窗.取消")}
        </Button>,
      ]}
      onCancel={props.onClose}
      width={880}
      destroyOnClose
    >
      <div className="feishu-doc-permission-inspect-layout">
        {props.error ? (
          <Alert type="error" showIcon message={props.error} />
        ) : null}
        {props.result ? (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={props.t("飞书页.文档.权限检查.字段.授权状态")}>
                {props.result.identity.authStatus}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.文档.权限检查.字段.Token到期")}>
                {props.result.identity.accessTokenExpiresAt || "-"}
              </Descriptions.Item>
            </Descriptions>
            <Space wrap>
              {props.result.identity.keyScopes.map((item) => (
                <Tag key={item.scope} color={item.granted ? "green" : "default"}>
                  {item.scope}
                </Tag>
              ))}
            </Space>
            <div className="feishu-doc-permission-inspect-section">
              <Text strong>{props.t("飞书页.文档.权限检查.分组.文档探测")}</Text>
            </div>
            <div className="feishu-doc-permission-inspect-section">
              <Text strong>{props.t("飞书页.文档.权限检查.分组.白板探测")}</Text>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
```

Wire the workbench warning and self-check action:

```tsx
import {
  inspectFeishuWorkspaceDocPermissions,
  // existing imports...
} from "../../../lib/feishu";
import { FeishuDocPermissionInspectModal } from "./feishu-doc-permission-inspect-modal";

const [permissionInspectOpen, setPermissionInspectOpen] = useState(false);
const [permissionInspectLoading, setPermissionInspectLoading] = useState(false);
const [permissionInspectError, setPermissionInspectError] = useState("");
const [permissionInspectResult, setPermissionInspectResult] = useState<FeishuDocPermissionInspectView | null>(null);
const lastPullDiagnosticNoticeRef = useRef("");

const loadPermissionInspect = useCallback(async () => {
  if (!currentDoc?.docId) {
    return;
  }
  setPermissionInspectLoading(true);
  setPermissionInspectError("");
  try {
    const result = await inspectFeishuWorkspaceDocPermissions(props.baseUrl, props.workspaceId, currentDoc.docId);
    setPermissionInspectResult(result);
  } catch (error) {
    setPermissionInspectError(error instanceof Error ? error.message : String(error));
  } finally {
    setPermissionInspectLoading(false);
  }
}, [currentDoc?.docId, props.baseUrl, props.workspaceId]);

const noticePullDiagnostics = useCallback((diagnostics?: FeishuDocPullDiagnosticsView) => {
  const whiteboardRecovery = diagnostics?.whiteboardRecovery;
  if (!whiteboardRecovery || whiteboardRecovery.fallbackCount === 0) {
    return;
  }
  const hasAuth = whiteboardRecovery.entries.some((entry) => entry.category === "auth");
  const hasPermission = whiteboardRecovery.permissionDeniedCount > 0;
  const noticeKey = `${currentDoc?.docId}:${whiteboardRecovery.status}:${whiteboardRecovery.fallbackCount}:${whiteboardRecovery.permissionDeniedCount}:${hasAuth}`;
  if (lastPullDiagnosticNoticeRef.current === noticeKey) {
    return;
  }
  lastPullDiagnosticNoticeRef.current = noticeKey;
  notificationCenter.warning({
    title: hasAuth
      ? props.t("飞书页.文档.反馈.拉取降级.授权.标题")
      : hasPermission
        ? props.t("飞书页.文档.反馈.拉取降级.权限.标题")
        : props.t("飞书页.文档.反馈.拉取降级.通用.标题"),
    description: hasAuth
      ? props.t("飞书页.文档.反馈.拉取降级.授权.描述")
      : hasPermission
        ? props.t("飞书页.文档.反馈.拉取降级.权限.描述", { 数量: whiteboardRecovery.permissionDeniedCount })
        : props.t("飞书页.文档.反馈.拉取降级.通用.描述"),
    duration: 5.5,
  });
}, [currentDoc?.docId, props.t]);

const handlePullDoc = useCallback(async () => {
  // existing code...
  const result = await pullFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId);
  commitEditSessionBaseline(result.item.markdown);
  setCurrentDoc(result.item);
  setDraft(result.item.markdown);
  lastSavedDraftRef.current = result.item.markdown;
  noticePullDiagnostics(result.diagnostics ?? result.item.diagnostics?.latestPull);
  // existing code...
}, [/* existing deps */, noticePullDiagnostics]);
```

Add the button next to the existing toolbar actions:

```tsx
<Button
  className="feishu-docs-toolbar-action"
  icon={<ApartmentOutlined />}
  disabled={!currentDoc?.docId || saveState === "pulling" || saveState === "pushing"}
  onClick={() => {
    setPermissionInspectOpen(true);
    void loadPermissionInspect();
  }}
>
  {props.t("飞书页.文档.按钮.权限自检")}
</Button>
```

Mount the modal at the bottom of the workbench:

```tsx
<FeishuDocPermissionInspectModal
  open={permissionInspectOpen}
  loading={permissionInspectLoading}
  error={permissionInspectError}
  result={permissionInspectResult}
  t={props.t}
  onClose={() => setPermissionInspectOpen(false)}
  onRetry={() => {
    void loadPermissionInspect();
  }}
/>
```

Add safe-top modal styles in `page.css`:

```css
.feishu-doc-permission-inspect-modal {
  --feishu-doc-permission-inspect-safe-top: 72px;
  --feishu-doc-permission-inspect-safe-bottom: 16px;
}

.feishu-doc-permission-inspect-modal .ant-modal {
  top: var(--feishu-doc-permission-inspect-safe-top);
  padding-bottom: var(--feishu-doc-permission-inspect-safe-bottom);
}

.feishu-doc-permission-inspect-modal .ant-modal-content {
  display: flex;
  max-height: min(80vh, calc(100vh - var(--feishu-doc-permission-inspect-safe-top) - var(--feishu-doc-permission-inspect-safe-bottom)));
  flex-direction: column;
  overflow: hidden;
}

.feishu-doc-permission-inspect-modal .ant-modal-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
}

.feishu-doc-permission-inspect-layout {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
}
```

Add i18n keys in both language files for:

```ts
"飞书页.文档.按钮.权限自检"
"飞书页.文档.反馈.拉取降级.权限.标题"
"飞书页.文档.反馈.拉取降级.权限.描述"
"飞书页.文档.反馈.拉取降级.授权.标题"
"飞书页.文档.反馈.拉取降级.授权.描述"
"飞书页.文档.反馈.拉取降级.通用.标题"
"飞书页.文档.反馈.拉取降级.通用.描述"
"飞书页.文档.权限检查.标题"
"飞书页.文档.权限检查.按钮.重新检查"
"飞书页.文档.权限检查.字段.授权状态"
"飞书页.文档.权限检查.字段.Token到期"
"飞书页.文档.权限检查.分组.文档探测"
"飞书页.文档.权限检查.分组.白板探测"
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-permission-inspect-modal.test.tsx
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx
bun test apps/desktop/MaomiAgent/src/mainview/i18n/feishu-docs-translations.test.ts
```

Expected:

- the modal test passes
- the workbench string regression proves the new bridge helper, warning logic, and inspect button are wired
- the translation suite passes with the new copy instead of raw keys

- [ ] **Step 5: Commit**

```bash
git add \
  apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-permission-inspect-modal.tsx \
  apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-permission-inspect-modal.test.tsx \
  apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx \
  apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx \
  apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css \
  apps/desktop/MaomiAgent/src/mainview/i18n/zh-CN.ts \
  apps/desktop/MaomiAgent/src/mainview/i18n/en-US.ts \
  apps/desktop/MaomiAgent/src/mainview/i18n/feishu-docs-translations.test.ts
git commit -m "feat: surface feishu permission diagnostics in docs workbench"
```

## Self-Review

- Spec coverage:
  - Pull-time diagnostics: covered by Task 2.
  - Conservative classification of permission/auth/network/unknown: covered by Task 1.
  - Current-document permission self-check: covered by Task 3.
  - User-visible pull warning and modal UI: covered by Task 4.
  - i18n and modal safe-top requirements: covered by Task 4.
- Placeholder scan:
  - no `TODO`, `TBD`, or “similar to above” placeholders remain.
- Type consistency:
  - shared type names stay consistent across all tasks:
    - `FeishuDocPullDiagnosticsView`
    - `FeishuDocPermissionInspectView`
    - `FeishuDocStoredDiagnosticsView`
    - `inspectWorkspaceDocPermissions(...)`

