# Feishu Doc Lossless Native-Block Repush Design

Date: 2026-06-03
Status: Draft for review
Owner: Codex

## Context

The current Feishu document push runtime already supports several write paths:

- structured IR patch push through [desktop-feishu-doc-runtime.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts)
- plain Markdown delete-and-create push through [feishu-doc-remote-markdown-api.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-markdown-api.ts)
- Docs AI whole-document overwrite for selected native-block cases

The workspace also already persists remote raw source snapshots:

- source snapshots under `.maomi/feishu-docs/<docId>/document.source.json` and `base.source.json`
- normalized IR snapshots under `.maomi/feishu-docs/<docId>/document.ir.json` and `base.ir.json`
- derived local drafts under `.maomi/feishu-docs/drafts/<docId>.draft.md`

The user requirement is stricter than the current force-push behavior:

- repeated push must really send content again when the user clicks push
- repeated push must remain as compatible and lossless as possible
- native blocks such as table, bitable, sheet, board, and similar structures must not be degraded because the local draft only stores placeholders

The recently widened "push even when unchanged" behavior exposed the missing boundary. For plain Markdown documents, repeated push is safe. For documents that contain native-block placeholders such as `<table ...>` or `<bitable ...>`, the local draft is not a lossless source of truth. Treating that draft as the remote whole-document payload can produce false-success behavior and incomplete remote content.

This design introduces a dedicated lossless repush path for native-block documents by using the cached raw remote source snapshot as the baseline to preserve.

## Goals

- Make repeated push real for native-block Feishu documents instead of silently skipping.
- Preserve native-block raw payloads, identifiers, child ordering, and tokens whenever the user did not explicitly change them.
- Continue allowing ordinary text edits in the same document without forcing a manual remote pull before every push.
- Reuse the existing source snapshot, IR cache, and draft cache instead of inventing a second workspace storage model.
- Fail closed when the system cannot prove that a repush is lossless.

## Non-Goals

- This work does not attempt arbitrary user-authored structural editing for every Feishu native block type.
- This work does not reconstruct native block internals from placeholder Markdown.
- This work does not redesign the editor UI or authoring format.
- This work does not remove the existing plain Markdown push path for documents that do not contain native blocks.
- This work does not guarantee lossless repush when the required raw source snapshot is missing.

## Approaches Considered

### A. Raw-source-preserving repush orchestrator

Use the cached `FeishuDocSourceSnapshot.blocks` payload as the remote-structure baseline, map allowed text edits back onto editable blocks, preserve untouched native blocks byte-for-byte, and then submit the rebuilt full document payload through a dedicated push path.

Pros:

- best match for the user's "compatible and lossless" requirement
- preserves native blocks without trusting placeholder Markdown
- reuses existing source snapshot data already cached in the workspace
- keeps plain Markdown and native-block documents on separate write contracts

Cons:

- highest implementation complexity
- needs a new orchestration layer and more validation rules

### B. Whitelist-only lossless repush

Support lossless repush only for a few native block families such as table and bitable, while continuing to block the rest.

Pros:

- smaller scope
- faster first delivery

Cons:

- weaker compatibility than requested
- more user-visible inconsistency

### C. Keep blocking all native-block repeated pushes

Allow repeated push only for plain Markdown documents and block every native-block document.

Pros:

- safest implementation
- no risk of accidental lossy overwrite

Cons:

- does not satisfy the user's request
- unnecessarily degrades usability for many valid documents

## Recommendation

Choose Approach A.

The core rule should be:

- plain Markdown drafts may be treated as remote write payloads
- native-block drafts may not

For native-block documents, the system should preserve the raw remote structure from the cached source snapshot and only overlay proven-safe editable changes.

## Proposed Design

### 1. New push boundary

`DesktopFeishuDocRuntime.pushWorkspaceDoc(...)` should route native-block documents into a dedicated lossless repush orchestrator before falling back to the existing plain Markdown or IR push paths.

Routing rules:

- documents without native blocks keep the current push behavior
- documents with native blocks and a valid raw source snapshot enter the lossless repush path
- documents with native blocks but without a usable raw source snapshot fail with a clear "pull required" style error

The orchestrator should live as a separate helper instead of growing `pushWorkspaceDoc(...)` further.

### 2. Inputs

The lossless repush orchestrator consumes:

- the current local draft Markdown
- the current structured IR baseline
- the cached raw source snapshot `FeishuDocSourceSnapshot`
- document metadata such as `docId`, resolved document id, and document id type

The raw source snapshot is the source of truth for native block preservation. The draft Markdown remains the authoring surface for editable text.

### 3. Three-step flow

#### 3.1 Rebuild the remote structural skeleton

Start from `FeishuDocSourceSnapshot.blocks` and treat it as the authoritative remote block tree:

- keep native block raw payloads unchanged
- keep block ids and child ordering unchanged
- keep board, table, bitable, sheet, and similar tokens untouched

This step is preservation, not regeneration.

#### 3.2 Overlay proven-safe editable changes

Compile the current draft using the existing anchored block and IR machinery, then map only safe editable content back onto the preserved skeleton:

- headings
- text blocks
- bullet and ordered lists
- quotes
- code blocks
- todos

Rules:

- update text content only for blocks that can be stably matched to existing editable blocks
- never infer native block internals from placeholders
- never delete or reorder native blocks through this path

#### 3.3 Submit the rebuilt document

After the preserved skeleton has been updated with safe editable content, submit the full rebuilt document through a dedicated remote write path for complete document replay.

Success handling:

- return `pushStatus: "succeeded"` only when the remote write completes
- settle local draft, source, and IR baselines to the just-pushed state
- keep the editor on the pushed local draft

### 4. Failure model

The lossless repush path must fail closed.

It should block instead of guessing when:

- the raw source snapshot is missing
- a local edit affects native block structure, ordering, or identity
- a draft cannot be mapped back to existing editable blocks without ambiguity
- the rebuilt full-document payload cannot be proven structurally equivalent for preserved native blocks

User-visible messages should distinguish:

- "pull required" because the source snapshot is missing or stale
- "unsupported structure change" because the user changed something outside the safe lossless-edit envelope

### 5. Cache settlement

A successful native-block repush should update all local baselines coherently:

- draft cache becomes the just-pushed draft
- original Markdown baseline becomes the just-pushed draft for local dirty-state comparison
- source snapshot baseline becomes the preserved-and-updated raw structure that was pushed
- IR baseline becomes the corresponding structured representation of the pushed result

This prevents the next repeated push from drifting back to an older raw snapshot.

### 6. Compatibility contract

The design intentionally separates two editing contracts.

For plain Markdown documents:

- whole-document rewrite remains acceptable

For native-block documents:

- native blocks are preserved from raw source
- editable text is overlaid onto that preserved structure
- placeholder Markdown is never treated as the canonical remote structure

## Error Handling

The push result contract becomes:

- `succeeded`: the chosen write path actually sent a remote write and completed successfully
- `blocked`: the system detected a missing baseline, unsupported structure change, or write failure

The runtime must not report success for a native-block document unless it has actually executed the preserved-structure repush path.

## Test Strategy

Add or update tests for at least the following cases:

- plain Markdown document: unchanged repeated push still triggers a real remote write
- native-block document with table or bitable placeholders: unchanged repeated push uses the lossless repush path and preserves native block payload
- native-block document with only text edits: push succeeds and preserved native blocks remain unchanged
- native-block document with reordered or deleted native placeholders: push is blocked as an unsupported structure change
- native-block document without a raw source snapshot: push is blocked and requests a fresh pull
- successful lossless repush updates draft, source, and IR baselines together

## Acceptance Criteria

- Clicking push on an unchanged native-block document performs a real remote write instead of a fake success or silent noop.
- Native blocks that the user did not modify remain structurally unchanged after repeated push.
- Placeholder Markdown is never used to reconstruct native block internals.
- Missing raw source snapshots cause a clear blocking error instead of a lossy fallback.
- Plain Markdown documents continue to support repeated push without regression.
