# Task Center Surface and Lifecycle Reduction Design

Date: 2026-05-19
Status: Draft for review
Owner: Codex

## 1. Context

The current desktop task center spans three user-visible tabs in [apps/desktop/MaomiAgent/src/mainview/modules/tasks/page.tsx](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks/page.tsx):

- `会话任务`
- `定时任务`
- `执行任务`

The current page already groups some conversation-linked items by session, but the overall module still exposes raw internal task records directly to end users. Current inspection confirmed four relevant implementation facts:

- the page loads raw task-center items from [apps/desktop/MaomiAgent/src/mainview/lib/desktop-tasks.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/lib/desktop-tasks.ts) and then splits them into three tabs through [apps/desktop/MaomiAgent/src/mainview/modules/tasks/task-center-helpers.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks/task-center-helpers.ts)
- task-center projection in [apps/desktop/MaomiAgent/src/shared/desktop-task-center.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/desktop-task-center.ts) distinguishes automation, managed execution, child task, conversation, and generic sources, but it does not yet model a strict end-user-visible surface contract
- managed task definitions are deduplicated only while collecting live definitions in [apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/services/desktop-tasks-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/services/desktop-tasks-service.ts); existing stored task records are not hard-compacted by `taskKey`
- session archive and workspace removal paths in [apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts) and [apps/desktop/MaomiAgent/src/bun/modules/workspace/implementation/services/desktop-workspace-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/workspace/implementation/services/desktop-workspace-service.ts) do not currently trigger task cleanup

The user reported three product problems:

1. the task center is visually noisy and low-value because most tasks are actually internal agent work
2. scheduled tasks are not built as key-based singletons, so a task like Feishu token refresh can leave many redundant records
3. historical tasks linger after session or workspace removal even though that data no longer has user value

The user then confirmed three design decisions for this pass:

1. choose a product direction where the task center keeps only user-relevant tasks and hides background/internal task noise
2. on session archive, hide ordinary session-linked tasks first and purge them automatically after 7 days
3. keep the final page scope as:
   - user-intervention root tasks
   - system-level scheduled singleton tasks such as Feishu refresh token
   - currently running long-task root tasks even when they do not yet need user intervention

## 2. Problem Statement

The task center currently mixes three different concerns into one end-user page:

- user-facing task attention items
- system-level scheduled maintenance
- internal run tracking and agent execution exhaust

This creates the wrong product surface. End users should not need to scan raw background tasks, child tasks, or historical run records just to find the one item that actually needs action.

We need one focused reduction pass that changes both the page contract and the task lifecycle contract:

- show only user-relevant root tasks and a very small number of explicit system tasks
- enforce singleton-by-key behavior for system scheduled tasks
- make session and workspace lifecycle events reclaim task data automatically

This is not a general rewrite of the task system. It is a visibility, lifecycle, and storage-compaction correction pass.

## 3. Goals

- Replace the current three-tab end-user surface with a reduced task-center surface that only shows high-value tasks.
- Keep visible long-running managed root tasks when they are still active.
- Keep visible root tasks that require user intervention such as takeover, confirmation, verification, wrap-up, or failure resolution.
- Keep visible only explicit system-level scheduled singleton tasks such as Feishu refresh token.
- Stop showing ordinary conversation run tasks, child tasks, checkpoints, todos, and other internal execution records in the main task page.
- Enforce singleton-by-key behavior for system scheduled tasks.
- Hide session-linked ordinary tasks when the session is archived, then purge them automatically after 7 days.
- Hard-delete workspace-linked task data when the workspace is removed.
- Keep the page layout aligned with workspace rules:
  - `Tabs + toolbar + main table`
  - no dashboard, workbench, overview cards, side details, or explanatory filler copy
- Keep page code organized under a dedicated `components` directory for the task module.

## 4. Non-Goals

- No redesign of the underlying conversation runtime or long-task orchestration model.
- No new public-facing task creation workflow for end users.
- No attempt to expose more task controls to end users than they currently need.
- No conversion of the task center into a reporting dashboard or audit console.
- No broad historical analytics, statistics cards, or retention reporting UI.
- No separate off-line migration tool or manual database maintenance workflow.
- No deletion of still-relevant critical root tasks just because a related session was archived.

## 5. Approaches Considered

### Approach A: Frontend-only reduction

