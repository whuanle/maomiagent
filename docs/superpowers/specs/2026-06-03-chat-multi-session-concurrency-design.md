# Chat Multi-Session Concurrency Design

## Background

The desktop chat stack currently behaves as if only one conversation can be "working" at a time. This breaks a core user workflow: users may have multiple workspaces and multiple sessions open for different tasks, and those sessions must be able to run independently.

The runtime already tracks active turns by `sessionId`, so the hard limitation is not inside the AI turn engine itself. The main blockers are higher in the stack:

- `DesktopConversationService` serializes conversation mutations through one global `mutationQueue`, so `sendMessage`, `answerInteraction`, and `rejectInteraction` for different sessions wait on each other.
- `useChatWorkspacePaneState` keeps `sendingMessage`, `stoppingSessionId`, and `replyingInteractionId` as global UI state, so one active session disables operations in unrelated sessions.

This design introduces session-scoped concurrency while preserving single-session safety.

## Goals

- Allow different conversation sessions to run in parallel, including across different workspaces.
- Preserve strict serialization within a single session.
- Keep approval, question, and form interactions isolated to the owning session.
- Ensure stop, retry, runtime event merging, and detail polling continue to work without cross-session bleed.
- Minimize behavioral changes for non-chat mutation paths.

## Non-Goals

- No attempt to make a single session process multiple active turns concurrently.
- No broad refactor of all service-level mutation queues in unrelated modules.
- No change to conversation runtime semantics beyond what is required to support safe session-level parallelism.

## Recommended Approach

Use session-scoped mutation queues in the conversation service and session-scoped activity state in the chat workspace hook.

This keeps the existing safety model where one session has one active mutation pipeline, but removes the artificial global bottleneck across unrelated sessions.

## Architecture

### 1. Backend locking model

`DesktopConversationService` will move from one global mutation queue to a two-tier model:

- A retained global mutation queue for non-session-scoped mutations that update broad shared state.
- A new per-session queue registry for session-scoped mutations.

The service will expose two private helpers:

- `runGlobalMutation(work)`
- `runSessionMutation(sessionId, work)`

`runSessionMutation` will:

- resolve and normalize the session id first
- chain work onto the queue for that session only
- clean up idle queue entries after completion to avoid unbounded map growth

The following operations will use `runSessionMutation`:

- `sendMessage`
- `answerInteraction`
- `rejectInteraction`

The following operations remain global or direct:

- `createSession`
- `renameSession`
- `hideSession`
- `applyWorkspaceSettings`
- `saveWorkspaceSettings`
- `listSessions`
- `getSession`
- `getSessionDetail`
- `stopMessage`

Rationale:

- `sendMessage`, `answerInteraction`, and `rejectInteraction` all mutate one session's active execution chain and must stay serialized per session.
- `stopMessage` targets runtime state by `sessionId` and should not wait behind unrelated session queues; it must stay responsive.
- Workspace-wide operations should not be coupled to one session queue.

### 2. Session activity ownership

The system will treat the session as the unit of active chat work. For each session we may independently track:

- sending
- stopping
- replying interaction id

These states must never be represented as a single global boolean for the whole chat pane.

Frontend state in `useChatWorkspacePaneState` will move to per-session maps or sets:

- `sendingSessionIds: Record<string, true>` or equivalent set-like state
- `stoppingSessionIds: Record<string, true>`
- `replyingInteractionIdsBySessionId: Record<string, string | null>`

Derived selected-session values stay simple:

- `sendingMessage` becomes `Boolean(selectedSessionId && sendingSessionIds[selectedSessionId])`
- `stoppingMessage` becomes `Boolean(selectedSessionId && stoppingSessionIds[selectedSessionId])`
- `replyingInteractionId` becomes the selected session's current interaction reply state

This preserves the current component contracts while eliminating cross-session interference.

### 3. Runtime event and polling compatibility

Runtime events and fallback polling are already session-oriented and should remain that way.

The implementation must ensure:

- runtime event merges only clear sending/stopping state for the session contained in the event
- fallback polling only manages the target session it was started for
- switching the visible session never resets activity state for another session

The existing `activeTurns` map inside the conversation runtime remains unchanged and continues to be the source of truth for in-flight runtime work by `sessionId`.

### 4. Interaction handling

Blocked interactions belong to the originating session and must remain resumable even while another session is active.

Expected behavior:

- Session A can be blocked on permission/question/form interaction.
- User switches to Session B and continues normal work.
- User switches back to Session A later and submits the interaction.
- The submit/reject action only locks Session A and does not pause or cancel Session B.

This requires both the service lock and the frontend reply state to remain session-scoped.

## Data Flow

### Send message

1. User sends a message in Session A.
2. Frontend marks only Session A as sending.
3. Backend runs `sendMessage` in Session A's queue.
4. Session B remains eligible for its own `sendMessage`.
5. Runtime events for Session A only update Session A state.
6. When Session A completes or fails, only Session A sending state is cleared.

### Concurrent send in another session

1. Session A is active.
2. User switches to Session B.
3. Session B composer remains enabled unless Session B itself is already active.
4. Backend places Session B work into Session B's own queue, not behind Session A.
5. Both sessions stream and settle independently.

### Interaction reply

1. Session A is waiting on an interaction.
2. User answers the interaction.
3. Frontend marks only Session A as replying.
4. Backend runs `answerInteraction` or `rejectInteraction` through Session A's queue.
5. Session B remains unaffected.

## Error Handling and Safety Rules

### Single-session safety

If the user attempts to trigger overlapping mutations for the same session, the queue must serialize them instead of racing them.

Examples:

- double-click send in one session
- send while an interaction reply for the same session is still settling
- reject and answer submitted nearly simultaneously for the same interaction

### Queue cleanup

Session queue entries must be removed when the queued work chain settles and no newer work has replaced that chain. This prevents the lock registry from becoming a memory leak.

### Stop behavior

`stopMessage` should remain best-effort and immediate:

- it should not wait behind Session A's own queued `sendMessage`
- it should not acquire or block unrelated session queues
- after stop completes, only the target session's sending/stopping state is reconciled

### Failure isolation

A failure in Session A must not:

- clear sending state for Session B
- overwrite Session B detail
- block Session B from starting or resuming work

## Testing Plan

### Backend tests

Add or update tests in `desktop-conversation-service.test.ts` to cover:

- two sessions can `sendMessage` concurrently without one waiting for the other to finish
- same-session sends remain serialized
- interaction reply in Session A does not block send in Session B
- queue cleanup does not break later sends for the same session

### Frontend tests

Add hook- or component-level tests to cover:

- Session A sending does not disable Session B composer after switching sessions
- stopping Session A does not show stopping state in Session B
- replying to an interaction in Session A does not mark Session B as replying
- runtime events for Session A only clear Session A sending state

### Regression checks

- active session streaming still updates detail view correctly
- stop still works for a streamed reply
- managed takeover and fallback polling continue to operate with session-scoped state

## Implementation Notes

- Keep public API shapes stable where possible by deriving selected-session booleans from per-session state.
- Prefer small helper functions for per-session state transitions instead of open-coded object mutation in many places.
- Do not widen concurrency for store-wide administrative mutations in this change.
- Land backend and frontend changes together; partial rollout would leave the product in a broken mixed mode.

## Risks

### Risk: subtle cross-session UI resets

Mitigation:

- only clear session activity through helpers that require an explicit `sessionId`
- add targeted tests around runtime event merges and fallback polling

### Risk: same-session race after removing the global queue

Mitigation:

- keep strict per-session serialization for send and interaction operations
- do not rely on runtime safeguards alone

### Risk: stop semantics regress

Mitigation:

- leave `stopMessage` outside the per-session queue
- retain existing runtime abort path
- add regression coverage around stopping a streamed reply

## Rollout

This change should ship as one coherent backend + frontend patch. The code should not be split into separate releases because either side alone would preserve part of the current bottleneck or create inconsistent activity state.
