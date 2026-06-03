# Chat Timeout, Retry, And Multi-Session Design

## Background

The current desktop chat runtime is too aggressive about declaring inactivity failures.

When a provider stream produces no AI turn event for `90000ms`, the runtime fails the turn with:

- `provider_runtime_timeout`
- user-visible text: `Desktop AI runtime produced no activity for 90000ms.`

This causes a poor experience in two common cases:

1. The model is still working, but the first meaningful event is slow because the prompt is large, reasoning is heavy, or the provider stream is sparse.
2. The network or provider has a transient problem and the run should be retried automatically instead of immediately surfacing a failure.

At the same time, the current conversation service serializes all mutations through one global queue, so one long-running session can block another session from sending work even if the two sessions are unrelated.

This design focuses first on timeout and retry behavior, while defining the boundaries needed for follow-up multi-session parallel execution work.

## Goals

- Reduce false timeout failures for long but valid desktop AI turns.
- Keep true hang detection, but bias defaults toward avoiding accidental interruption.
- Apply tiered automatic retry rules:
  - network / transport / `429` / `5xx` / request timeout / first-byte timeout / first-event timeout / stream-idle timeout: retry up to `5` times
  - `provider_runtime_timeout` caused by whole-turn inactivity: retry up to `2` times
- Preserve existing managed conversation retry flow, but make it policy-driven instead of one fixed attempt count.
- Keep user-facing waiting and failure copy minimal and task-oriented.
- Define the service boundaries required for future parallel multi-session execution.

## Non-Goals

- This design does not yet implement full multi-session parallel execution end to end.
- This design does not introduce dashboard-style task orchestration UI for chat.
- This design does not attempt to infer whether a provider is "making progress" beyond observable runtime events and retryable transport signals.
- This design does not redesign the chat page layout or conversation information architecture.

## Approved Direction

### Option A: Favor false-negative avoidance, then recover with graded retries

Increase inactivity tolerance so slow but valid turns are less likely to fail, and add differentiated retry policies by failure class.

Pros:

- Best matches the product requirement to avoid harming valid long-running work.
- Reduces the most visible failure mode without requiring the user to manually resume often.
- Keeps recovery for transient failures.

Cons:

- True hangs may take longer to surface.
- Needs clearer retry bookkeeping and telemetry.

### Option B: Keep aggressive timeout, rely on stronger retries

Keep the current inactivity threshold roughly where it is and depend on automatic retries to recover.

Pros:

- Faster failure when a provider is truly stuck.

Cons:

- Does not solve the core complaint that valid work is being interrupted too early.

### Conclusion

Adopt Option A.

The product should default toward not killing work that may still be progressing. Recovery remains automatic, but retries are a second line of defense rather than the primary workaround.

## Current Problems

### 1. Whole-turn inactivity timeout is too visible and too blunt

The desktop conversation runtime currently wraps the provider stream with a single "no activity" watchdog. If the iterator yields nothing within the allowed window, the turn fails as `provider_runtime_timeout`.

The base timeout is currently `90000ms`, with only limited extension for larger prompts. This is too small for some reasoning-heavy or sparse-stream providers.

### 2. Provider request timeout is not consistently configured

The runtime target materialization currently returns `serviceConfig` without a populated provider `timeoutMs`. As a result, transport-layer stage timeouts are not consistently aligned with the outer conversation inactivity policy.

That means the outer inactivity guard becomes the primary effective timeout, even in cases where the provider adapter is capable of distinguishing:

- first byte timeout
- first event timeout
- stream idle timeout
- request timeout

### 3. Managed retry policy is one-size-fits-all

The current managed retry policy uses one fixed attempt budget. It does not distinguish between:

- transient transport failures that should be retried more aggressively
- whole-turn inactivity failures that should retry only a small number of times

### 4. Conversation mutations are globally serialized

`DesktopConversationService` currently uses one global mutation queue for all sessions. This blocks later session work behind any earlier long-running send, answer, or reject operation.

That behavior is not changed in this spec, but the timeout and retry work must not make this coupling worse. The follow-up implementation should preserve clean seams for per-session serialization.

## Timeout Policy

### 1. Raise the whole-turn inactivity baseline

The default whole-turn inactivity timeout should be increased from `90s` to a more tolerant baseline.

Recommended baseline:

- default inactivity timeout: `180s`

Prompt-size-aware floors should remain, but move upward:

- medium prompt floor: `180s`
- large prompt floor: `240s`
- extra-large prompt floor: `300s`

This keeps the existing "bigger prompt gets more patience" behavior while moving the overall envelope into a range that is much less likely to kill legitimate long turns.

### 2. Pass provider timeout configuration explicitly

The runtime materialization and provider service config pipeline should carry an explicit `timeoutMs` so protocol drivers can enforce stage-aware transport timeouts consistently.

Recommended provider timeout default:

- provider request and stream stage timeout: align with the same inactivity bucket chosen for the turn

This means a turn that receives a `240s` whole-turn inactivity budget should also pass `240s` into the underlying provider adapter unless the selected channel explicitly overrides it.

### 3. Preserve stage-specific provider errors

Provider adapters already know how to surface more precise retryable failures such as:

- `provider_first_byte_timeout`
- `provider_first_event_timeout`
- `provider_stream_idle_timeout`

Those should remain distinct and should not be collapsed into the outer `provider_runtime_timeout` if the adapter can classify the failure more precisely first.

## Retry Policy

