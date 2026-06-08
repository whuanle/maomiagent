# Workspace Experience State And Stop Consistency Design

Date: 2026-06-08
Status: Draft for review
Owner: Codex

## Context

The desktop app currently mixes several state sources for chat and UI designer flows:

- renderer-local `useState`
- renderer `localStorage`
- workspace-scoped `.maomi` files
- desktop conversation database and runtime state

That split causes visible experience failures:

- chat workspace tabs are not fully restored after app restart
- UI designer does not reliably stay on the last active workspace and conversation
- session stop requests can appear ineffective
- the session rail and session detail can disagree about whether a session is still running
- users can get stuck on a running session because state transitions do not converge cleanly

The user-approved target is:

- restore the full working scene for chat and UI designer
- keep stop semantics conservative, meaning the UI only treats a session as fully stopped after backend confirmation
- still provide an effective, observable, retryable stop flow so stop actions never feel ignored
- use mixed persistence:
  - app-level persistence for page scene recovery
  - workspace-level `.maomi` persistence for workspace preferences and design artifacts

## Goals

- Restore the full chat work scene across app restarts:
  - open workspace tabs
  - active workspace tab
  - selected session per workspace
- Restore the full UI designer work scene across page switches and app restarts:
  - current workspace
  - current conversation
  - current stage
- Define one consistent state model for scene recovery, runtime execution overlays, and backend truth.
- Make stop behavior observable immediately and convergent eventually.
- Keep session rail, detail pane, composer, and module-specific views in sync when a session is stopping or finishing.
- Introduce the new model incrementally without a destructive page rewrite.

## Non-Goals

- This work does not redesign chat or UI designer page layouts.
- This work does not move existing workspace-scoped settings out of `.maomi`.
- This work does not redefine backend conversation semantics beyond the stop-confirmation and recovery rules needed for consistency.
- This work does not add cloud sync or cross-machine state replication.

## Problem Summary

### 1. Scene persistence is incomplete and inconsistent

Chat already persists part of its shell state in renderer `localStorage`, but only for workspace tabs. UI designer does not have an equivalent persisted scene model for workspace, session, and stage restoration.

As a result:

- chat can reopen to an incomplete scene
- UI designer falls back to another workspace or conversation after navigation or restart
- modules recover with different rules even though users perceive them as one desktop product

### 2. Selection state is overwritten by reload logic

Both chat and UI designer have reload flows that resolve the next selected workspace or session from currently available items. Those flows are safe for missing data, but they also make it too easy to replace a still-valid user selection with the first available item.

That turns a refresh into a scene mutation.

### 3. Stop state is derived from scattered booleans

Chat and UI designer each combine a different set of local booleans, runtime events, and detail snapshots to decide whether a session is active or stopping.

That creates several failure modes:

- stop button click produces no immediate, reliable feedback
- runtime events can keep the rail in a running state after detail has already changed
- the detail view and the left rail can disagree about the same session
- switching sessions during stop can feel blocked or unsafe

### 4. State ownership is unclear

Today there is no explicit rule for which layer owns:

- durable scene recovery
- backend truth about a session
- transient execution overlays such as sending or waiting for stop confirmation

Without those boundaries, different parts of the UI keep re-deriving state differently.

## Approaches Considered

### A. Patch each page independently

Add more local persistence in chat and UI designer separately, and fix stop logic in each page in place.

Pros:

- lowest immediate code churn
- quickest local fixes

Cons:

- keeps multiple state models alive
- does not give new modules a stable pattern
- stop consistency problems are likely to recur

### B. Frontend-only shared cache layer

Add one renderer-only shared state store for both scene recovery and runtime state, while leaving backend truth loosely coupled.

Pros:

- simpler UI integration than a larger architectural cleanup
- unifies some behavior across modules

Cons:

- backend truth and renderer cache can drift
- stop confirmation remains fragile if the shared cache becomes authoritative by accident

### C. Layered state system with explicit ownership

Split state into:

- domain truth
- durable scene recovery
- transient execution overlays

and make pages consume composed selectors instead of assembling their own truth.

Pros:

- matches the actual problem shape
- supports both full-scene restore and stop consistency
- scales to more modules later

Cons:

- larger up-front design effort
- requires careful migration boundaries

## Recommendation

Choose Approach C.

The current failures are not isolated bugs. They come from mixed state ownership. A layered state system is the smallest design that can solve both full-scene recovery and stop consistency without reintroducing the same problem in another module.

## Proposed Design

## 1. State Layers

Introduce a shared workspace experience state model with three explicit layers.

### 1.1 Domain Truth Layer

This layer contains data that must match backend or persisted business truth:

- workspace list
- conversation session list
- conversation session detail
- conversation session status
- UI designer design package state
- workspace-scoped conversation settings in `.maomi`

Sources remain the existing bridge, desktop stores, workspace files, and runtime-backed detail loading. This layer never stores speculative UI states such as "probably stopped".

### 1.2 Durable Scene Layer