Keep the current backend behavior and filter noisy items only in the task page.

Pros:

- smallest visible change
- fastest short-term page cleanup

Cons:

- duplicated and orphaned task records still accumulate in storage
- `taskKey` remains a soft convention instead of a real singleton rule
- session and workspace cleanup still do not reclaim data
- page logic becomes an unreliable last-line filter instead of a clear task-domain contract

### Approach B: Task-domain visibility and lifecycle reduction

Add explicit task surfaces, lifecycle retention rules, singleton-by-key compaction, and cleanup hooks while rebuilding the task page around only visible task surfaces.

Pros:

- solves the user-visible noise and the storage bloat together
- keeps the change mostly inside the task domain plus narrow conversation/workspace hooks
- gives the page a stable contract instead of ad hoc filtering

Cons:

- touches multiple modules
- requires migration logic and new regression coverage

### Approach C: Split internal execution records and user tasks into fully separate subsystems

Create a new user-facing task domain and move all current run-tracking data into a separate internal subsystem.

Pros:

- architecturally clean long-term split
- very explicit separation of user and system concerns

Cons:

- much larger than the current product problem
- requires broader migration, routing, and bridge work
- too expensive for a targeted correction pass

## 6. Recommendation

Choose Approach B.

The user problem is not just that the page looks busy. The underlying task lifecycle is also wrong for the product. We need a task-domain rule set that decides which tasks are visible, which are internal, how singleton system tasks are compacted, and when orphaned data is reclaimed. That can be done without rebuilding the whole subsystem from scratch.

## 7. Proposed Design

### 7.1 End-user page contract

The task center page will be rebuilt as a two-tab resource page:

- `关键任务`
- `系统任务`

It will keep the required resource-page skeleton:

- tabs
- left-to-right toolbar
- one main table that fills the remaining height

It will not include:

- workbench/dashboard framing
- overview or statistics cards
- description cards
- right-side detail panels
- table-external status panels

The main page code should remain under [apps/desktop/MaomiAgent/src/mainview/modules/tasks](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks) and task-page UI pieces should be regrouped under that module's `components` directory rather than staying mixed into page-level files.

### 7.2 Visible task surfaces

The task domain will classify each task into one of three internal surfaces:

- `critical`
- `system`
- `internal`

Only `critical` and `system` may appear in the end-user task center.

Rules:

- `critical` means a root task with direct user value
- `system` means an explicit system-level scheduled singleton task
- `internal` means run tracking or subordinate work that should not appear in the end-user page

This classification belongs in the task domain, not only in the frontend.

### 7.3 Critical-task rules

`critical` tasks are the only user-facing operational tasks.

An item is `critical` when all of the following are true:

- it is a root task, defined as `rootTaskId === taskId` or equivalent root-task metadata
- it is either:
  - a long-task root task currently in progress
  - a root task that needs user intervention

User-intervention states include:

- takeover required
- task confirmation or approval required
- verification required
- wrap-up required
- failed and still unresolved
- blocked on explicit user input that has current user value

Visible running long tasks remain in `关键任务` even before they enter an intervention state, because the user explicitly chose to preserve running long-task roots.

### 7.4 System-task rules

`system` tasks are rare, explicit, and key-based singletons.

Examples:

- Feishu refresh token

Rules:

- a system task must be explicitly marked as system-level by its task definition or handler metadata
- system tasks render only in `系统任务`
- system tasks are always managed as singleton-by-key records
- system tasks are not ordinary workspace artifacts

The canonical singleton identity is:

- `scope + handlerId + taskKey`

For this pass, system tasks must use:

- `scope = "system"`
- `workspaceId = "system"`

This is an explicit reserved identity, not a user workspace. System scheduled tasks must not be stored under ordinary user-workspace ids.

### 7.5 Internal-task rules

`internal` tasks remain available to the runtime but disappear from the end-user page.

This includes:

- ordinary conversation run tasks created from one-off runs
- child tasks
- checkpoints
- todos
- subordinate managed execution artifacts
- background execution records with no current user action value
- historical success items that only serve internal tracing

These records may still exist temporarily for debugging, lifecycle continuity, and retention cleanup, but they must not count toward visible page totals.

### 7.6 Page tab behavior

`关键任务` shows:

- active long-task root tasks
- root tasks in user-intervention states

