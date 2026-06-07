# Chat Conversation Surface And UI Designer Structured Flow Design

## Background

The current `UI 设计大师` experience reuses chat capability only at a shallow level. It can continue a conversation inside the module, but the module still behaves as if the AI should lead with free-form output instead of first collecting the minimum structured inputs needed to understand the user's goal.

This creates two product problems:

- The first turn often jumps straight into `技术栈确认`, even when the user has not yet clarified whether they are building a desktop app, a web app, an admin system, a storefront, or only a prototype.
- The structured interaction abilities that already exist in the AI conversation stack, such as question cards, form cards, and approval cards, are treated as chat-internal features instead of a reusable front-end capability that other modules can depend on.

The user expectation for this redesign is explicit:

1. The AI should ask more at the right time, especially before deciding the technical path.
2. Key checkpoints such as scope, stack, theme direction, and page/module coverage should use structured interaction, not only free-form chat.
3. `UI 设计大师` should not maintain a second parallel chat implementation. Instead, the AI conversation page should expose reusable conversation UI building blocks so other business modules can embed the same capabilities and benefit from future upgrades automatically.

## Goals

- Turn the AI conversation UI into a reusable front-end foundation instead of a chat-page-only implementation.
- Keep `question`, `form`, and `permission` interactions defined by the AI conversation system as the single source of truth for structured interaction UI.
- Redesign `UI 设计大师` so the first stage is `项目范围确认`, not `技术栈确认`.
- Use structured interaction at key checkpoints while still allowing the user to type natural-language follow-up input.
- Keep the `UI 设计大师` flow sequential by default: later stages do not start before earlier stages are confirmed.
- Ensure future modules can adopt the same conversation surface and interaction renderer without copying chat page code.

## Non-Goals

- This design does not replace the existing desktop conversation runtime or interaction protocol.
- This design does not convert every AI-driven module into a fully form-only workflow.
- This design does not remove free-form chat input from `UI 设计大师`.
- This design does not attempt a broad visual redesign of the entire chat page beyond the extraction required for reuse.

## Recommended Approach

Adopt a shared `conversation surface` architecture.

The AI conversation page remains the canonical home of message rendering, composer behavior, and structured interaction cards, but those capabilities move behind reusable front-end components. `UI 设计大师` then becomes a business-specific shell that supplies stage rules, context, and summary panels while embedding the shared conversation surface instead of owning a separate chat-like implementation.

For `UI 设计大师`, adopt a `structured checkpoints + flexible follow-up` flow:

- key stages first ask with cards or forms
- each card still allows optional user-entered clarification
- the AI responds with short confirmation and summary instead of long speculative output
- the next stage unlocks only after the current stage is confirmed

## Architecture

### 1. Shared conversation front-end foundation

The current chat stack already contains most of the needed primitives:

- `ChatConversationPane`
- `DirectConversationSessionPane`
- interaction dock rendering
- question/form/permission cards
- composer presentation switches

The problem is packaging and ownership, not raw capability.

The front-end should be reorganized into three reusable layers.

#### `ConversationSurface`

This is the top-level reusable conversation container.

Responsibilities:

- render session header when needed
- render message list
- render pending interaction dock
- render composer area
- expose layout hooks so business modules can place the surface inside their own page shell

It should be derived from the current `DirectConversationSessionPane` path instead of cloning that logic into each module.

#### `ConversationComposer`

This is the reusable input/composer capability.

Responsibilities:

- draft message input
- file attachment support
- send / stop actions
- model selection
- agent selection when the module allows it
- presentation flags for hiding or locking controls

The composer must be configurable per surface so modules like `UI 设计大师` can keep a fixed agent while still reusing the same underlying input behavior.

#### `InteractionRenderer`

This is the reusable renderer for structured interaction requests.

Responsibilities:

- render `question` interactions
- render `form` interactions
- render `permission` interactions
- handle answer / approve / reject actions using the existing conversation interaction reply pipeline

This becomes the canonical front-end implementation of structured AI interaction across modules.

### 2. Business shell responsibility boundary

Business modules should not own generic conversation mechanics. They should own only business context and business progression rules.

For `UI 设计大师`, that means the module owns:

- workspace binding
- design-package context injection
- stage order and completion rules
- current-stage summary
- preview panel content
- stage-specific kickoff and redesign prompts

It should not own:

- a second implementation of message rendering
- a second implementation of structured interaction cards
- a second implementation of the composer
- module-specific copies of approval/question/form UI

### 3. Structured interaction as a platform capability

The platform rule should become:

`表单、审批、确认、问题卡` belong to the shared AI conversation capability first; business modules configure when to trigger them.

This preserves one interaction language across the product and ensures future UI or behavior improvements apply everywhere.

## UI Designer Flow Redesign

### Overall sequence

`UI 设计大师` should use the following fixed stage order:

1. `项目范围确认`
2. `技术栈确认`
3. `视觉与交互基线`
4. `页面与模块确认`
5. `设计规格整理`

The flow is sequential by default. The user does not jump ahead to later stages until the current stage is confirmed.

### Stage 1: 项目范围确认

This stage is new and must appear before `技术栈确认` in the flow panel.

The first interaction sequence uses two structured question cards:

1. `项目类型`
   - options such as desktop app, web app, mini-program, mobile app, prototype-first
   - allow an optional clarification note
2. `业务类型`
   - options such as admin system, storefront, official site, content platform, tool product, other
   - allow an optional clarification note

