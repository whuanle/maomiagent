# Feishu Doc Whiteboard Reversible Mermaid Design

Date: 2026-05-29
Status: Draft for review
Owner: Codex

## Context

The current Feishu document pull flow preserves whiteboards as remote tokens, not as editable source.

Today the path is:

- `FeishuDocTreeRemoteSource.readDocumentBundle(...)` pulls `docx/v1/documents/:id` and block trees
- `normalizeFeishuDocBlocksToIR(...)` stores `whiteboard`, `board`, and `diagram` blocks as resource-backed IR blocks
- `feishuDocIRToSourceMarkdown(...)` emits token-based native blocks such as `<whiteboard token="..."/>`
- the local preview layer sees those tokens and requests preview images through `download_as_image`

This is acceptable for visual preview, but it is a poor local source format for AI-assisted editing:

- the local document content no longer contains the underlying Mermaid source
- the AI sees a token or an image-oriented representation instead of structured editable text
- the preview image path becomes the effective local truth even when the underlying whiteboard was originally created from Mermaid

At the same time, the project already has two capabilities that make a better design practical:

- local preview already renders Mermaid fenced blocks as real Mermaid output rather than static whiteboard images
- Feishu tooling shows that whiteboards can be queried as code or updated from Mermaid source, which means some whiteboards are reversible into an editable DSL

The user requirement is to make local pulled content element-oriented for reversible Mermaid whiteboards:

- after pull, the local document should contain Mermaid source instead of whiteboard image-only representations when that recovery is reliable
- push must still update the original whiteboard rather than creating ambiguous new whiteboards
- unsupported or non-reversible whiteboards must continue to work through the current token and image-preview path

## Goals

- Recover reversible Mermaid whiteboards into Mermaid fenced blocks during pull.
- Keep the local editable Markdown friendly to AI and source-based editing.
- Preserve original whiteboard identity in local cache so push can update the same remote whiteboard token.
- Keep unsupported whiteboards on the existing token plus preview-image fallback.
- Block push when the original-token mapping for pulled Mermaid whiteboards is no longer stable.
- Reuse the current Mermaid local preview path so recovered Mermaid does not request whiteboard snapshot images.

## Non-Goals

- This work does not make every whiteboard type reversible.
- This work does not attempt to reconstruct arbitrary hand-drawn whiteboards, free-layout boards, PlantUML boards, or SVG boards into Markdown.
- This work does not silently create new whiteboards when a reversible Mermaid mapping becomes ambiguous.
- This work does not force-migrate old local caches without an explicit pull.
- This work does not redesign the general document editor or preview layout.

## Approaches Considered

### A. Keep token-based pull and only improve preview images

Leave pull as `<whiteboard token="..."/>` and continue using `download_as_image`, possibly with better caching or richer metadata.

Pros:

- smallest change to the existing pull pipeline
- no need to maintain source-to-token mapping rules

Cons:

- does not solve the actual problem because AI still sees tokens or image surrogates instead of source
- keeps whiteboard editing effectively outside the local document model
- wastes the existing Mermaid source rendering path

### B. Recover reversible Mermaid whiteboards into local Mermaid source and preserve token mapping in cache

After the document IR is built, inspect whiteboard-like blocks, try to export their code form, and restore only clearly recognized Mermaid whiteboards into Mermaid fenced blocks. Preserve the remote token in cache-only metadata for later push.

Pros:

- directly matches the user requirement
- keeps the local document source-centric and AI-friendly
- reuses the current local Mermaid rendering path
- limits risk by preserving the old token flow for unsupported whiteboards

Cons:

- requires a new reversible metadata layer in local cache
- requires explicit push blockers when Mermaid block order or count changes

### C. Convert every whiteboard into a generic local element model

Define a new local whiteboard element schema, convert all whiteboard types into that schema, and teach preview and push to operate on the new intermediate model.

Pros:

- could eventually support more than Mermaid
- creates a unified local abstraction for whiteboard-like blocks

Cons:

- far too large for the current problem
- introduces a second authoring model without immediate product value
- increases implementation risk and testing surface dramatically

## Recommendation

Choose Approach B.

