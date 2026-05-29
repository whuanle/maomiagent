# Feishu Doc Push Without Remote Confirmation Design

Date: 2026-05-29
Status: Draft for review
Owner: Codex

## Context

The Feishu document push path now supports two direct-write modes:

- structured IR patch push through [desktop-feishu-doc-runtime.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts)
- plain Markdown overwrite through the same runtime plus [feishu-doc-remote-markdown-api.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/feishu-doc-remote-markdown-api.ts)

The direct-write part is no longer the main problem. The failure comes from the follow-up confirmation step:

- after a write succeeds, `pushWorkspaceDoc(...)` still calls `refreshWorkspaceDocAfterPush(...)`
- `refreshWorkspaceDocAfterPush(...)` re-reads the remote document immediately and only treats the push as successful when the pulled Markdown exactly matches the locally expected Markdown
- that match is currently strict string equality after trim
- the retry window is only `0 / 100 / 200ms`

This creates false negatives:

- Feishu can acknowledge the write while the subsequent read still returns the previous content for a short period
- Feishu can normalize remote Markdown into a representation that is semantically equivalent but not byte-equal to the local expectation
- the workbench then shows `操作失败` and `未确认远端写入成功，已保留本地草稿。` even though the write request itself succeeded

The user requirement is explicit and narrower than the current flow:

- push is only responsible for sending the current content to Feishu
- if the Feishu write API succeeds, push should be considered successful
- push must not automatically pull the remote document back
- viewing the remote result remains an explicit user action through pull or reopen

This design intentionally supersedes the confirmation portion of [2026-05-28-feishu-doc-direct-push-design.md](e:/workspace/MaomiAgent/docs/superpowers/specs/2026-05-28-feishu-doc-direct-push-design.md). Direct push still matters, but automatic remote confirmation no longer belongs inside the push action itself.

## Goals

- Treat a Feishu write API success as push success.
- Remove automatic remote re-read confirmation from the push path.
- Keep the editor content on the current local Markdown after a successful push.
- Settle local cache state to `saved` after a successful push so the same content is not repeatedly treated as unpushed.
- Keep explicit pull and reopen as the only operations that refresh the remote document back into the editor.
- Preserve the existing pre-push safety checks for stale baselines and unsupported mutations.

## Non-Goals

- This work does not redesign the explicit pull flow.
- This work does not add background confirmation, telemetry-only pullback, or hidden retry jobs.
- This work does not make push synthesize a fresh authoritative remote snapshot.
- This work does not remove existing pre-push blockers such as revision conflict, unsupported block mutations, or unsupported pure-Markdown structures.
- This work does not redesign the workbench layout or add new push controls.

## Approaches Considered

### A. Return success immediately after the write API succeeds

Stop calling `refreshWorkspaceDocAfterPush(...)` from both the IR patch path and the plain-Markdown overwrite path. Settle local cache state locally and return `pushStatus: "succeeded"` as soon as the write request finishes successfully.

Pros:

- exactly matches the user requirement
- removes the current false-negative failure mode completely
- keeps push semantics simple and predictable
- removes an unnecessary extra remote read from the push action

Cons:

- if Feishu ever acknowledges a write that is not actually durable, the UI will still show success
- push and remote verification become intentionally decoupled

### B. Keep push successful, but run confirmation silently in the background

Hide the post-push pullback from the user and only log mismatches.

Pros:

- preserves some diagnostic signal
- user no longer sees the false failure

Cons:

- still spends extra network requests on every push
- keeps the old conceptual coupling between push and pull
- more moving pieces than the user asked for

### C. Keep pullback, but never let it fail the push

Continue to re-read the remote document after push, but ignore pullback mismatch when deciding `pushStatus`.

Pros:

- smallest delta if the refresh helper remains in place

Cons:

- still performs unnecessary remote reads
- keeps confusing split semantics where push is "successful" but immediately followed by a silent disagreement
- more complex than simply removing the confirmation stage

## Recommendation

Choose Approach A.

Push should be a write-only operation:

- pre-push validation decides whether the content is allowed to be sent
- the Feishu write API decides whether the send succeeded
- explicit pull decides when remote content should be reloaded back into the editor

This keeps action boundaries clean and matches the user's stated expectation.

## Proposed Design

### 1. Push result boundary

`DesktopFeishuDocRuntime.pushWorkspaceDoc(...)` should stop using `refreshWorkspaceDocAfterPush(...)` as part of success determination.

Behavior becomes:

- pre-push blockers still run before any write
- if the write path throws, push returns `blocked` with the write error message
- if the write path completes, push returns `succeeded`

This applies to both push variants:

- structured IR patch path after `pushDocIR(...)`
- plain Markdown overwrite path after convert/delete/create completes

The message `未确认远端写入成功，已保留本地草稿。` is no longer part of the active push flow.

### 2. Local state settlement after successful push

Successful push must no longer depend on a fresh remote pull to clear the dirty state.

After a successful push, the runtime should settle the local workspace state using the just-pushed Markdown:

- keep `item.markdown` equal to the local content that was pushed
- stamp `lastPushedAt`
- return cache state with `hasLocalChanges = false`
- keep `publishModeRecommendation = "update_existing"`
- keep the current editor session on the same local Markdown instead of replacing it with a pulled remote version

To make that clean state survive reopen and background refresh boundaries, the runtime should persist a local pushed baseline for Markdown dirty-state comparison. Concretely:

- the local original-Markdown cache should be updated to the pushed Markdown
- the local draft cache should remain the current pushed Markdown
- the local cache state should compare draft content against that pushed Markdown baseline instead of requiring an immediate remote pull

This is a local settlement rule, not a new source-of-truth claim. In this design, the original-Markdown cache becomes the local "last pushed successfully" baseline for dirty-state purposes. It does not mean that a new authoritative remote snapshot was just pulled.

### 3. Remote source-of-truth boundary

Push success must not pretend that a new authoritative remote snapshot has been pulled.

After a successful push:

- no automatic remote content read occurs
- no automatic remote Markdown-to-editor replacement occurs
- raw source and structured IR snapshots remain the last explicitly pulled remote snapshots unless another part of the write path already updated them locally

This means explicit pull stays the only operation that refreshes authoritative remote state from Feishu back into the workspace cache.

### 4. UI behavior

The workbench should continue to consume the RPC result exactly as it does today, but the result semantics change:

- successful write returns `pushStatus !== "blocked"`
- the editor remains on the local Markdown that was pushed
- `saveState` settles to `saved`
- only actual write errors surface as push failures

From the user's perspective, the action boundary becomes:

- `推送`: send the current local content
- `重新拉取`: refresh remote content into the editor

These two actions should no longer be implicitly chained together.

### 5. Test strategy

Update the Feishu runtime tests to reflect the new contract.

Keep:

- stale baseline still blocks before write
- unsupported mutations still block before write
- real write errors still fail the push

Replace the old confirmation-oriented expectations with push-only expectations:

- if the write API succeeds, `pushStatus` is `succeeded`
- push does not call the post-push remote refresh helper
- push no longer depends on exact pulled-Markdown equality
- successful push settles local cache state to clean without auto-pulling remote content back

The previous tests that explicitly asserted:

- `pushStatus = "blocked"` after a successful write plus empty refresh
- `pushStatus = "blocked"` after a successful write plus stale-content refresh

must be rewritten because that behavior is no longer correct by design.

## Error Handling

The push pipeline now has one clear success condition and one clear failure condition:

- success: the selected Feishu write path completes successfully
- failure: pre-push validation blocks the action or the Feishu write path throws

There is no third "write probably worked but confirmation did not" state in the push action anymore.

## Acceptance Criteria

- A successful Feishu write returns `pushStatus: "succeeded"` without performing an automatic remote pullback.
- The workbench no longer shows `未确认远端写入成功，已保留本地草稿。` after a successful write.
- After a successful push, the editor stays on the current local Markdown and `saveState` settles to saved.
- The same pushed Markdown is not immediately reclassified as dirty on the next local read from cache.
- Explicit pull and reopen remain the only ways to refresh remote content into the editor.
