# Feishu Doc Native Board Local Renderer Design

Date: 2026-05-30
Status: Draft for review
Owner: Codex

## Context

The current Feishu document local preview has two very different board-like paths:

- Mermaid round-trip documents can be restored into local Mermaid source and rendered as local SVG elements.
- Native Feishu `board` / `whiteboard` / `diagram` blocks still fall back to preview-image rendering through downloaded whiteboard snapshots.

This creates two product problems:

1. The same "board" concept behaves differently depending on how the remote content was originally created.
2. Native board preview still appears as screenshot-style media, often wrapped in extra image/card containers and borders that do not match the expected board experience.

Recent live inspection confirmed that native whiteboards are not limited to screenshot export:

- `GET /board/v1/whiteboards/:token/nodes?output_as=raw` returns full node trees
- the returned node trees already contain enough geometry and style data for local read-only rendering
- the currently observed documents include at least:
  - `composite_shape`
  - `connector`
  - text-bearing node payloads

For example, the document currently cached as `KwIkwQw98io9B4kSMXOcsKGHnyg` is not a Mermaid-roundtrip document. Its local Markdown and baseline contain native board tags such as `<board blockId="..." token="..." />`, and the remote raw source resolves to board nodes instead of Mermaid source. This is why it still previews as an image today.

The user requirement is to normalize the behavior:

- a board is always a board in local preview
- pulled native boards must no longer render as remote snapshot images
- board preview must not introduce extra card shells, borders, or nested framed containers around the board itself
- unsupported board content may degrade to structured local placeholders, but must never degrade to screenshot images

## Goals

- Render pulled native Feishu boards as local elements instead of remote snapshot images.
- Remove board preview dependence on whiteboard screenshot URLs in the end-user preview path.
- Use a single-layer board canvas with no extra image card shell around the rendered board.
- Reuse the same renderer for inline preview and enlarged preview.
- Keep native board rendering read-only in this phase.
- Preserve layout when unsupported node types appear by rendering local placeholders at their original positions.

## Non-Goals

- This work does not add native board editing.
- This work does not change push semantics or board writeback behavior.
- This work does not attempt to reverse arbitrary native boards into Mermaid.
- This work does not support every Feishu whiteboard node type in phase one.
- This work does not redesign Mermaid or Mermaid mindmap preview behavior.
- This work does not keep screenshot fallback as a user-visible backup path.

## User Constraints

These constraints are explicit and mandatory for this design:

1. Board preview must not add an extra card-like wrapper around the board surface.
   - No extra border shell.
   - No extra rounded framed container around the rendered board.
   - No extra decorative background panel created by the board component itself.

2. Pulled board content must never render as remote snapshot SVG or image.
   - Not inline.
   - Not in the enlarged modal.
   - Not as an automatic fallback when local rendering is incomplete.

3. Unsupported board content may only degrade to local structured placeholders rendered inside the same local board canvas.

## Approaches Considered

### A. Continue using whiteboard snapshot images

Keep the current `download_as_image` based rendering path and improve styling only.

Pros:

- smallest change
- low implementation risk

Cons:

- violates the user requirement outright
- board remains a screenshot, not a local element rendering
- enlarged preview cannot share the same semantic renderer as inline preview
- image-shell/card-shell styling problems remain structural, not cosmetic

### B. Convert native boards into Mermaid and reuse the existing Mermaid preview path

Attempt to infer Mermaid from native node trees and let the current Mermaid renderer display them.

Pros:

- reuses existing preview surfaces
- reduces new renderer code

Cons:

- loses exact coordinates, connectors, branching geometry, and styling
- many native boards are not Mermaid-derived at all
- visually incorrect output is likely for free layout diagrams

### C. Render native boards directly from Feishu raw nodes into a local read-only SVG renderer

Pull `output_as=raw`, cache node snapshots locally, and render them as local SVG elements.

Pros:

- matches the board model that Feishu actually returns
- keeps coordinates and geometry stable
- avoids screenshot fallback entirely
- supports inline preview and enlarged preview with the same renderer

Cons:

- requires a new renderer path
- requires node-type by node-type rollout

## Recommendation

Choose Approach C.

The user requirement is not "make board screenshots prettier". It is "treat boards as boards locally". That requires a local element renderer driven by raw board nodes.

This recommendation keeps the scope contained:

- read-only only
- phase-one node subset only
- no push changes
- no Mermaid conversion layer
- no screenshot fallback path

## Proposed Design

### 1. Pull native board node snapshots and cache them for preview

