# UI Designer Stage Dialog And Detail Panel Design

## Background

The current `UI 设计大师` shell still mixes three responsibilities that should be separate:

- a reusable AI conversation host
- a business-specific stage workflow
- a set of hardcoded bootstrap interactions for scope, stack, theme, pages, and spec

That coupling creates three product problems:

1. The first-stage interaction is rendered inside the conversation history area, which pollutes the message lane and forces the chat surface to carry business-specific workflow UI.
2. The current `技术栈确认` path is not AI-generated. It is assembled locally with fixed fields and fixed recommended values, including desktop-app assumptions such as `React + Ant Design + pnpm + Vite`.
3. The right pane behaves like a preview-status area even when the user needs stage-level design detail instead of runtime preview information.

The desired direction is now explicit:

- `UI 设计大师` should directly reuse the existing AI conversation page host for sessions, history, composer, send/stop, and related base behaviors.
- The first structured collection step should move into a modal dialog triggered by `开始设计`, not into the conversation history.
- Structured forms should be AI-defined. The front end should only render a generic schema and submit values.
- The right pane should switch from preview metadata to a stage-detail panel that shows the currently selected stage's confirmed design result.

## Goals

- Reuse the shared AI conversation host in `UI 设计大师` instead of maintaining module-specific conversation UI behavior.
- Remove local hardcoded bootstrap forms and hardcoded stack recommendation logic from the UI Designer flow.
- Open the first structured collection step only after the user clicks `开始设计`.
- Make stage dialogs fully schema-driven by AI.
- Make the center pane a stage list and action area.
- Make the right pane a read-only stage-detail surface with structured confirmed information only.
- Keep all stage summaries and details derived from persisted design-package files.

## Non-Goals

- This design does not replace the existing desktop conversation runtime.
- This design does not remove natural-language chat from `UI 设计大师`.
- This design does not attempt to redesign the shared chat page visuals outside the extraction needed for reuse.
- This design does not require every stage to always use a form; AI may return no-form results where appropriate.
- This design does not reintroduce dashboard, overview cards, or preview-status side panels into the resource-style workspace layout.

## Decisions

### 1. Conversation ownership

`UI 设计大师` should stop behaving as if it owns a special conversation implementation.

The left pane should directly reuse the shared AI conversation page host for:

- conversation/session switching
- message history
- composer input
- attachments
- send and stop actions
- normal AI conversation rendering

Business-specific UI must be moved out of that host unless it is generic enough to belong to the shared conversation foundation.

### 2. Stage collection entry

The initial structured collection flow should not open automatically when the page loads.

It should open only when:

- the current workspace has not completed the first required design stage, and
- the user explicitly clicks `开始设计`

This keeps the page calm on entry and avoids using modal interruption before the user chooses to begin.

### 3. Stage interaction container

Business-stage collection should happen in a modal dialog, not in the conversation history dock.

This modal must:

- avoid the desktop title bar
- respect the workspace rule that long content dialogs default to an `80vh` maximum height
- allow the inner form body to scroll instead of letting the whole dialog grow upward

### 4. Stage form source of truth

The stage form is AI-defined, not front-end-defined.

The front end should no longer hardcode:

- the `scope / stack / theme / pages / spec` bootstrap interaction payloads
- fixed field labels such as `前端框架`
- fixed option lists such as `React`, `Vue`, `Ant Design`, `pnpm`
- local recommendation helpers such as desktop app => `React + Ant Design`

The front end should only render a generic interaction schema returned by AI.

### 5. Right pane responsibility

The right pane should no longer display preview mode, port, URL, iframe preview, or runtime preview status as its primary responsibility.

Instead, it should display the currently selected stage's confirmed structured detail.

The panel is read-only and should not become a secondary editing workspace.

## Recommended Approach

Keep the existing three-pane shell, but redefine the responsibilities:

- Left pane: shared AI conversation host
- Center pane: stage list, summaries, status, and stage actions
- Right pane: stage-detail panel for the selected stage

This approach keeps the page architecture stable while removing the current business-specific interaction pollution from the conversation lane.