### 1. Replace the fixed managed retry policy with a classifier

Retry decisions should be driven by error code classification rather than one global attempt count.

Define two retry buckets:

- transport retry bucket, max attempts `5`
- inactivity retry bucket, max attempts `2`

### 2. Transport retry bucket

The following errors should use the `5` attempt bucket:

- retryable provider HTTP failures such as `429` and `5xx`
- normalized transport/network disconnect failures marked `retryable: true`
- provider request timeout
- `provider_first_byte_timeout`
- `provider_first_event_timeout`
- `provider_stream_idle_timeout`

These errors are strong candidates for automatic recovery, especially when provider or network instability is temporary.

### 3. Inactivity retry bucket

The following error should use the `2` attempt bucket:

- `provider_runtime_timeout`

This bucket is intentionally smaller. A full-turn inactivity retry can recover from a sparse or flaky provider, but repeated full inactivity usually indicates the run is not healthy enough to keep looping many times.

### 4. Retry delay policy

Use exponential backoff with bounded delay.

Recommended defaults:

- base delay: `1000ms`
- max delay: `15000ms`
- jitter enabled

The exact backoff math can reuse existing retry helpers. The important behavior is:

- no immediate tight retry loops
- transport retries can stretch longer than inactivity retries
- all retry metadata remains visible in logs and session detail

### 5. Retry metadata

Each automatic retry attempt should update session and run metadata with:

- `managedAutoRetryCount`
- `managedAutoRetryMaxAttempts`
- `lastRetryableErrorCode`
- `lastRetryableErrorMessage`
- `lastAutoRetryAt`
- `lastAutoRetryDelayMs`
- `retryPolicyBucket`

This keeps debugging clear and makes later UI improvements possible without another storage migration.

## User Experience

### Waiting state

Waiting copy must stay minimal. Do not expose runtime internals.

Allowed examples:

- `正在加载`
- `请稍候`
- `即将完成`

The existing user-visible internal error string should not be shown verbatim as the main task-facing failure message.

### Failure state

If retries are exhausted, the user-facing failure message should be normalized to task-oriented language such as:

- `本次执行暂时未完成，请重试`

Detailed provider error codes and diagnostics should still be logged and retained in session detail for debugging, but they should not be the first thing an end user sees.

### During retry

The session remains active while an automatic retry is pending. The UI should not bounce the conversation between obvious failed and active states for each retry attempt.

The existing managed task sync message can continue to report a retrying state, but the text should remain concise.

## Multi-Session Boundary

This spec does not implement multi-session parallel execution yet, but the timeout and retry changes must be built in a way that supports it.

Required boundary decisions:

- Retry bookkeeping must be scoped per session/run, not in one shared global retry state.
- Timeout selection must be computed per turn.
- No new global queue should be introduced.
- New helper functions for retry classification should accept explicit error input and return pure decisions.

Follow-up work should replace the global conversation mutation queue with per-session serialization so two sessions can execute concurrently while each individual session still preserves ordered mutations.

## Affected Surfaces

### Backend

- `desktop-ai-conversation-runtime.ts`
  - widen inactivity timeout policy
  - align prompt-size timeout buckets
  - ensure provider timeout flows into service config
- provider runtime creation path
  - pass retry policy into turn ports
- provider adapters and protocol drivers
  - preserve stage-specific timeout errors
  - honor explicit timeout configuration
- `desktop-conversation-service.ts`
  - replace fixed managed retry attempts with classified retry policy

### Frontend

- chat failure presentation
  - normalize task-facing failure copy
  - avoid surfacing internal runtime text as the main user message

### Observability

- provider telemetry logs
- retry metadata in session/run detail
- clear exhausted-retry stop reason

## Error Handling

### Retryable failures

If an error is retryable and falls into a supported bucket:

1. classify error
2. compare current attempt count with bucket max attempts
3. persist retry metadata
4. wait for backoff delay
5. continue the system turn

### Exhausted failures

If the bucket is exhausted:

- mark `managedExecutionStopReason` as `auto_retry_exhausted`
- persist final error metadata
- return final failed detail without continuing retry loops

### Non-retryable failures

Non-retryable provider, tool, validation, and user-aborted failures should continue to stop immediately.

## Validation

- Unit tests for inactivity timeout selection:
  - default prompt
  - medium prompt
  - large prompt
  - extra-large prompt
- Unit tests for retry bucket classification:
  - `provider_runtime_timeout` => `2`
  - `provider_first_byte_timeout` => `5`
  - `provider_first_event_timeout` => `5`
  - `provider_stream_idle_timeout` => `5`
  - transport retryable provider errors => `5`
  - non-retryable errors => `0`
- Conversation service tests for:
  - retries stop after `2` for inactivity
  - retries stop after `5` for transport failures
  - exhausted retries persist expected metadata
  - final user-facing detail still remains stable
- Regression test to ensure increased timeout does not break stop-message cancellation semantics.

## Open Questions Resolved

- Product preference: avoid false interruption first.
- Retry budget:
  - transport-like retryable failures: `5`
  - whole-turn inactivity timeout: `2`
- User-facing copy should stay minimal and not expose runtime internals.

## Implementation Notes

- Keep the classifier small and explicit instead of pattern-matching large message text blobs whenever an error code is already available.
- Prefer central helper functions for:
  - timeout bucket selection
  - retry bucket selection
  - max attempt lookup
- The follow-up multi-session work should reuse these helpers unchanged.
