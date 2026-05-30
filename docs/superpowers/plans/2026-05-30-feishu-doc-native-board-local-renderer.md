# Feishu Doc Native Board Local Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Feishu board snapshot-image preview with a local native board renderer so pulled `board / whiteboard / diagram / mindnote` blocks always render as local elements, never as remote screenshots, while keeping the preview surface single-layer and borderless.

**Architecture:** Split the change into two stable layers. Pull-time services fetch and persist raw whiteboard node snapshots alongside document IR so the renderer never depends on `download_as_image`. Renderer-side code consumes only normalized local node snapshots and draws a single SVG/DOM canvas for inline and modal preview. Unsupported board nodes stay inside the same canvas as local placeholder elements instead of falling back to remote preview images.

**Tech Stack:** TypeScript, Bun tests, React + Ant Design, desktop Feishu RPC bridge, Feishu board OpenAPI, existing Feishu doc IR and workspace cache, local SVG-based preview components

---

## File Map

- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-board-snapshot.ts`
  - pure helpers for raw board node normalization, snapshot metadata, supported-shape extraction, and unsupported-node placeholder generation
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-board-snapshot.test.ts`
  - focused coverage for raw-node normalization and local placeholder generation
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-board-preview.tsx`
  - inline native board preview renderer with no card shell
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-board-node-renderer.tsx`
  - low-level SVG node and connector renderer for supported board nodes
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-board-preview.test.tsx`
  - rendering coverage for supported nodes and unsupported placeholders
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.ts`
  - add `output_as=raw` query support for native board node snapshots
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts`
  - lock raw-node request and response normalization
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts`
  - add shared native-board snapshot types and replace preview-image contracts on `FeishuDocContentView`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts`
  - collect native board raw-node snapshots during pull and keep Mermaid reversal separate from native-board rendering
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
  - verify pull stores native board snapshots without requesting snapshot images
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
  - persist native board snapshots on current document views and remove runtime download-as-image preview generation
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
  - lock the regression that board preview data survives pull and is not downgraded to preview URLs
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts`
  - remove the renderer-facing whiteboard preview image query path
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts`
  - update service catalog coverage after removing preview-image query wiring
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts`
  - delete whiteboard preview-image RPC contracts that are no longer used
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/desktop-feishu.ts`
  - remove desktop bridge helpers for whiteboard preview URLs
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts`
  - stop exporting whiteboard preview-image fetch helpers
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx`
  - consume persisted native board snapshots instead of running a separate preview-image fetch effect
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-visual-editor.tsx`
  - replace whiteboard preview image props with native board snapshot props
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.tsx`
  - dispatch all board-like blocks to the new native board preview, remove image-shell board rendering, and keep Mermaid/mindmap branches separate
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-diagram-preview-modal.tsx`
  - host native board canvases inside the existing zoom/pan/export modal without extra framing chrome
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.render.test.tsx`
  - cover board blocks rendering as local elements instead of preview images
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css`
  - remove board-image shell styles and add single-layer native board canvas styling for inline and modal preview
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/board-block.tsx`
  - either delete the legacy snapshot-image-only board helper or convert it into a thin wrapper around the new native renderer
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/board-block-preview.test.tsx`
  - update or remove stale snapshot-image assertions

### Task 1: Add Shared Native Board Snapshot Types And Raw Node API Support

**Files:**
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-board-snapshot.ts`
- Create: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-board-snapshot.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-board-snapshot.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts`

- [ ] **Step 1: Write the failing tests**

Add raw-node query coverage and snapshot normalization coverage before changing runtime behavior. Lock these cases:

- `queryWhiteboardRawNodes({ whiteboardToken })` sends `GET /board/v1/whiteboards/:token/nodes?output_as=raw`
- the API wrapper accepts the current `readEnvelope(...).data` shape and returns a normalized list of nodes, not preview URLs
- normalization keeps node ids, node types, local bounds, style payload, text payload, connector routing, and unsupported node markers
- unsupported raw nodes remain in the snapshot with `supported = false`, rather than being dropped

- [ ] **Step 2: Introduce shared native board snapshot contracts**

Extend `desktop-feishu.ts` with a renderer-safe snapshot shape, for example:

```ts
export type FeishuDocBoardNodeSnapshot = {
  id: string;
  kind: "shape" | "connector" | "text" | "unsupported";
  shapeType?: string;
  text?: string;
  bounds: { x: number; y: number; width: number; height: number };
  style: Record<string, unknown>;
  routing?: {
    points: Array<{ x: number; y: number }>;
    startArrow?: string;
    endArrow?: string;
  };
  supported: boolean;
  unsupportedReason?: string;
  rawType: string;
};

export type FeishuDocBoardSnapshot = {
  token: string;
  blockType: "board" | "whiteboard" | "diagram" | "mindnote";
  nodes: FeishuDocBoardNodeSnapshot[];
  viewport: { width: number; height: number; minX: number; minY: number };
  supportedNodeCount: number;
  unsupportedNodeCount: number;
  pulledAt: string;
};
```

Replace preview-image-oriented fields on `FeishuDocContentView` with a board snapshot map keyed by whiteboard token.

- [ ] **Step 3: Add raw node query support to the whiteboard API wrapper**

Implement a new `queryWhiteboardRawNodes(...)` path in `feishu-doc-remote-whiteboard-api.ts` that:

- calls the same `/board/v1/whiteboards/:token/nodes` endpoint with `output_as=raw`
- retries on access-token expiry exactly like the current code/code-update methods
- returns parsed nodes through `normalizeFeishuDocBoardSnapshot(...)`
- does not mix Mermaid code-query logic with native raw-node logic

### Task 2: Persist Native Board Snapshots During Pull And Remove Snapshot-Image Generation

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

