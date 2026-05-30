# Feishu Doc Permission Diagnostics Design

Date: 2026-05-30
Status: Draft for review
Owner: Codex

## Context

The current Feishu document pull flow attempts to reverse whiteboard-like blocks into Mermaid source when possible. That recovery path is best-effort:

- `FeishuDocTreeRemoteSource.readDocumentBundle(...)` reads the remote document and normalizes it into IR
- `reverseWhiteboardsInIR(...)` tries to recover Mermaid code for `whiteboard`, `board`, and `diagram` tokens
- when code recovery fails, the pull continues and the document falls back to token-based whiteboard blocks such as `<whiteboard token="..."/>`
- the local preview layer then renders those token blocks through whiteboard preview images

The current problem is not only that recovery can fail. It is that permission failures are silent.

Today:

- `queryWhiteboardCode(...)` errors are swallowed in the whiteboard recovery path
- the user sees a successful pull, but the local document still shows image-backed whiteboard previews instead of Mermaid source
- there is no visible explanation of whether the cause is whiteboard access, doc or wiki access, expired auth, or a non-permission runtime failure
- developers have to inspect cached Markdown or manually call OpenAPI endpoints to understand why recovery did not happen

Recent evidence in the live environment shows:

- the current OAuth token already carries requested board and document scopes
- the same token still receives permission-denied responses from whiteboard and document endpoints for the target resources
- therefore, "the app requested the scope" is not sufficient to prove "the current identity can read this document and its whiteboards"

The user requirement is to stop hiding this state:

- normal pulls should still succeed and fall back to preview images when reversal fails
- the product should explicitly tell the user when Mermaid recovery was skipped because of permission limits
- developers should be able to inspect the current document's permission chain without manually using curl or logs

## Goals

- Make whiteboard recovery permission failures visible to users instead of silently degrading.
- Distinguish confirmed permission failures from auth-expired and non-permission runtime failures.
- Add a current-document permission self-check flow for debugging and support.
- Keep pull itself best-effort and non-blocking.
- Keep diagnostics scoped to the current document and current whiteboard set.

## Non-Goals

- This work does not redesign OAuth or token refresh behavior.
- This work does not build a general-purpose permission center.
- This work does not automatically fix permissions, resharing, or reauthorize users.
- This work does not block document pull when only whiteboard reversal fails.
- This work does not change the Mermaid reversal success criteria or whiteboard push mapping rules.

## Approaches Considered

### A. Keep silent fallback and rely on logs

Leave the pull path unchanged and expect developers to inspect logs, local cache, or manual API calls.

Pros:

- no product changes
- smallest implementation

Cons:

- users cannot understand why local content is still preview-image based
- support and debugging remain slow
- permission issues look indistinguishable from feature regressions

### B. Add user-visible pull warnings only

Collect recovery failures during pull and surface a warning when whiteboard reversal falls back because of permissions.

Pros:

- fixes the most confusing product behavior
- small UI surface

Cons:

- still leaves developers without structured current-document diagnostics
- users and developers still need manual tooling to determine which layer failed

### C. Add user-visible pull warnings plus a current-document permission self-check

Collect structured diagnostics during pull, show one warning for permission-based fallback, and provide a lightweight self-check entry for the current document.

Pros:

- fixes silent failure in the normal flow
- makes current-document debugging practical
- avoids building a large permission-management subsystem

Cons:

- touches both runtime and workbench surfaces
- introduces new diagnostic data contracts

## Recommendation

Choose Approach C.

The problem is not only visibility during pull, and it is not only debugging after the fact. We need both:

- a user-visible explanation in the normal pull flow
- a developer-friendly document-level self-check to confirm whether the current OAuth identity can read the current wiki node, doc, and whiteboard code

This keeps the implementation small and task-focused:

- do not redesign OAuth
- do not build a standalone diagnostics page
- do not change the main editor model
- only expose enough information to explain why Mermaid reversal degraded to preview images

## Proposed Design

### 1. Pull collects structured reversal diagnostics instead of swallowing errors

The whiteboard recovery step remains best-effort, but it no longer treats all failures as silent `null`.

During pull, the runtime should collect a structured diagnostic summary for:

- document-level access probes already performed by the pull flow
- whiteboard code export failures encountered during reversible Mermaid recovery

Each failure is normalized into one of these categories:

- `permission`
- `auth`
- `network`
- `unknown`

The pull still succeeds unless the broader document read itself fails as it already would today.

Behavior:

- if one whiteboard fails to reverse, the rest of the document still lands locally
- token-based whiteboard blocks remain the fallback representation
- the diagnostic summary is attached to the pull result so the frontend can explain the fallback

### 2. Permission error classification is conservative and explicit

The UI must only say "permission denied" when the runtime has a confirmed permission-shaped error.

Phase-one confirmed permission mappings:

- board `2890005` -> `permission`
- wiki `131006` -> `permission`
- docx `1770032` -> `permission`

Phase-one auth mapping:

- token-expired or invalid-token style responses -> `auth`

Everything else:

- network timeout or transport interruption -> `network`
- server-side 5xx or response-shape failure -> `unknown`

Rules:

- only confirmed permission mappings produce "current Feishu account lacks permission" copy
- auth failures produce reauthorization-oriented copy instead of resource-permission copy
- network and unknown failures produce generic fallback copy and do not claim permission loss

This prevents two common misdiagnoses:

- transient failures presented as access issues
- expired authorization presented as a missing doc share