This layer contains only "what scene should be restored when the user returns".

It is app-scoped and persists outside workspaces. It must survive app restart.

It stores:

- chat opened workspace tabs
- chat active workspace tab
- chat selected session per workspace
- UI designer workspace
- UI designer selected session
- UI designer active stage
- optionally other non-business scene values that are required for direct return to work

It does not store runtime execution flags.

### 1.3 Execution Overlay Layer

This layer contains short-lived runtime UI overlays:

- sending
- stop requested
- waiting for stop confirmation
- replying interaction
- stop timeout / retryable failure markers
- last runtime event timestamp
- last detail sync timestamp

This layer is not durable across restart. After app restart it is rebuilt from domain truth and fresh runtime activity.

### 1.4 Consumption Rule

Pages do not decide truth from ad hoc local booleans. They read selectors that compose:

- domain truth
- durable scene
- execution overlays

This is the only allowed source for "what is selected now" and "is this session still running/stopping now".

## 2. Durable Scene Model

Add an app-level workspace experience state document with versioning and normalization.

Suggested shape:

```ts
type WorkspaceExperienceState = {
  version: 1;
  updatedAt: string;
  chat?: {
    openWorkspaceIds: string[];
    activeWorkspaceId?: string;
    workspaceSessions: Record<string, {
      selectedSessionId?: string;
    }>;
  };
  uiDesigner?: {
    workspaceId?: string;
    selectedSessionId?: string;
    activeStageKey?: string;
  };
};
```

The exact storage implementation may be a small desktop-side persisted state file or database-backed app store, but it must be app-scoped, not workspace-scoped.

## 3. Scene Recovery Rules

## 3.1 Priority Order

All scene recovery follows the same precedence:

1. explicit user selection in the current session
2. last valid durable scene value
3. safe automatic fallback

Reloads must never replace a still-valid explicit or restored selection with "the first item" just because fresh data arrived.

## 3.2 Chat Recovery

On activation or restart:

1. load durable chat scene
2. load current workspace list
3. reconcile `openWorkspaceIds` against real workspaces
4. reconcile `activeWorkspaceId`
5. for each remaining workspace, reconcile its stored `selectedSessionId` against the real session list for that workspace

Fallback rules:

- missing workspace ids are removed
- invalid `activeWorkspaceId` falls back to the first remaining open workspace, then to the first available workspace
- invalid session ids fall back only for the affected workspace

Required result:

- multiple opened chat workspaces restore correctly
- the previously active tab remains active if still valid
- each workspace restores its last selected session if still valid

## 3.3 UI Designer Recovery

On activation or restart:

1. load durable UI designer scene
2. load current workspace list
3. reconcile the stored workspace id
4. load UI designer sessions for that workspace
5. reconcile the stored session id
6. restore the stored stage if still valid, otherwise fall back to the default stage

UI designer must not switch workspace or session during ordinary reloads unless the current value is invalid.

## 3.4 Write Timing

Durable scene writes happen on explicit user actions and selected controlled transitions:

- open chat workspace tab
- close chat workspace tab
- activate chat workspace tab
- select chat session
- select UI designer workspace
- select UI designer session
- select UI designer stage

The app may also flush once on `beforeunload` as a safety net.

Background reloads must not overwrite valid scene state unless reconciliation proves the stored value is no longer valid.

## 4. Stop State Model

Stop behavior remains conservative:

- a session is only fully stopped after backend-confirmed non-active detail state

But the stop interaction must still become immediately visible and controllable.

Introduce a per-session execution overlay:

```ts
type SessionExecutionOverlay = {
  sessionId: string;
  phase?: "idle" | "sending" | "stop_requested" | "waiting_stop_confirm" | "stop_timeout";
  stopRequestedAt?: string;
  lastRuntimeEventAt?: string;
  lastDetailSyncAt?: string;
  stopAttemptCount?: number;
  lastStopError?: string;
};
```

## 5. Stop Lifecycle Rules

### 5.1 Immediate feedback

When the user clicks stop:

- mark the target session as `stop_requested`
- disable duplicate stop submits for that same request window
- show explicit "stopping" feedback immediately

This prevents the current "button clicked but nothing happened" experience.

### 5.2 Backend request

Send the existing `stopMessage` request.

If the request throws:

- move the overlay out of stop-requested state
- surface a visible failure message
- allow retry

If the request returns but detail remains `active`:

- transition to `waiting_stop_confirm`
- continue listening to runtime events and detail refreshes

### 5.3 Confirmation rule

A stop flow is considered complete only when fresh detail confirms:

- `detail.status !== "active"`

At that point:

- clear stopping overlay
- clear stale sending overlay for that session
- update all UI consumers from the same selector result

### 5.4 Runtime events during stopping

Runtime events arriving after stop request do not imply failure. They may represent trailing provider output or shutdown work.

During `waiting_stop_confirm`:

- the rail and the detail pane must use the same stop-aware execution selector
- the user may switch to another session
- the stopping session remains visibly "stopping / awaiting confirmation"

