# Chat Streaming Prioritization Design

Date: 2026-06-03

## Goal

Improve long-running chat turns so visible streaming stays responsive while the session is active. The main target is to reduce backend-side session detail churn that competes with runtime event delivery, without changing the core conversation behavior.

## Confirmed Findings

- For `session-3b24bdbec3874551ab66f842`, the first visible AI event was not buffered for a long time in the desktop backend.
- Provider `first_ai_event` and conversation `first_message_part_publish` were separated by only a few milliseconds.
- The dominant wall-clock cost came from provider streaming across many turns, not from tool execution.
- Active-session detail refreshes were extremely frequent and accumulated meaningful overhead.
- Existing diagnostics are useful for confirmation, but this optimization should not permanently depend on high-noise instrumentation.

## Non-Goals

- No redesign of the conversation runtime contract.
- No background-task architecture change in this iteration.
- No UI redesign in this iteration.
- No removal of existing loop-detection behavior, only optional earlier surfacing if already supported by the current guard path.

## Recommended Approach

Use runtime events as the high-priority real-time path and demote active-session detail publishing to a throttled side path.

This keeps the current architecture intact:

- runtime events remain immediate
- final session detail remains authoritative
- progress detail becomes intentionally less frequent during active turns

## Behavioral Changes

### 1. Throttle active detail publication

While a session has an active run:

- session detail loads and publishes should no longer happen on every tight poll tick
- detail publication should be rate-limited by a scheduler/throttler
- the throttle should be adaptive:
  - shortly after turn start, refresh faster
  - once the turn is clearly long-running, refresh slower

Initial policy:

- first 3 seconds of a turn: allow progress detail roughly every 150-250ms
- after 3 seconds: degrade to roughly every 500ms
- after 15 seconds: degrade to roughly every 1000ms

Exact constants may be tuned during implementation, but the policy direction is fixed: detail refresh frequency must fall as turn duration grows.

### 2. Preserve immediate runtime event delivery

These should bypass the detail throttle:

- `message.parts.appended`
- message append/create runtime events
- tool call/runtime events
- interaction state changes
- run completion/failure/stop boundary events

The optimization must not insert a new queue in front of runtime event publication.

### 3. Allow immediate detail publish on structural change

Even during throttling, the backend may publish an unscheduled detail snapshot when there is a meaningful structural change, such as:

- a new assistant message part becomes visible
- a tool call starts or completes
- an interaction appears or changes state
- the run enters a terminal state

This keeps high-signal state transitions responsive without restoring the current flood behavior.

### 4. Reduce redundant detail work

The service should avoid repeated `loadSessionDetail -> compare -> publish` cycles when no publish is currently eligible.

Implementation should prefer:

- checking throttle eligibility before expensive detail assembly where possible
- coalescing multiple pending progress requests into one publish
- preserving a guaranteed final publish after the run settles

## Diagnostics Strategy

This iteration will keep the current streaming diagnostics in place while the optimization is verified.

To make later cleanup safe, diagnostics must remain isolated:

- keep all chat streaming diagnostics behind their existing dedicated message/module names
- do not mix diagnostic-only data with user-visible state
- do not make correctness depend on diagnostic logging

Cleanup path after validation:

- once we confirm the new behavior in real sessions, we can either:
  - delete the temporary diagnostics entirely, or
  - gate them behind a low-noise debug flag

The implementation should preserve this clean removal path and avoid spreading diagnostic hooks into unrelated modules.

## Error Handling

- final session detail publication must still happen on success, failure, timeout, retry exhaustion, loop detection, and explicit stop
- throttling must not prevent interaction-required sessions from surfacing their pending interaction state
- if the throttler fails internally, the service should fall back to a safe publish path rather than dropping final state

## Testing

Add focused regression coverage for:

- runtime text part publication remains immediate
- active progress detail publication count is reduced under long-running activity
- final detail publish still occurs after run completion/failure
- interaction and stop paths are not delayed incorrectly

## Rollout Notes

- This is intentionally an internal performance and responsiveness optimization.
- User-facing behavior should only improve responsiveness; no new UX copy is required.
- After release, we should validate with a real long-running session and compare before/after counts for:
  - `conversation.detail_loaded`
  - `conversation.detail_published`
  - time from provider `first_ai_event` to renderer-visible incremental content