`系统任务` shows:

- explicit system singleton tasks such as token refresh

The current `会话任务 / 定时任务 / 执行任务` split is removed. Counts shown in tabs and pagination become visible-item counts only. Internal records no longer inflate the page surface.

Toolbar filters remain task-oriented and minimal. They should filter only the currently visible tab content and should preserve the resource-page left-to-right toolbar order already required by workspace rules.

### 7.7 Singleton-by-key compaction

System scheduled tasks must become true singletons in storage, not just deduplicated live definitions.

When managed definitions are synchronized:

1. compute the canonical singleton identity for each system definition
2. load stored tasks matching that identity
3. keep at most one canonical record
4. remove or merge redundant historical duplicates
5. update the canonical record in place when only definition data changed

If the canonical singleton is currently `running`, the sync pass must not interrupt it. In that case:

- mark redundant duplicates for deferred removal
- let the running instance finish
- compact after the run completes

This gives the system a stable product rule: one system task key equals one current task record.

### 7.8 Session archive lifecycle

When a session is archived through [apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts), ordinary session-linked tasks are not kept visible.

Archive behavior:

- ordinary non-critical session tasks are hidden immediately
- hidden tasks record:
  - `hiddenAt`
  - `purgeAfterAt = archivedAt + 7 days`
- hidden tasks no longer appear in the task center

Root tasks are handled separately:

- if the root task is still `critical`, keep it visible
- if it no longer has user value, hide it and queue it for delayed purge

This prevents archived sessions from continuing to flood the page while still protecting relevant long-task root tasks.

### 7.9 Workspace removal lifecycle

When a workspace is removed through [apps/desktop/MaomiAgent/src/bun/modules/workspace/implementation/services/desktop-workspace-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/workspace/implementation/services/desktop-workspace-service.ts), task data linked to that workspace is hard-deleted.

Delete behavior:

- delete all non-system tasks under that workspace
- delete corresponding run records
- delete workspace task-name cache rows when no remaining workspace tasks depend on them

System singleton tasks are not deleted through workspace removal because they are stored under the reserved `workspaceId = "system"` and `scope = "system"` contract rather than an ordinary user workspace.

### 7.10 Scheduled purge and retention

The existing scheduler tick in [apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/services/desktop-tasks-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/services/desktop-tasks-service.ts) will also own background retention work.

Each maintenance tick should:

- run due scheduled tasks
- purge hidden tasks whose `purgeAfterAt <= now`
- delete their run records
- compact deferred singleton duplicates
- trim system-task run history to a small bounded window

The purge policy for archived session tasks is fixed by user decision:

- retain hidden ordinary tasks for 7 days
- purge automatically afterward

### 7.11 Data-model additions

The task store needs explicit lifecycle and surface fields instead of relying only on inferred UI projection.

Expected persisted additions include fields equivalent to:

- `surface`
- `visibility`
- `scope`
- `identityKey`
- `hiddenAt`
- `purgeAfterAt`
- `deferredCompaction`

Exact column names can be finalized during implementation, but the storage model must support:

- filtering by visible surface
- deleting by session and workspace ownership
- compacting by singleton identity
- scheduling delayed purge

These fields belong in [apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/stores/desktop-tasks-store.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/stores/desktop-tasks-store.ts) and the corresponding task normalization/projection layer.

### 7.12 Migration strategy

This pass should not introduce a separate manual migration command. Instead, migration should happen automatically during task-module startup.

Startup migration behavior:

- assign legacy tasks into `critical`, `system`, or `internal`
- fold legacy system-task duplicates by singleton identity
- move surviving legacy system tasks under `workspaceId = "system"` and `scope = "system"`
- hide low-value legacy session tasks
- assign delayed purge timestamps where appropriate
- preserve still-running critical root tasks

Migration must be conservative:

- if the system cannot confidently prove a task is low-value and safe to purge, keep it
- do not delete running critical root tasks during migration

### 7.13 Error handling and safety

This pass must prefer temporary over-retention over accidental deletion of valuable tasks.

Rules:

- if task classification is ambiguous, keep the item out of purge and log it
- if singleton compaction encounters a running canonical task, defer deletion of duplicates
- if session archive cleanup fails, keep tasks hidden only after persistence succeeds
- if workspace removal cleanup partially fails, log the error and leave remaining task records consistent rather than half-mutated
- purge jobs must be idempotent so retries do not corrupt state

