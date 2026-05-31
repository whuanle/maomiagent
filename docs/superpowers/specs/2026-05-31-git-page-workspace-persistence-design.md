# Git Page Workspace Persistence Design

Date: 2026-05-31
Status: Draft for review
Owner: Codex

## Context

The Git page already has a small UI-state persistence layer:

- `apps/desktop/MaomiAgent/src/mainview/modules/git/git-page-ui-state.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/git/page.tsx`

Today that state is stored in `sessionStorage`, so it survives tab switches inside the current desktop renderer session, but it does not survive an app restart.

The user-visible problem is straightforward:

- reopen the app
- open the Git page again
- the previously selected workspace is lost
- the page falls back to another workspace, so the user has to reselect the workspace manually

The required behavior is:

- the Git page should remember the last selected workspace across app restarts

## Goals

- Persist the Git page workspace selection across app restarts.
- Restore the last valid workspace when the Git page becomes active.
- Keep the existing Git page state model simple and local to the Git module.
- Preserve safe fallback behavior when the cached workspace no longer exists.

## Non-Goals

- This work does not redesign the Git page layout.
- This work does not redesign the workspace selector UI.
- This work does not add a new global settings store.
- This work does not change Git snapshot loading behavior beyond the state-restore sequence needed for workspace recovery.

## Problem

There are two issues in the current flow.

### 1. Persistence lifetime is too short

`git-page-ui-state.ts` stores state in `sessionStorage`. That means:

- the state survives route changes in the current renderer session
- the state is cleared once the app session ends

This does not match the required “reopen the app and keep my last workspace” behavior.

### 2. Workspace restoration competes with default selection

`page.tsx` restores `workspaceId` into an intermediate `restoredWorkspaceId`, then later resolves the actual selected workspace after the workspace list loads.

That is the right general idea, but the restore flow should explicitly prefer:

1. current valid selection
2. persisted valid workspace
3. first available workspace

That ordering must remain the source of truth so the cached workspace is not accidentally displaced by default selection logic.

## Approaches Considered

### A. Persist only `workspaceId` in a separate local-storage key

Pros:

- smallest possible code change
- very low migration risk

Cons:

- creates a second persistence rule beside `git-page-ui-state`
- makes future Git page state harder to reason about

### B. Persist the existing Git page UI state in durable storage

Pros:

- keeps one state entry point for Git page restoration
- solves the workspace issue without introducing parallel storage rules
- keeps room for future Git page restore behavior

Cons:

- requires a small persistence migration
- needs tests for old-state fallback and invalid workspace recovery

### C. Add a dedicated workspace preference in a higher-level shell store

Pros:

- could unify “last selected workspace” behavior across modules later

Cons:

- larger scope than the current need
- couples a local Git page concern to a broader settings system

## Recommendation

Choose Approach B.

The Git page already has a local persistence model, so the cleanest fix is to make that model durable enough for restart recovery instead of introducing a second storage path. This keeps the implementation small, readable, and aligned with the current module boundary.

## Proposed Design

### 1. Persistence storage

`git-page-ui-state.ts` will move from `sessionStorage` to `localStorage`.

The persisted shape remains the current Git page state model:

- `workspaceId`
- `activeTab`
- `commitReview`

No new fields are required for this task.

This keeps the user-visible change focused:

- selected workspace survives app restarts
- currently active Git tab can also survive app restarts

### 2. Restore flow in `GitPage`

When the Git page becomes active:

1. read the persisted Git page state
2. restore `activeTab`
3. remember the persisted `workspaceId`
4. load the workspace list
5. resolve the final selected workspace with this priority:
   - current in-memory selection if still valid
   - persisted workspace if still valid
   - first available workspace

This explicit priority order prevents the cached workspace from being overridden by the default first workspace.

### 3. Invalid-cache behavior

If the persisted `workspaceId` no longer exists in the workspace list:

- do not show an error just for stale cache
- fall back to the first available workspace
- write the resolved value back through the normal page-state persistence flow

If stored JSON is malformed or unreadable:

- ignore it
- return `null` from the state reader
- continue with the current safe defaults

### 4. State ownership

This work keeps state ownership local:

- `git-page-ui-state.ts` remains responsible for normalization and storage I/O
- `page.tsx` remains responsible for deciding which workspace should actually be selected after workspace options load

No new shared shell helper is needed.

## Data Flow

### Initial activation

1. `GitPage` becomes active.
2. `readGitPageUiState()` loads durable state from `localStorage`.
3. `GitPage` stores the restored `workspaceId` candidate and restored `activeTab`.
4. `loadWorkspaces()` fetches available workspaces.
5. The page resolves the effective `workspaceId` using the restore priority order.
6. Snapshot loading begins for the resolved workspace.
7. `writeGitPageUiState()` persists the resolved state back to storage.

### Later workspace changes

1. the user selects another workspace
2. `workspaceId` state updates
3. snapshot reloads for the new workspace
4. `writeGitPageUiState()` persists the new workspace selection

## Testing

Add or update tests to cover:

1. `git-page-ui-state.ts`
   - reads from durable storage
   - writes to durable storage
   - ignores malformed stored data
2. `GitPage`
   - restores the last selected workspace when that workspace still exists
   - falls back to the first workspace when the cached workspace is missing
   - preserves the priority order of current selection over restored selection over first available workspace

## Risks

### 1. Old session-only assumptions

Some current expectations may assume Git page state disappears after restart. Tests should be updated to reflect the new persistent behavior where relevant.

### 2. Persisting too much stale review state

Because the existing persisted shape already includes `commitReview`, durable storage may also keep review-related selections longer than before. That is acceptable for this change as long as invalid values continue to normalize safely.

### 3. Missing workspace after environment changes

Workspaces can disappear between sessions. The implementation must treat that as a normal recovery path, not as an error state.

## Acceptance

This work is complete when:

1. selecting a workspace on the Git page persists across app restart
2. reopening the Git page restores the last valid workspace automatically
3. an invalid cached workspace falls back to the first available workspace without breaking the page
4. Git page UI-state tests and Git page restore-behavior tests pass