- [ ] **Step 1: Add failing pull/runtime tests**

Add regression coverage for these two cases:

- a pulled document with native `board` blocks stores `FeishuDocBoardSnapshot` entries on the returned/persisted document view
- the runtime no longer produces `whiteboardPreviewUrls` or any `download_as_image`-derived preview contract for local rendering

- [ ] **Step 2: Enrich pull output with raw board snapshots**

Update `FeishuDocTreeRemoteSource` so pull now has two independent board enrichments:

- reversible Mermaid recovery for eligible whiteboards
- native board raw-node snapshot fetch for all `board / whiteboard / diagram / mindnote` tokens that remain board-like in the local source

Keep the board snapshot fetch best-effort and reuse the existing rate-limit backoff logic, but persist partial snapshots for the tokens that succeed. Failed tokens still get diagnostics; they do not trigger remote image fallback.

- [ ] **Step 3: Persist board snapshots on the current document view**

Thread the new snapshots through `DesktopFeishuDocRuntime` into the stored document snapshot so the renderer gets everything it needs from the current document payload. Remove or dead-code-eliminate the runtime method that downloads preview images for normal board viewing.

### Task 3: Build A Single-Layer Native Board Renderer

**Files:**
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-board-preview.tsx`
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-board-node-renderer.tsx`
- Create: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-board-preview.test.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-diagram-preview-modal.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css`
- Test: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-board-preview.test.tsx`

- [ ] **Step 1: Write renderer tests first**

Cover the first supported node set and the no-fallback rule:

- `composite_shape` renders as local SVG elements with text and local styling
- `connector` renders as local SVG paths with arrows and routed turning points
- unsupported nodes render dashed labeled placeholders inside the same SVG canvas
- inline preview root does not include image-shell / card / frame classes
- modal preview reuses the same board renderer and receives zoom/pan/export support from the existing diagram modal chrome

- [ ] **Step 2: Implement the board SVG renderer**

Create a pure renderer pipeline:

- `feishu-doc-board-preview.tsx` computes the board viewport and mounts one SVG root
- `feishu-doc-board-node-renderer.tsx` renders supported nodes
- text comes from board node payload, not from OCR or screenshot overlays
- unsupported nodes become visible placeholders anchored to the original bounds

Keep the root DOM minimal:

- one preview root
- one SVG canvas
- no nested card shell
- no border unless the outer document layout supplies one

- [ ] **Step 3: Integrate modal interactions without reintroducing wrapper chrome**

Wire the existing modal toolbar to the native board canvas:

- default drag-to-pan
- zoom in/out
- fit to viewport
- export SVG

Do not create a second board-only modal frame. Reuse `feishu-doc-diagram-preview-modal.tsx` and keep the board canvas itself visually bare.

### Task 4: Switch Local Preview To Native Board Snapshots Everywhere

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-visual-editor.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.render.test.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/board-block.tsx`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/board-block-preview.test.tsx`
- Test: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.render.test.tsx`

- [ ] **Step 1: Add failing integration tests**

Lock these renderer-level regressions:

- board-like tags in local markdown render through `FeishuDocBoardPreview`, not `FeishuDocsPreviewImage`
- no inline board preview requests preview URLs from a side effect
- a document containing both Mermaid blocks and native board blocks renders Mermaid through Mermaid and boards through native board snapshots

- [ ] **Step 2: Replace board-image props with board-snapshot props**

Remove `whiteboardPreviewUrls`, `whiteboardPreviewFocusRects`, and `whiteboardPreviewErrors` from the visual editor/local preview path. Replace them with the persisted native board snapshot map and diagnostics.

Update `docs-workbench.tsx` so it no longer fires a separate preview-image fetch effect after pull. The board preview data must come from the pulled document state only.

- [ ] **Step 3: Delete the board image rendering branch**

In `feishu-docs-local-preview.tsx`, route every board-like block to the new native board preview component. Remove the board-specific `FeishuDocsPreviewImage` branch and its framing classes. Convert or remove the legacy `board-block.tsx` helper so there is only one rendering path left.

### Task 5: Retire Whiteboard Snapshot-Image Plumbing And Validate The End-To-End Flow

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/desktop-feishu.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts`
- Modify: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts`
- Test: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.render.test.tsx`

- [ ] **Step 1: Remove dead preview-image APIs**

Delete renderer-facing whiteboard preview URL queries from:

- `desktop-feishu-service.ts`
- `desktop-rpc.ts`
- `desktop-feishu.ts`
- `feishu.ts`

If any internal debugging use still needs `download_as_image`, keep it behind a non-renderer helper and out of the document preview path.

- [ ] **Step 2: Clean up styling so boards are truly borderless**

Remove the CSS rules that create the recurring double-container feel for boards:

- `plain-media`
- `is-board-preview`
- image-shell / image-frame wrappers that only exist for screenshots

Add only the minimal native board canvas rules needed for layout, hit area, and modal fit. The visual design target is “canvas dropped directly into the document flow,” not “image inside a card.”

- [ ] **Step 3: Run end-to-end validation**

Validate these user flows after implementation:

- pull a native Feishu board document and confirm inline local preview is rendered by local elements
- click to enlarge and confirm the same board renderer appears in the modal with drag/zoom/export tools
- pull a document containing unsupported board nodes and confirm placeholders render locally instead of snapshot images
- verify Mermaid round-trip documents still render through the Mermaid path and are not misrouted into the native board renderer

## Validation Commands

Run the focused checks that map to the new plan:

```bash
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-board-snapshot.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-whiteboard-api.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-tree-remote-source.test.ts
bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/__test__/feishu-doc-board-preview.test.tsx
bun test apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.render.test.tsx
```