### 5.5 Timeout behavior

If stop confirmation does not converge within a defined threshold, for example 8-15 seconds:

- do not pretend stop succeeded
- move overlay to `stop_timeout`
- surface a visible retryable warning
- keep the session switchable
- allow a fresh stop attempt

This preserves conservative semantics without leaving the user in an endless silent waiting state.

## 6. Execution Selector Rules

Renderer consumers must stop deriving execution state from scattered booleans.

Use one shared selector with logic equivalent to:

```ts
isExecuting =
  detail.status === "active"
  || overlay.phase === "sending"
  || overlay.phase === "stop_requested"
  || overlay.phase === "waiting_stop_confirm";

isStopping =
  overlay.phase === "stop_requested"
  || overlay.phase === "waiting_stop_confirm"
  || overlay.phase === "stop_timeout";
```

The exact selector may include replying-interaction states as separate output, but all UI surfaces must use the same source.

## 7. Ownership Boundaries

### 7.1 App-level scene ownership

New app-level workspace experience state owns:

- chat durable scene
- UI designer durable scene

### 7.2 Workspace-level ownership

Existing workspace-scoped files continue to own:

- conversation workspace settings
- design package files
- other workspace-specific module data

### 7.3 Runtime ownership

Conversation detail and runtime event feeds continue to own:

- actual session status
- run/message/tool-call/interaction progression

The execution overlay only decorates this truth while requests are in flight.

## 8. Implementation Units

Implement the design in four units.

### 8.1 Workspace Experience State Service

New shared service responsible for:

- reading and writing app-level durable scene state
- normalizing persisted values
- reconciling stale ids
- exposing pure helpers/selectors for scene recovery

### 8.2 Session Execution Overlay Store

New shared store responsible for:

- sending/stop/stop-timeout overlays
- stop request bookkeeping
- unified execution selectors

### 8.3 Module Adapters

Chat and UI designer each adopt the shared services, but keep their current domain-specific controllers and views.

They stop owning:

- bespoke scene persistence rules
- bespoke stop truth rules

### 8.4 Stop Confirmation Integration

Use the existing backend stop entry point as the request trigger, but treat it as the beginning of stop convergence rather than the final truth by itself.

No protocol rewrite is required in the first slice.

## 9. Migration Plan

Migrate in this order:

1. add the workspace experience state service
2. migrate chat durable scene recovery:
   - workspace tabs
   - active workspace
   - selected session per workspace
3. migrate UI designer durable scene recovery:
   - workspace
   - selected session
   - active stage
4. add the shared execution overlay store
5. migrate chat stop behavior to shared selectors
6. migrate UI designer stop behavior to shared selectors
7. remove obsolete page-local persistence and conflicting booleans

This order keeps each step independently testable and avoids a single high-risk rewrite.

## 10. Testing

Add or update tests for the following behaviors.

### 10.1 Durable scene service

- normalizes malformed persisted state safely
- removes invalid workspaces during reconciliation
- preserves valid restored selections
- falls back only when a stored value is invalid

### 10.2 Chat recovery

- restores multiple open workspaces after app restart
- restores the previously active workspace tab
- restores selected session per workspace
- falls back only for the workspace or session that is invalid

### 10.3 UI designer recovery

- preserves workspace across page switches
- restores workspace/session/stage after app restart
- does not switch to the first workspace during ordinary reload if the stored workspace is still valid

### 10.4 Stop consistency

- clicking stop immediately shows a stopping state
- detail and rail use the same execution result during stop confirmation
- users can switch away from a stopping session
- stop timeout becomes visible and retryable
- non-active detail clears stopping state everywhere

## 11. Acceptance Criteria

This work is complete when all of the following are true.

### 11.1 Chat scene recovery

- after reopening the app, chat restores the previously opened workspaces
- the previously active chat workspace remains active if still valid
- the selected session for each restored workspace remains selected if still valid

### 11.2 UI designer scene recovery

- navigating away from UI designer and back does not unexpectedly change the current workspace
- reopening the app restores the previous UI designer workspace, session, and stage when still valid

### 11.3 Stop experience

- clicking stop always causes immediate visible feedback
- stop requests never look ignored
- the session rail and detail pane agree about execution state while a stop is pending
- users can switch to another conversation while one stop is pending
- the UI exits the running state only after backend-confirmed non-active detail
- failed or timed-out stop requests surface actionable retry feedback

## 12. Risks

### 12.1 Hidden coupling in current page hooks

Current hooks may contain implicit assumptions that selection can be reset during reload. Migration must identify and remove those assumptions carefully.

### 12.2 Dual-write period during migration

While moving from page-local persistence to shared durable scene storage, temporary duplication may occur. This must be controlled so one layer does not overwrite the other unpredictably.

### 12.3 Overlay never clears on missing detail transitions

If detail reload paths miss a final non-active transition, stop overlays could linger. Tests must cover both runtime-event and explicit-detail refresh completion paths.