The pull flow should continue to build document IR as it does today, but native board-like blocks must gain a second local preview input:

- document IR keeps the board token identity
- pull additionally queries `output_as=raw` for each `board`, `whiteboard`, `diagram`, and `mindnote` token
- the returned node tree is cached locally as preview metadata

The local Markdown stays unchanged in this phase:

- native board blocks continue to appear as `<board token="..."/>` or equivalent native tags
- node trees do not get serialized into user-editable Markdown

This keeps the editor model stable while letting preview stop depending on snapshots.

### 2. Replace screenshot-backed board preview with a local board renderer

Board preview should no longer use:

- `whiteboardPreviewUrls`
- `whiteboardPreviewFocusRects`
- `FeishuDocsPreviewImage(...)`
- `download_as_image` as a normal preview data source

Instead:

- inline preview looks up `whiteboardNodeSnapshots[token]`
- if a snapshot is present, render a local SVG board surface directly
- if the snapshot is missing or failed to load, render a local board-unavailable placeholder block
- do not render an image in either case

This applies equally to:

- inline preview
- enlarged preview modal

The enlarged preview must reuse the same board renderer and only add interaction tools such as:

- pan
- zoom in / zoom out
- fit to canvas
- export SVG

### 3. Board preview surface must be single-layer and non-card-like

The board component itself must render only the board canvas layer.

It must not add:

- an image frame shell
- a card-like panel
- decorative border wrappers
- nested media containers from the generic image preview path

Allowed structure:

- a single board root container
- a direct SVG board surface
- modal interaction chrome outside the board canvas, such as the floating toolbar

Not allowed:

- passing native boards through `plain-media is-image is-board-preview`
- wrapping board output in generic image shells or image frame components
- reusing image preview CSS classes for board layout

### 4. Phase-one supported node types

Phase one supports the smallest node set already observed in live documents:

- `composite_shape`
  - first supported subtype: `round_rect`
  - preserve:
    - x / y
    - width / height
    - border color
    - fill color
    - border width / style
    - text
    - text alignment
    - font size / weight where available
- `connector`
  - support:
    - `straight`
    - `curve`
    - attached start / end objects
    - turning points
    - arrow style
    - connector stroke style
- text-bearing node payloads
  - if a future live document returns separate text nodes, render them as positioned text

This phase targets flowcharts and box diagrams first, because those are the currently painful cases for the user.

### 5. Unsupported node behavior: local placeholders only

When the board snapshot contains unsupported node types:

- do not drop the entire board
- do not fall back to screenshot images
- do not render an empty board if a local placeholder can be shown

Instead, render an in-canvas placeholder at the node's position:

- use the original x / y / width / height if available
- draw a dashed outline or other lightweight local placeholder treatment
- show the node type label, for example:
  - `Unsupported: image`
  - `Unsupported: sticker`
  - `Unsupported: group`
- if the node exposes a short readable label or text, include it as a secondary line

This preserves layout and communicates limitations without violating the "boards must not become images" requirement.

### 6. Missing raw-node snapshot behavior: local board-unavailable placeholder only

If raw node pull fails for a board token:

- inline preview renders a local board-unavailable placeholder
- enlarged preview renders the same local board-unavailable placeholder inside the viewer shell
- no remote snapshot URL may be used as a backup

This placeholder should carry minimal factual information:

- board token short form
- error category if available
- short message such as:
  - `Board nodes unavailable`
  - `Board nodes unavailable: permission`
  - `Board nodes unavailable: rate limited`

The failure is still local-preview-only in this phase. It does not block document pull itself.

### 7. Cache model shifts from preview URLs to node snapshots

Replace the screenshot-oriented preview model with a node-snapshot-oriented model.

Current screenshot-oriented shape:

- `whiteboardPreviewUrls`
- `whiteboardPreviewFocusRects`
- `whiteboardPreviewErrors`

Phase-one target shape:

- `whiteboardNodeSnapshots[token]`
  - `whiteboardToken`
  - `fetchedAt`
  - `nodes`
  - `supported`
  - `unsupportedNodeTypes`
  - `error`
- `whiteboardRenderDiagnostics[token]`
  - `category`
  - `message`
  - `unsupportedCount`

The frontend preview consumes node snapshots first-class. Screenshot URLs cease to be part of the normal board preview contract.

### 8. Inline preview and modal preview share one renderer contract

Board rendering should be separated into:

- pure node-to-SVG rendering logic
- a thin inline preview wrapper
- a thin modal preview wrapper

The renderer output must be the same in both places. The modal adds:

- pan
- zoom
- fit
- SVG export

