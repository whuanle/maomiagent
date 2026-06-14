# Workspace Editing Alignment With Opencode Design

**Date:** 2026-06-14

**Goal:** Reduce fragile file-edit failures in chat turns by aligning MaomiAgent's workspace editing tools with the more resilient design used in `opencode`, while keeping the current external tool names and most call shapes stable.

**Non-goals:**
- Renaming existing workspace editing tools
- Replacing the entire conversation tool stack
- Introducing silent cross-tool fallback that changes tool semantics without model awareness

## Problem

`workspace_edit_file` currently behaves as a strict exact-string replacement tool. It reads the current file, counts exact matches with `oldText`, and fails immediately if the fragment does not match byte-for-byte. `workspace_apply_patch` is only marginally better because its update hunks are still matched by assembling an old chunk and searching with a plain substring lookup.

This is fragile in ordinary editing flows and especially fragile in Feishu draft flows because draft Markdown is normalized on write. A fragment the model just wrote may no longer exist verbatim on the next turn, which causes repeat failures even when the intended edit is still obvious to a human.

## Reference: Opencode

`opencode` separates responsibilities across:

- `edit`
  - Still conceptually an exact replacement tool
  - Requires prior file reading
  - Uses multiple replacement strategies before failing: exact, line-trimmed, block-anchor, whitespace-normalized, indentation-flexible, escape-normalized, trimmed-boundary, context-aware, and multi-occurrence handling
- `apply_patch`
  - Parses structured file hunks first
  - Verifies changes before writing
  - Matches by line sequence with multiple comparison passes: exact, `trimEnd`, `trim`, and normalized Unicode/spacing comparison
  - Supports context seeking and end-of-file anchoring

The important lesson is not only that `opencode` has more tools, but that its patch path is the primary robust editing mechanism and its exact-replacement path has meaningful fallback matching.

## Design

### 1. Tool responsibility split

Keep the current three tools but narrow their responsibilities:

- `workspace_edit_file`
  - Lightweight single-block replacement tool
  - Best for one continuous, well-bounded fragment
  - Not the default mechanism for complex edits
- `workspace_apply_patch`
  - Primary editing tool for most real code and document changes
  - Default for multi-line edits, multi-location edits, context-sensitive edits, and Feishu draft updates
- `workspace_write_file`
  - Only for new files, empty or near-empty files, or explicit full rewrites

This preserves compatibility while moving the default editing path toward a more resilient patch model.

### 2. `workspace_edit_file` matcher upgrade

Preserve the current tool schema:

- `path`
- `oldText`
- `newText`
- `replaceAll`

Replace the current exact-match implementation with a staged matcher pipeline inspired by `opencode`:

1. Exact fragment match
2. `trimEnd`-insensitive match
3. `trim`-insensitive match
4. Whitespace-normalized match
5. Indentation-flexible block match
6. Multi-line anchor match
7. Context-aware block match

Rules:

- For non-`replaceAll`, only succeed when the resolved match is unique
- If multiple candidates remain, fail with an ambiguity error and ask for more context
- If no candidate remains, fail with a structured not-found error that explicitly recommends rereading the target region and switching to patch when appropriate

The tool remains semantically bounded: it still performs a single replacement operation and does not silently transform itself into patch mode.

### 3. `workspace_apply_patch` engine upgrade

Replace the current update-hunk application logic with a structured patch matcher modeled on `opencode`:

- Parse patch text into operations and update chunks
- Represent each update chunk with:
  - `oldLines`
  - `newLines`
  - optional `changeContext`
  - optional end-of-file anchor
- Compute replacements by seeking matching line sequences in the current file

Seek order:

1. Exact line match
2. `trimEnd` comparison
3. `trim` comparison
4. Normalized comparison for Unicode punctuation and spacing

Additional behavior:

- Honor explicit context seek markers before matching a chunk
- Retry without trailing empty lines when safe
- Apply replacements only after all hunks verify successfully
- Fail with a verification-style error when any hunk cannot be matched

This turns `workspace_apply_patch` into the primary stable editing mechanism instead of a thin wrapper around substring replacement.

### 4. Feishu draft handling

Feishu draft paths already normalize Markdown on write. That behavior should stay, but the editing tools must stop assuming that the model's previous literal output will remain byte-identical on disk.

Policy for Feishu draft Markdown paths:

- Prefer `workspace_apply_patch` by default for non-trivial edits
- Allow `workspace_edit_file` only for small single-block replacements
- Run matching against the current normalized file contents
- Ensure tests cover write -> normalization -> follow-up edit sequences

This directly addresses the most failure-prone path in the current system.

### 5. Failure and retry behavior

Do not silently downgrade a failed `workspace_edit_file` invocation into a patch operation inside the tool. That would blur tool semantics and make debugging harder.

Instead:

- `workspace_edit_file` should return richer failure metadata
  - error code
  - `path`
  - match strategies attempted
  - whether zero or multiple candidates were found
  - hint that reread + patch is recommended
- `workspace_apply_patch` should return verification-style errors when a hunk cannot be matched
- Agent prompts should explicitly treat `workspace_edit_match_not_found` and `workspace_edit_match_ambiguous` as signals to reread and retry with `workspace_apply_patch`, not to blindly resend the same edit

The kernel-level continue-after-tool-failure behavior can remain unchanged; the improvement is that the next model step will be guided toward a better recovery action.

### 6. Agent and prompt strategy

Update the prompt guidance for general editing agents and the Feishu document assistant:

- Use `workspace_apply_patch` by default for:
  - code edits
  - long document edits
  - multi-line changes
  - multi-location changes
  - edits near complex formatting or normalized content
- Use `workspace_edit_file` when:
  - the target is one continuous block
  - the replacement is narrowly scoped
  - preserving the exact surrounding text is straightforward
- Use `workspace_write_file` only for:
  - empty or near-empty files
  - new files
  - explicit full rewrites

For Feishu draft prompts specifically, reverse the current bias that strongly prefers `workspace_edit_file` for ordinary local revisions.

## Architecture

### New shared helpers

Add focused helpers so `desktop-conversation-builtin-tools.ts` does not keep accumulating editing logic:

- `apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/shared/workspace-edit-matcher.ts`
  - staged replacement matching for `workspace_edit_file`
- `apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/shared/workspace-patch-matcher.ts`
  - structured patch chunk parsing and line-sequence matching

These helpers should be pure and independently testable.

### Existing integration points

- `apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-builtin-tools.ts`
  - keep tool descriptors
  - delegate edit and patch matching to new helpers
- `apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts`
  - shift default guidance toward patch-first editing for ordinary modifications
- `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-chat-draft.ts`
  - align Feishu-specific editing guidance with the new policy

## Testing

Add focused tests for:

- `workspace_edit_file`
  - exact match
  - trailing whitespace drift
  - indentation drift
  - multi-line anchor recovery
  - ambiguity failure
- `workspace_apply_patch`
  - exact line matching
  - `trimEnd` fallback
  - `trim` fallback
  - normalized punctuation/spacing fallback
  - context-seek matching
  - end-of-file matching
  - verification failure on unmatched hunks
- Feishu draft flow
  - write normalized Markdown
  - follow-up edit still succeeds after normalization
- prompt policy
  - general agents mention patch-first defaults
  - Feishu assistant guidance no longer over-biases toward `workspace_edit_file`

## Rollout order

1. Upgrade `workspace_apply_patch` first
2. Upgrade `workspace_edit_file` matcher second
3. Update agent and Feishu prompt guidance third
4. Run targeted regression coverage across built-in tools, conversation service, and prompt policy tests

This order ensures the stronger primary mechanism exists before prompt guidance starts steering more traffic toward it.

## Risks and mitigations

### Risk: over-permissive matching edits the wrong region

Mitigation:

- keep `workspace_edit_file` unique-match semantics for non-`replaceAll`
- prefer failure over uncertain mutation
- add ambiguity tests for repeated sections

### Risk: patch engine complexity increases maintenance cost

Mitigation:

- isolate logic in dedicated helpers
- keep matching passes deterministic and ordered
- mirror `opencode` behavior only where it clearly improves robustness

### Risk: existing prompts still send fragile edit calls

Mitigation:

- explicitly rewrite prompt guidance
- add tests that snapshot the relevant tool policy text

## Success criteria

- Ordinary code/document edits fail less often due to formatting drift
- Feishu draft follow-up edits keep working after write normalization
- `workspace_apply_patch` becomes the reliable default editing path
- `workspace_edit_file` remains available but is no longer the fragile default for broad local revisions