It is the best balance between product clarity and implementation risk because it avoids a full-page rewrite while still changing the core ownership model.

## UI Structure

### Left pane

The left pane should reuse the shared conversation page host directly.

It should contain:

- session history
- conversation messages
- normal AI replies
- composer input and send/stop behavior

It should not contain:

- the initial stage bootstrap form
- hardcoded business-specific stage cards
- preview-status information

Natural-language follow-up remains available at all times.

### Center pane

The center pane becomes the stage workflow area.

Each stage item should show:

- stage title
- completion state
- concise summary
- action entry such as `开始设计`, `继续补充`, or `重新设计`

Clicking the stage row should select that stage and refresh the right pane detail.

Clicking the stage action should request an AI-defined dialog schema and then open the stage modal.

### Right pane

The right pane becomes a stage-detail panel.

It should show:

- selected stage title
- status: `empty | partial | complete`
- short summary
- structured confirmed detail sections

It should not show:

- iframe preview
- preview address
- preview mode switch
- runtime port
- generic preview-status filler

## Stage Dialog Contract

The modal flow needs two separate AI-facing payload types.

### `interactionSchema`

This payload exists only to render the dialog.

It should include:

- `stageKey`
- `title`
- `description`
- `submitLabel`
- `cancelLabel`
- `allowSkip`
- `fields`

Field types should stay generic:

- `text`
- `textarea`
- `singleSelect`
- `multiSelect`
- `boolean`

Each field should support:

- `key`
- `label`
- `required`
- `placeholder`
- `options`
- `defaultValue`

The schema is temporary UI state and should not be persisted as a design artifact.

### `stageResult`

This payload exists to persist the confirmed result.

It should include:

- `stageKey`
- `summary`
- `detail`
- `artifacts`
- `nextSuggestedStage`

`artifacts` must use a restricted artifact key list, not arbitrary file paths:

- `scope`
- `stack`
- `theme`
- `patterns`
- `layouts`
- `pages`
- `spec`
- `sources`

The front end maps these artifact keys to fixed design-package file paths.

## Persistence Model

The page should keep a strict separation between transient interaction output and persisted design state.

### Source of truth

Persisted design-package files remain the only source of truth for:

- center-pane summaries
- right-pane stage details
- stage completion state

This means the UI must not trust one AI response in memory as the final display source.

After a stage submission succeeds, the front end should:

1. validate and normalize the returned `stageResult`
2. write the permitted `artifacts` into known design-package files
3. reload design files
4. rebuild stage view models from persisted content
5. refresh the center and right panes from those rebuilt models

### Artifact mapping

The normalized artifact key should be mapped by the front end to fixed files:

- `scope` -> `design/scope.json`
- `stack` -> `design/stack.json`
- `theme` -> `design/theme.json`
- `patterns` -> `design/patterns.json`
- `layouts` -> `design/layouts.json`
- `pages` -> `design/pages.json`
- `spec` -> `design/design-spec.md`
- `sources` -> `design/sources.md`

## Stage View Model

The center and right panes should not parse raw files independently.

Instead, the UI Designer shell should build a shared `stageViewModel` layer from the persisted design files.

Each stage view model should contain:

- `stageKey`
- `title`
- `status`
- `summary`
- `sections`
- `actions`

### `sections`

Each right-pane detail section should be represented as:

- `key`
- `title`
- `items`

Each item should be represented as:

- `label`
- `value`
- `kind`
- `emphasis`

Supported item kinds should be:

- `text`
- `tagList`
- `boolean`
- `paragraph`

This keeps the right pane stable even if AI output style changes.

## Stage Detail Rules

The right pane should show only confirmed stage information.

It should not show:

- raw prompt text
- raw long-form AI reasoning
- preview telemetry
- generic explanatory filler

Missing data should be treated conservatively:

- show `未确认` for missing critical values when needed
- omit optional items that are still empty
- mark the stage as `partial` when only part of the expected detail is available

### Minimum detail expectations by stage

The persisted result must be parseable into at least the following stable concepts.

#### `projectScope`

- project shape
- business type
- target platform
- current objective
- delivery-range summary

