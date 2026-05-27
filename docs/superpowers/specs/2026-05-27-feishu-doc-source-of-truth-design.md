# Feishu Doc Source-of-Truth Editing and Push Design

Date: 2026-05-27
Status: Draft for review
Owner: GitHub Copilot

## 1. Context

The desktop Feishu docs runtime already preserves several workspace-local artifacts for each pulled document:

- source markdown under `.maomi/feishu-docs/<docId>.md`
- baseline markdown under `.maomi/feishu-docs/baselines/<docId>.base.md`
- explicit local drafts under `.maomi/feishu-docs/drafts/<docId>.draft.md`
- structured source snapshots under `.maomi/feishu-docs/<docId>/document.source.json` and `base.source.json`
- normalized IR snapshots under `.maomi/feishu-docs/<docId>/document.ir.json` and `base.ir.json`

The current shape is useful, but the authority boundary is still ambiguous.

Today:

- `FeishuDocTreeRemoteSource` pulls remote Docx payloads, normalizes them into IR, and serializes a source-markdown projection
- `DesktopFeishuDocRuntime.pushWorkspaceDoc(...)` still only writes the local draft and explicitly states that remote push is not wired
- `pushDocIR(...)` and the IR workspace runtime already have a separate structured patch path based on `base` and `current` IR snapshots

The user requires a stricter model:

- Feishu original structure must be persisted locally per workspace
- AI editing must be based on that local persisted basis, not on an ad hoc transient projection
- AI may rewrite or generate a new document, but the system must always know which local artifact is authoritative for push decisions
- remote push back to Feishu must preserve complex blocks safely instead of treating markdown text as the source of truth

This design turns the raw Feishu structure into an explicit source-of-truth baseline, while keeping an AI-friendly editable working draft and a structured push pipeline.

## 2. Goals

- Make the persisted Feishu raw structure the only authoritative factual baseline for an existing remote document.
- Keep AI editing on a separate derived working draft instead of mutating the raw baseline directly.
- Make every remote push depend on structured comparison between a baseline structure and the current edited structure.
- Preserve unknown blocks and unsupported complex blocks by default instead of silently flattening or deleting them.
- Keep workspace scoping strict so switching workspaces changes the local basis and requires a fresh pull.
- Reuse as much of the existing workspace cache, IR runtime, and patch planner surfaces as practical.

## 3. Non-Goals

- No first-pass attempt to support arbitrary structural edits for every Feishu block type.
- No direct AI editing of raw Feishu block JSON as the primary authoring surface.
- No first-pass replacement of the existing markdown preview workflow.
- No silent best-effort push that ignores revision conflicts or unsupported block mutations.
- No requirement that legacy caches without a raw source baseline remain pushable without a fresh pull.

## 4. Approaches Considered

### Approach A: Raw-source baseline plus derived work draft and structured push

Persist the exact pulled Feishu structure as the baseline, derive editable artifacts from it, and always compute push plans from baseline structure versus current structure.

Pros:

- matches the user's requested authority model
- keeps AI on a text-friendly editing surface
- aligns with the existing IR workspace runtime and patch planner
- preserves unknown and complex blocks more safely

Cons:

- requires explicit authority rules across multiple workspace artifacts
- requires stronger compile and diff semantics before push

### Approach B: Directly edit raw source snapshots or IR as the main AI surface

Treat raw block JSON or IR JSON as the document that AI edits directly.

Pros:

- keeps the editing model closest to the remote structure
- reduces one projection step at push time

Cons:

- poor authoring and prompting surface for AI and humans
- much easier to produce invalid or unsafe structure mutations
- increases repair complexity for partial edits

### Approach C: Keep markdown or MDX as the practical source of truth and store raw source only for diagnostics

Continue to let markdown drive editing and push semantics, while retaining raw source snapshots only as a reference.

Pros:

- smallest short-term code delta
- easiest to keep current preview flows working

Cons:

- violates the user's requirement that the Feishu original structure is the actual basis
- loses authority when markdown cannot express real remote structure faithfully
- makes complex-block push safety much weaker

## 5. Recommendation

Choose Approach A.

The correct long-term boundary is:

- the raw Feishu structure is the factual baseline
- the editable draft is a derived working artifact
- push decisions are made by comparing structures, not by trusting markdown text alone

This model supports both requested product behaviors:

- editing and updating an existing Feishu document safely
- generating a new document from AI output without losing a clean future baseline after first publish