### 3. Pull surfaces one warning when reversal fell back because of permissions

The frontend should not spam one toast per whiteboard.

Instead:

- after a successful pull, inspect the diagnostic summary
- if at least one whiteboard or the parent document had a confirmed permission denial, show one warning message
- the warning explains that some whiteboards could not be restored as Mermaid source and were kept as preview-backed whiteboard blocks

The warning should be document-scoped and current-action scoped:

- it appears after the pull action that produced the fallback
- it does not persist as a permanent page banner unless the workbench already has an appropriate lightweight state area

Message intent:

- "pull succeeded"
- "Mermaid recovery was partial"
- "the reason was permission, not a rendering bug"

### 4. Add a lightweight current-document permission self-check

Add a small "Permission Check" action near the current document operations in the docs workbench.

This is not a standalone page and not a global permission center.

The self-check opens a lightweight modal or drawer and probes only the current document context.

The self-check shows:

- current authorization summary
  - auth status
  - last authorized time
  - access token expiry
  - presence of key scopes:
    - `board:whiteboard:node:read`
    - `docx:document:readonly`
    - `wiki:node:read`
- current document checks
  - wiki node read probe result
  - docx document read probe result
  - code and message for each probe
- current whiteboard checks
  - the number of whiteboard-like tokens found in the current document
  - probes for up to the first three tokens
  - token shorthand, result, error code, and error message per token
- latest pull recovery summary
  - recovered Mermaid count
  - permission-fallback count
  - other-fallback count

The self-check intentionally does not:

- mutate document content
- reauthorize the user
- retry broader pull flows
- probe every whiteboard token in very large documents

### 5. Diagnostics use two separate data contracts

There are two related but distinct data shapes.

#### A. Pull-time reversal diagnostics

This is attached to the pull result and exists to explain the most recent pull outcome.

Suggested shape:

- `docDiagnostics.pull.whiteboardRecovery`
  - `status = "ok" | "partial" | "blocked"`
  - `recoveredCount`
  - `fallbackCount`
  - `permissionDeniedCount`
  - `documentPermissionDenied`
  - `entries[]`

Each `entries[]` item contains only the minimum fields needed for UI and logs:

- `token`
- `stage = "wiki" | "docx" | "whiteboard_code"`
- `code`
- `message`
- `category = "permission" | "auth" | "network" | "unknown"`
- `fallbackApplied = true`

#### B. On-demand self-check diagnostics

This is produced only when the user explicitly runs the document-level self-check.

Suggested shape:

- `docDiagnostics.inspect`
  - `checkedAt`
  - `identity`
    - `authStatus`
    - `lastAuthorizedAt`
    - `accessTokenExpiresAt`
    - `keyScopes`
  - `document`
    - `wiki`
    - `docx`
  - `whiteboards[]`
    - `token`
    - `probeResult`
    - `code`
    - `message`

This split keeps responsibilities clean:

- pull-time diagnostics explain the just-completed action
- self-check diagnostics provide a fresh view of the current access situation

### 6. Compatibility and fallback behavior stay unchanged

This feature must not alter the underlying pull safety model.

Compatibility rules:

- documents without whiteboards behave exactly as they do today
- supported whiteboards that reverse successfully still become Mermaid fenced blocks
- unsupported or failed whiteboards still remain token-based and preview-image backed
- local Markdown, IR, and reversible mapping rules are unchanged except for new diagnostics metadata

The feature is explanatory, not behavioral, except for making failures visible.

## Error Handling

- Pull does not fail merely because a whiteboard cannot be reversed.
- Document-level probes that already fail the overall pull continue to do so according to current behavior.
- Whiteboard reversal errors are captured, normalized, and surfaced through diagnostics.
- Self-check probe failures are shown inline in the self-check result and do not mutate editor state.

## Testing

Add or update tests for at least the following:

### Pull diagnostics

- `queryWhiteboardCode(...)` returning board `2890005` creates a `permission` diagnostic entry and keeps pull successful.
- wiki `131006` creates a document-level `permission` diagnostic entry.
- docx `1770032` creates a document-level `permission` diagnostic entry.
- token-expired or invalid-token responses classify as `auth`, not `permission`.
- unknown failures classify as `unknown` or `network`, not `permission`.

### Frontend feedback

- successful pull with `permissionDeniedCount > 0` shows exactly one warning message
- non-permission fallback does not show permission-oriented wording
- i18n keys are used for all new messages

### Self-check action

- self-check returns identity summary, document probe results, and whiteboard probe results
- self-check probes at most three whiteboard tokens
- self-check works correctly when the document has no whiteboards

### Compatibility

- documents with no diagnostics remain unchanged
- documents with fully successful Mermaid recovery produce no warning
- fallback to token-based whiteboard preview still works when diagnostics are present

## Risks and Mitigations

- Risk: too many error codes are mislabeled as permission problems.
  - Mitigation: only map explicitly confirmed codes in phase one.

- Risk: users see noisy repeated warnings for large documents with many whiteboards.
  - Mitigation: collapse pull feedback into one warning per pull action.

- Risk: the self-check grows into a general admin surface.
  - Mitigation: keep it current-document scoped and read-only.

- Risk: diagnostics become stale and misleading.
  - Mitigation: distinguish clearly between pull-time summary and on-demand self-check results.

## Open Questions

None for phase one.

The design intentionally keeps scope narrow:

- no OAuth redesign
- no global permission dashboard
- no automatic remediation