## 8. Affected Areas

The concrete implementation is expected to touch at least these areas:

- task page and UI components:
  - [apps/desktop/MaomiAgent/src/mainview/modules/tasks/page.tsx](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks/page.tsx)
  - [apps/desktop/MaomiAgent/src/mainview/modules/tasks/page.css](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks/page.css)
  - [apps/desktop/MaomiAgent/src/mainview/modules/tasks/components](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks/components)
- task-center projection and helpers:
  - [apps/desktop/MaomiAgent/src/shared/desktop-task-center.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/desktop-task-center.ts)
  - [apps/desktop/MaomiAgent/src/mainview/modules/tasks/task-center-helpers.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/tasks/task-center-helpers.ts)
- task service and store:
  - [apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/services/desktop-tasks-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/services/desktop-tasks-service.ts)
  - [apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/stores/desktop-tasks-store.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/implementation/stores/desktop-tasks-store.ts)
  - [apps/desktop/MaomiAgent/src/shared/desktop-tasks.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/desktop-tasks.ts)
- session and workspace lifecycle hooks:
  - [apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts)
  - [apps/desktop/MaomiAgent/src/bun/modules/workspace/implementation/services/desktop-workspace-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/workspace/implementation/services/desktop-workspace-service.ts)
- regression coverage:
  - [apps/desktop/MaomiAgent/src/bun/modules/tasks/tests/desktop-tasks-service.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/tests/desktop-tasks-service.test.ts)
  - [apps/desktop/MaomiAgent/src/bun/modules/tasks/tests/desktop-task-center-projector.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/tasks/tests/desktop-task-center-projector.test.ts)

## 9. Testing and Validation

This design should be considered implemented correctly only when all of the following are true:

1. The end-user task page renders only `关键任务` and `系统任务`.
2. Ordinary conversation run tasks do not appear in page totals or tables.
3. Running long-task root tasks remain visible in `关键任务`.
4. Root tasks requiring takeover, confirmation, verification, wrap-up, or failure handling remain visible in `关键任务`.
5. System tasks such as Feishu refresh token are stored and rendered as singleton-by-key records.
6. Session archive hides ordinary tasks immediately and schedules them for purge after 7 days.
7. Workspace removal hard-deletes non-system task data and run history for that workspace.
8. Deferred singleton compaction does not interrupt a currently running canonical task.
9. Legacy data migration preserves still-relevant critical root tasks.

Validation should include:

- task-service tests for singleton-by-key compaction
- task-service tests for archive-hide plus delayed purge behavior
- task-service tests for workspace-linked hard deletion
- task-center projection tests proving only `critical/system` surfaces reach the page
- startup migration tests proving legacy duplicates collapse and running critical roots survive
- focused page tests proving the two-tab resource layout and visible-item filtering behavior

## 10. Risks and Mitigations

### Risk: a root task that still matters is hidden or purged too early

Mitigation:

- classify root tasks conservatively
- preserve all active long-task roots
- preserve unresolved attention states
- defer purge when classification is ambiguous

### Risk: singleton compaction deletes a record that is still actively executing

Mitigation:

- never compact the canonical running record in-place during execution
- defer duplicate removal until the running record finishes
- make compaction idempotent

### Risk: workspace deletion leaves partial task residue

Mitigation:

- perform workspace task cleanup through one task-domain mutation path
- delete associated runs together with task rows
- log and retry rather than partially mutating unrelated records

### Risk: page cleanup still leaks internal tasks through projection edge cases

Mitigation:

- move visible-surface classification into the task domain
- keep page filters narrow and surface-based instead of keyword-based
- add projection tests for managed roots, child tasks, conversation runs, and system tasks

## 11. Acceptance Criteria

This design is considered complete when all of the following are true:

- the task center no longer presents raw internal execution noise to end users
- only critical root tasks and explicit system singleton tasks remain visible
- running long-task root tasks remain visible as requested
- system scheduled tasks are compacted to one record per singleton identity
- archived session tasks disappear from the page and purge automatically after 7 days
- workspace removal reclaims non-system task data immediately
- page structure follows the workspace rule of `Tabs + toolbar + main table` without dashboard or side-detail regression