#### `stack`

- technical route
- runtime platform
- core framework
- UI approach
- engineering tools
- key constraints

`core framework` must stay generic enough to represent `WPF`, `WinUI`, `Electron + React`, `Tauri + Vue`, or plain web stacks.

#### `theme`

- style direction
- color tendency
- density
- visual keywords
- interaction principles

#### `patterns`

- form pattern
- filter-bar pattern
- table pattern
- modal pattern
- feedback/state pattern

#### `layouts`

- navigation structure
- page skeleton
- content-area layout
- detail strategy
- responsive strategy

#### `pages`

- page templates
- core modules
- primary task flows
- page relationships

#### `spec`

- spec status
- covered sections
- missing sections
- deliverable list

## Component Boundaries

The page should be reorganized into clear component groups under `ui-designer/components`.

### Shared conversation host integration

The shell should compose the shared AI conversation host directly instead of continuing with a UI Designer-specific chat derivative.

### New UI Designer-specific groups

- `components/stage-flow/`
  - stage list
  - stage row
  - stage actions
- `components/stage-dialog/`
  - modal shell
  - schema-driven form renderer
  - field controls
- `components/stage-detail/`
  - right-pane detail surface
  - section renderer

### Service layer

- `stage-schema-service`
- `stage-result-normalizer`
- `stage-view-model-resolver`

These services should keep schema handling, persistence normalization, and display parsing out of one oversized state hook.

## State Ownership

The page-level UI state should be intentionally small.

Recommended page-level state:

- `activeStageKey`
- `stageDialogState`

The main business hook should own:

- workspace binding
- design-file loading and saving
- stage schema request/submit flows
- rebuilt stage view models

It should stop owning:

- local bootstrap interaction definitions
- hardcoded stack recommendation rules
- business-specific form UI configuration baked into the hook body

## Error Handling

### Schema fetch failure

If AI schema generation fails, the page should keep the current stage selected and show a compact error state near the stage action, without injecting fallback business forms into the chat lane.

### Invalid stage result

If AI returns a malformed or incomplete `stageResult`, the front end should reject persistence, preserve existing artifacts, and show a retryable error instead of partially writing inconsistent files.

### Dialog cancellation

Canceling the dialog should not mark the stage complete or change the selected stage detail.

## Testing Strategy

Add or update tests for:

- left-pane composition using the shared conversation host without module-specific bootstrap cards
- center-pane stage selection driving right-pane detail updates
- dialog height constraints and title-bar-safe layout
- schema-driven field rendering for all supported generic field kinds
- stage result normalization and fixed artifact mapping
- stage detail view-model parsing from persisted design files
- partial stage detail rendering without runtime preview UI

Regression coverage should explicitly verify that:

- no local hardcoded `技术栈确认` form is rendered by default
- desktop-app flows are no longer forced into a web-only stack assumption
- the right pane no longer depends on preview URL or iframe state

## Risks

### Risk: the dialog schema is too flexible and harms display consistency

Mitigation:

- keep schema field kinds intentionally small
- keep right-pane rendering based on normalized persisted results, not raw schema output

### Risk: reusing the conversation host exposes business-specific needs

Mitigation:

- extend the shared host only through generic presentation/configuration hooks
- keep UI Designer workflow controls outside the shared conversation surface

### Risk: the old hook remains oversized even after the redesign

Mitigation:

- move schema handling, result normalization, and stage view-model parsing into separate services early in the refactor

## Rollout Plan

Implement in small, low-risk steps:

1. Replace the current preview right pane with the new stage-detail panel using existing persisted design files.
2. Refactor the center pane into a stage list with selection and actions, wired to the new right-pane detail.
3. Add the stage dialog shell and schema-driven form renderer with mock schema data.
4. Switch `开始设计` and `重新设计` actions from local bootstrap interactions to AI-provided dialog schema requests.
5. Persist normalized `stageResult` artifacts and rebuild stage view models from disk.
6. Remove the old local bootstrap interactions and hardcoded recommendation helpers.

This order provides visible product improvement early while reducing the chance of destabilizing the shared conversation foundation.