The right scope is not "make whiteboards local-native in general." The right scope is narrower:

- reverse only clearly recoverable Mermaid whiteboards
- keep the recovered source in user-visible Markdown
- keep the original token only in cache and IR metadata
- keep the current token and image-preview fallback for everything else

This gives AI and users a text-native editing surface where recovery is safe, without pretending that every whiteboard can be losslessly inverted.

## Proposed Design

### 1. Pull pipeline adds a reversible whiteboard recovery step

The existing pull path should remain responsible for building the canonical local IR from Feishu block data. The new behavior is inserted after IR creation and before source Markdown generation.

New high-level flow:

1. pull remote document blocks into Feishu doc IR
2. collect all `whiteboard`, `board`, and `diagram` resource tokens from the IR
3. attempt to recover code for each distinct token, with whiteboard code export as the primary phase-one source
4. mark only clearly recognized Mermaid whiteboards as reversible in local cache metadata
5. generate source Markdown from the IR plus reversible metadata

This new step is best-effort:

- recovery success improves the local source representation
- recovery failure must not fail the entire pull
- unsupported whiteboards continue to flow through the existing token path

### 2. User-visible Markdown contains Mermaid source, not tokens, for reversible boards

Recovered Mermaid whiteboards must be represented in the local document as Mermaid fenced code blocks.

Behavior:

- if a whiteboard token resolves to clear Mermaid source, `feishuDocIRToSourceMarkdown(...)` emits a Mermaid fenced block
- if a whiteboard token cannot be safely reversed, `feishuDocIRToSourceMarkdown(...)` keeps emitting the current native token block such as `<whiteboard token="..."/>`

The token is intentionally not exposed in the user-visible Mermaid block.

This keeps local editing clean:

- AI sees and edits Mermaid source directly
- the local editor works with a normal text representation
- the preview layer naturally uses the existing Mermaid renderer for recovered blocks

### 3. Reversible metadata lives in cache and IR assets, not in the Markdown body

Recovered whiteboards need a stable local mapping back to their remote identity. That mapping must be kept out of user-visible Markdown and stored as sidecar metadata instead.

Each reversible Mermaid whiteboard should preserve:

- `whiteboardToken`
- `format = "mermaid"`
- `pulledSource`
- `pulledSourceChecksum`
- `ordinal`
- `origin = "whiteboard_code_export" | "docs_ai_markdown"`
- `reversibleState = "mermaid" | "unsupported" | "error"`
- `lastResolvedAt`
- `lastError`

This metadata can be attached to the relevant IR asset or an equivalent persisted local document sidecar, as long as it survives reopen and supports push-time token matching.

In phase one, successful recovery is expected to come primarily from whiteboard code export or query results. The `docs_ai_markdown` origin remains part of the metadata model so that a trustworthy Mermaid source surfaced directly by future or mixed pull paths can use the same reversible cache contract without another schema change.

The important boundary is:

- Markdown is the user-editable source
- reversible metadata is the machine-only identity and recovery state

### 4. Recovery accepts only clearly identified Mermaid whiteboards

The reverse step should be conservative.

Token candidates:

- `whiteboard`
- `board`
- `diagram`

Recovery order:

1. export or query the whiteboard in code form
2. if the response includes an explicit format marker, require `mermaid`
3. if the format marker is absent, run the existing Mermaid heuristics such as `looksLikeFeishuDocsMermaidSource(...)`

Only if the source is clearly Mermaid should the block become a Mermaid fenced block locally.

Do not reverse in these cases:

- export fails
- export returns empty content
- export returns non-Mermaid code such as PlantUML
- export returns only unstable raw nodes without reliable Mermaid source
- the whiteboard is a free-form board or another unsupported native type

In all of those cases, preserve the current token-based block so no remote structure is lost.

### 5. Preview follows the source representation

Recovered Mermaid whiteboards should stop participating in the whiteboard image-preview path.

Behavior:

- local Markdown that contains Mermaid fenced blocks uses the current Mermaid preview renderer
- token-based whiteboard blocks continue to request whiteboard preview images as they do today

This means the preview layer does not need a new visualization system. It simply follows the existing rule:

- Mermaid source renders as Mermaid
- token blocks render through whiteboard image snapshots

### 6. Push updates the original whiteboard token only when mapping is stable

Pull recovery is only useful if push can send changes back to the same remote whiteboard.

For reversible Mermaid whiteboards, push should:

1. parse the current local Markdown Mermaid blocks
2. locate the persisted reversible Mermaid mapping from the last successful pull
3. pair local Mermaid blocks to original whiteboard tokens by ordinal
4. update each changed remote whiteboard using the original token and Mermaid source

This pairing is allowed only if the mapping is still stable.

Stable conditions:

- Mermaid whiteboard count is unchanged
- Mermaid whiteboard order is unchanged
- no original reversible Mermaid whiteboard was deleted
- no new Mermaid whiteboard was inserted into the reversible sequence
- no split, merge, or reorder of reversible Mermaid whiteboards occurred

If those conditions hold, push can safely call the whiteboard update API with:

- `whiteboardToken = original token`
- `inputFormat = mermaid`
- `source = current Mermaid source`
- `overwrite = true`

### 7. Push must block instead of guessing when Mermaid mapping becomes ambiguous

Push must not silently create new whiteboards or guess token matches when the reversible mapping is no longer trustworthy.

Push is blocked when:

- Mermaid whiteboard count changes
- Mermaid whiteboard order changes
- a previously pulled reversible Mermaid whiteboard is deleted
- a new Mermaid whiteboard appears without a stable original-token pairing
- a mixed structural rewrite makes ordinal matching unreliable

This is deliberate. The safe first phase is "update the same whiteboard when the identity is stable," not "infer user intent from arbitrary structural edits."

### 8. Compatibility with old documents remains explicit and incremental

Existing documents and caches are not force-upgraded.

Compatibility rules:

- only an explicit future pull attempts reversible whiteboard recovery
- old local caches that already contain token blocks continue to work as they do today until a new pull occurs
- unsupported whiteboards remain token-based even after new pulls

This avoids hidden migrations while still improving local authoring as soon as the user refreshes the document from Feishu.

## Error Handling

Pull-side recovery is best-effort and non-blocking:

- if a whiteboard cannot be queried or exported as Mermaid, keep the token block
- if reversible recovery fails, record the error state in cache metadata and continue the pull

Push-side reversible updates are strict and blocking:

- if the original-token mapping is stable, update the original whiteboard
- if the mapping is unstable, fail before any ambiguous remote write

This split is intentional:

- pull should degrade gracefully
- push should refuse unsafe identity guesses

## Testing Strategy

Add or update tests for the following cases.

Pull:

- a whiteboard that exports Mermaid code becomes a Mermaid fenced block in local Markdown
- a whiteboard that fails export or resolves to non-Mermaid stays as a token block
- a document containing both reversible Mermaid whiteboards and unsupported whiteboards preserves both forms correctly

Preview:

- recovered Mermaid blocks use the Mermaid preview path and do not request whiteboard image snapshots
- token-based whiteboards continue to request image previews

Cache and metadata:

- reversible Mermaid metadata persists across reopen
- unsupported and error states are recorded without breaking the document

Push:

- editing a pulled reversible Mermaid block updates the original whiteboard token
- unchanged Mermaid blocks do not trigger unnecessary whiteboard updates
- Mermaid count changes block push
- Mermaid order changes block push
- deletion or insertion inside the reversible Mermaid sequence blocks push

## Acceptance Criteria

- After pulling a document, any whiteboard that can be clearly recovered as Mermaid appears locally as a Mermaid fenced block instead of a token block.
- The local editor and AI can operate on Mermaid source directly for those recovered blocks.
- Recovered Mermaid blocks render locally through the existing Mermaid renderer rather than through whiteboard snapshot images.
- Unsupported or non-reversible whiteboards still appear and preview correctly through the current token-based path.
- Push updates the original remote whiteboard token when the reversible Mermaid mapping is unchanged.
- Push blocks before remote write when Mermaid token mapping becomes ambiguous.
- Existing documents require an explicit pull before any reversible Mermaid recovery is applied.