## 6. Proposed Design

### 6.1 Authority model

Each workspace Feishu document has three conceptual layers.

1. Raw source baseline

- stores the remote Feishu document metadata and raw block payloads as pulled from Docx APIs
- is the only factual basis for an existing remote document
- is never directly edited by AI or user authoring flows

2. Structured baseline

- stores the normalized IR derived from the raw source baseline
- is the baseline used for patch planning, write-safety checks, asset hydration, and revision-aware push
- may be regenerated from the raw source baseline whenever needed

3. Working draft

- stores the editable derived representation used by AI and optionally by humans
- defaults to the source-markdown projection when no explicit draft exists yet
- may evolve independently of the baseline until push time

The authority rule is strict:

- raw source baseline is the fact
- structured baseline is the push basis
- working draft is the authoring surface

### 6.2 Raw source baseline persistence

The existing `document.source.json` and `base.source.json` files become first-class baseline artifacts instead of incidental cache files.

For an existing remote document, they must preserve:

- requested document identity
- resolved document identity type
- pull timestamp
- remote revision identifier
- raw document payload needed to reconstruct document metadata
- raw block list exactly as returned by the remote blocks endpoint

Design rule:

- no markdown projection may overwrite or redefine what the raw source baseline contains
- synthesized root blocks that are convenient for IR normalization must remain derived, not stored as if they came from the remote payload

This means the raw source snapshot remains a faithful remote record, not an already-normalized structure.

### 6.3 Structured baseline persistence

The existing `document.ir.json` and `base.ir.json` files remain the normalized structured baseline layer.

Rules:

- `base.ir.json` tracks the last accepted remote baseline used for push comparison
- `document.ir.json` tracks the latest current structured view available in the workspace runtime
- both files are derived from the raw source baseline or from accepted local transformations, never from arbitrary unsafeguarded draft writes

For first rollout, the push pipeline may continue to depend on IR diffs because the workspace IR runtime, patch planner, and patch executor already speak that language.

### 6.4 Working draft persistence

The editable working layer remains distinct from the baseline layers.

Artifacts:

- source-markdown projection at `.maomi/feishu-docs/<docId>.md`
- baseline projection at `.maomi/feishu-docs/baselines/<docId>.base.md`
- explicit editable draft at `.maomi/feishu-docs/drafts/<docId>.draft.md`

Rules:

- if no explicit draft exists, AI reads and writes against the source-markdown projection lineage
- once a draft exists, AI writes only to the draft file
- working-draft writes never mutate `document.source.json`, `base.source.json`, or `base.ir.json`

This preserves a text-friendly editing surface without weakening the authority of the baseline.

### 6.5 AI editing contract

AI editing must consume both the editable text and structured constraints.

AI input consists of:

- the current working draft text
- document title and identity metadata
- baseline revision metadata
- a summarized structure map extracted from the structured baseline, including block ids, block kinds, writable versus preserved regions, and unknown-block markers
- optional summaries of media and unsupported blocks

AI output consists of:

- updated working-draft text only

AI is not allowed to directly emit authoritative raw source snapshots or overwrite baseline IR files.

The system is responsible for compiling the working draft back into a candidate current structure before any push attempt.

### 6.6 Push pipeline

The push pipeline for an existing remote document is:

1. read raw source baseline and base IR
2. read current working draft
3. compile current working draft into candidate current IR
4. compare `base IR` versus `current IR`
5. produce a structured patch plan
6. reject or downgrade unsupported changes
7. execute allowed remote patch operations
8. on success, pull the remote document again and refresh all baseline artifacts

This means a push is never "send the markdown back". It is always "derive structure from the draft, compare it to the baseline, then push allowed structured operations".

### 6.7 Supported and blocked push scope

First-pass supported automated updates:

- plain text paragraphs
- headings
- list items
- quotes
- todo text
- code-block text
- text-only updates nested inside already-supported containers when the container itself is not structurally rewritten

First-pass blocked or downgraded changes:

- table structure edits
- grid and multi-column layout rewrites
- image, file, board, whiteboard, mindnote, and diagram structural replacement
- deletion or mutation of unknown blocks
- unsupported container rearrangements

Unknown and unsupported blocks must be preserved by default.

If the candidate current structure attempts to remove or mutate them without an explicit supported writer, the planner must surface blocked changes instead of silently flattening them.

### 6.8 Existing-document update versus new-document publish

The system supports two publication modes.

Existing document update:

- uses the baseline of an existing pulled remote document
- attempts structured patch execution against that document

New document publish:

- creates a new remote document from generated content
- after creation, immediately performs a fresh pull of the created document
- establishes a new raw source baseline and structured baseline for the new remote document

If a rewrite of an existing complex document exceeds safe push limits, the recommended fallback is to publish a new document rather than force unsafe in-place updates.

### 6.9 Conflict handling and rollback

Every push attempt must use baseline revision metadata.

Rules:

- if the remote revision no longer matches the local baseline revision, the push is blocked
- local drafts remain intact on conflict
- the user must pull again before trying another in-place push

Before executing remote patch operations, the system must snapshot:

- current working draft
- current baseline IR
- current raw source baseline metadata reference

On successful push, the system must not merely mark timestamps. It must perform a fresh remote pull and replace the workspace baseline artifacts with the newly accepted remote truth.

### 6.10 View-state and diagnostics model

The cache and UI-facing state should explicitly expose:

- whether a raw source baseline is present
- whether a structured baseline is present
- whether a working draft exists
- whether local changes exist
- whether the current draft is push-safe for in-place update
- whether blocked changes exist
- whether unknown blocks are present
- whether a revision conflict exists
- whether the recommended publish mode is `update existing` or `publish new`

This state must also be available to AI flows so the assistant can explain whether it can safely update the original document or should generate a new document instead.

## 7. Data Model Changes

### 7.1 `FeishuDocSourceSnapshot`

`FeishuDocSourceSnapshot` becomes an explicitly authoritative raw-source model.

It should preserve enough remote payload to reconstruct:

- document identity and revision
- raw block list exactly as returned by the remote endpoint
- fetch metadata for audit and migration logic

If current fields are insufficient to preserve the exact remote shape required later, the model should be extended rather than asking markdown or IR files to fill that role.

### 7.2 `FeishuDocCacheStateView`

`FeishuDocCacheStateView` should be extended to expose the baseline authority model directly, including fields such as:

- `hasRawSourceBaseline`
- `hasStructuredBaseline`
- `publishModeRecommendation`
- `hasBlockedChanges`
- `hasRevisionConflict`
- counts or summaries for preserved unknown blocks

The existing relative-path fields remain useful and should continue to point at the separate baseline and draft artifacts.

## 8. Migration Strategy

### 8.1 Existing fully-populated caches

Documents that already have:

- raw source snapshots
- baseline IR
- original markdown projection

can be migrated in place by reclassifying those files under the new authority rules.

### 8.2 Legacy projected caches without a raw source baseline

Legacy caches that only have markdown or only have IR but lack a raw source baseline must be treated as incomplete.

Rules:

- they may remain locally readable and editable
- they must not be eligible for automated in-place push until a fresh remote pull establishes the raw source baseline

### 8.3 Node-token workspace identity

The current node-token cache identity remains the correct workspace key.

Migration must continue to move legacy document-id keyed source, IR, and draft artifacts into node-token keyed paths before the new authority checks run.

## 9. Testing Strategy

Required focused coverage:

- pull persists raw source baseline, structured baseline, and working projection separately
- working-draft edits do not mutate raw source baseline files
- candidate current IR compilation preserves unknown blocks or reports blocked changes
- supported text edits produce structured patch plans from `base IR` versus `current IR`
- revision conflicts block push and preserve the draft
- push success triggers a fresh pull and refreshes all baseline artifacts
- new-document publish establishes a new baseline immediately after successful create
- legacy caches without raw source baseline are blocked from in-place push until repulled

Pure logic tests should continue to be preferred for structure compilation, authority checks, and planner behavior. Component tests are not required for the authority model itself.

## 10. Implementation Notes

The current code already provides the main seams needed for this work:

- raw source workspace cache
- IR workspace cache
- markdown and draft workspace caches
- doc workspace runtime push entrypoint
- patch planner and patch executor

The implementation should therefore focus on clarifying authority, tightening write rules, and connecting the existing structured push path to the workspace draft workflow, rather than inventing a brand new Feishu document stack.

## 11. Open Questions Resolved In This Design

- Which artifact is the source of truth for an existing remote document?

The raw Feishu source baseline.

- Which artifact does AI edit?

The derived working draft only.

- What is the basis for push decisions?

The diff between baseline structure and current derived structure.

- When should the system avoid updating the existing remote document?

When conflicts, unsupported structural edits, or too many blocked changes make in-place push unsafe.