After these are answered, the AI should send a short confirmation summary, for example:

- what the system believes the user is building
- any important ambiguity still open
- confirmation that it will continue using this scope

The AI must not jump directly from this answer to a long technical-stack monologue.

### Stage 2: 技术栈确认

This stage begins only after scope is confirmed.

The interaction style should be `recommended options + optional user edits`.

Recommended decisions may include:

- application framework
- UI library or component system
- prototype-first versus directly buildable output
- responsive or multi-end expectations

If the user already expressed a preference in free text, the recommended option may be preselected, but the user still sees a confirmation interaction instead of silent AI assumptions.

### Stage 3: 视觉与交互基线

This stage collects design direction rather than implementation details.

Use structured interaction for:

- style direction
- color tendency
- density preference
- optional free-text inspiration or references

The AI should convert the answers into a concise design-direction summary before advancing.

### Stage 4: 页面与模块确认

This stage should shift from open-ended prompting to `structured checklist + optional additions`.

Examples:

- page templates: login, list, detail, edit, settings
- business modules: products, orders, users, permissions, content, reports
- optional special flows provided by the user in text

This keeps page generation aligned with the actual target system instead of generic template dumping.

### Stage 5: 设计规格整理

This stage consolidates the confirmed decisions into the design package and spec artifacts.

The AI may still ask clarifying questions here, but only to resolve remaining ambiguity rather than reopen already-confirmed stages.

## Interaction Style Rules

The user selected a `half-guided` interaction style.

That means:

- structured cards are the default for key checkpoints
- free-form text remains available at all times
- the system may absorb direct user text into the current stage
- the AI should prefer short confirmations and targeted follow-up questions over large unsolicited output

This is intentionally not a fully rigid wizard.

## Page Structure

### Left pane

The left pane remains the primary conversation lane, but its role changes.

It should:

- host the shared conversation surface
- show pending structured interactions inline in the conversation flow
- show short AI confirmations after structured input

It should no longer feel like a mostly free-chat lane where the AI dominates the first several turns.

### Center pane

The flow panel should explicitly reflect the new stage model.

Required stage states:

- `待确认`
- `确认中`
- `已确认`

The current stage is highlighted. Future stages remain unavailable until prerequisites are complete.

The first stage shown in the UI must now be `项目范围确认`.

### Right pane

Before a live preview is meaningful, the right pane should still provide value.

During early stages it should show a lightweight `current confirmed summary`, such as:

- project type
- business type
- technical stack status
- next required checkpoint

This avoids an inert empty preview area while the design is still being scoped.

## Data and Control Boundaries

### Shared layer contracts

The reusable conversation surface should accept business-layer configuration rather than hardcoding chat-page assumptions.

Important configuration dimensions:

- whether agent selection is visible
- whether model selection is visible
- whether attachments are enabled
- whether a module-specific stage shell wraps the surface
- interaction action callbacks
- session detail and pending interaction data

### UI Designer business contracts

`UI 设计大师` should continue using its own business state hook for:

- workspace selection
- design-package file loading
- readiness state
- current summaries
- stage-specific redesign prompts

But that hook should feed the shared conversation surface rather than privately assembling a second chat implementation.

## Error Handling

### Structured input rejection or cancellation

If a user rejects a structured interaction, the module should keep the current stage active and request the missing information again in a lighter way rather than silently skipping the stage.

### Free-text override

If the user answers in plain text instead of using the card directly, the system should attempt to map that answer into the current stage and then either:

- auto-confirm when confidence is high, or
- issue a compact follow-up question card if ambiguity remains

### Stage integrity

Later stages must not be marked complete solely because the AI emitted text. Completion should remain tied to the presence of resolved design-package state and stage confirmation.

## Testing Strategy

### Shared conversation foundation

Add or update tests for:

- rendering the shared conversation surface with configurable composer visibility
- rendering question/form/permission interactions outside the chat page shell
- ensuring interaction replies still flow through the existing conversation detail update path

### UI Designer flow behavior

Add tests for:

- `项目范围确认` appearing before `技术栈确认`
- initial kickoff asking for scope first
- current stage remaining locked until its structured confirmation completes
- free-text user answers still being accepted within the active stage
- right-pane summary updating after scope confirmation

### Regression coverage

Ensure that:

- chat page still behaves correctly after shared extraction
- existing interaction cards keep their behavior in normal chat
- `UI 设计大师` no longer needs a module-specific duplicate of interaction UI

## Risks

### Risk: extraction increases front-end coupling

Mitigation:

- keep shared conversation primitives presentation-focused
- keep business rules and business summaries outside the shared layer

### Risk: UI Designer becomes too rigid

Mitigation:

- preserve free-text input at all times
- use structured checkpoints only at key stages, not every minor follow-up

### Risk: stage state drifts from actual design-package state

Mitigation:

- treat design-package readiness and explicit stage confirmation as the completion signal
- do not infer stage completion from assistant prose alone

## Rollout Plan

Recommended delivery order:

1. Extract reusable conversation surface, composer, and interaction renderer from the chat module.
2. Keep the chat page working on top of the extracted shared components.
3. Rewire `UI 设计大师` to use the shared conversation surface.
4. Insert the new `项目范围确认` stage and sequential stage rules.
5. Upgrade key `UI 设计大师` checkpoints to structured question/form interactions.
6. Add early-stage right-pane summary behavior.

This order minimizes duplicate code, preserves current capability during refactor, and gives other modules a clear path to adopt the shared AI conversation foundation later.