But it must not change the rendering source or switch to an image-based implementation.

## Component Boundaries

Create focused board-preview units instead of growing `feishu-docs-local-preview.tsx` further.

### `feishu-doc-board-rendering.ts`

Pure functions only:

- node normalization
- shape and connector geometry
- path generation
- text layout helpers
- unsupported-node placeholder model
- SVG viewBox and bounds resolution

### `feishu-doc-board-node-renderer.tsx`

Receives normalized board node data and renders a read-only SVG surface.

Responsibilities:

- render supported nodes
- render unsupported-node placeholders
- expose the final SVG root for export

### `feishu-doc-board-preview.tsx`

Inline document preview wrapper.

Responsibilities:

- accept the board token and cached node snapshot
- choose between:
  - node renderer
  - board-unavailable placeholder
- apply no card-like shell
- open the modal viewer on click

### `feishu-doc-board-preview-modal.tsx`

Large viewer wrapper for native boards.

Responsibilities:

- reuse the same board renderer
- add pan / zoom / fit / export SVG tools
- keep board canvas single-layer

### Existing preview dispatcher

`feishu-docs-local-preview.tsx` should only dispatch:

- Mermaid -> Mermaid preview
- Mermaid mindmap -> mindmap preview
- native board -> native board preview
- everything else -> existing preview branches

It should stop embedding native boards into the generic image preview branch.

## Data Flow

1. Pull document and build document IR as today.
2. Collect board-like block tokens from the document.
3. For each token, request `output_as=raw`.
4. Cache board node snapshots locally.
5. Preview layer reads board token + cached snapshot.
6. If snapshot exists, render local SVG board elements.
7. If snapshot is missing or failed, render a local board-unavailable placeholder.
8. Never route native board preview through snapshot image URLs.

## Error Handling

### Successful raw-node fetch with fully supported nodes

- render the board normally

### Successful raw-node fetch with partially unsupported nodes

- render supported nodes
- render local placeholders for unsupported nodes
- do not switch to image mode

### Failed raw-node fetch

- render a board-unavailable placeholder
- store diagnostics for inspection and support
- do not switch to image mode

### Rate limit or permission problems

- same as other raw-node fetch failures for preview purposes
- diagnostics remain available through the existing pull/self-check work
- still no screenshot fallback

## Testing Strategy

### Rendering tests

- `round_rect` nodes render at correct coordinates and size
- connector `straight` path renders correctly
- connector `curve` path renders correctly with turning points
- text style and alignment are preserved for supported nodes
- unsupported nodes generate placeholder output rather than crashing

### Preview integration tests

- native board blocks no longer render through `FeishuDocsPreviewImage`
- native board blocks no longer use `whiteboardPreviewUrls` as the primary rendering source
- native board preview markup does not include image-shell or board-card wrapper classes
- missing node snapshots render board-unavailable placeholders instead of images

### Modal tests

- modal reuses the same board renderer as inline preview
- zoom / fit / export SVG remain available
- modal does not switch to image mode

### Pull/cache tests

- pull writes `whiteboardNodeSnapshots`
- partial unsupported nodes are recorded in diagnostics
- raw-node fetch errors still produce placeholder-capable cache entries

### Compatibility tests

- Mermaid preview remains unchanged
- Mermaid mindmap preview remains unchanged
- image preview remains unchanged
- native board preview no longer depends on `download_as_image`

## Risks and Mitigations

### Risk: too many native node types appear quickly

Mitigation:

- keep phase one intentionally small
- unsupported nodes render placeholders in-canvas instead of collapsing the board

### Risk: native board renderer bloats the main preview file

Mitigation:

- split renderer, preview wrapper, modal wrapper, and pure geometry helpers into focused files

### Risk: pull cost increases due to raw-node fetches

Mitigation:

- reuse the existing whiteboard pull diagnostics infrastructure
- cache node snapshots locally
- keep rendering independent from push

### Risk: old screenshot-oriented code remains partially active

Mitigation:

- explicitly remove native board preview from generic image branches
- add regression tests asserting that board preview no longer goes through image preview code paths

## Open Implementation Questions Resolved in This Design

- Should native boards keep using screenshot fallback?  
  No. Screenshot fallback is removed from the end-user board preview path.

- Should unsupported nodes degrade to images?  
  No. Unsupported nodes degrade to local placeholders within the same board canvas.

- Should board preview keep card-like wrappers?  
  No. The board preview surface is single-layer and non-card-like.

- Should this phase attempt board editing or Mermaid conversion?  
  No. This phase is read-only native rendering only.
