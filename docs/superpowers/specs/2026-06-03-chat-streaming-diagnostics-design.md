# Chat Streaming Diagnostics Design

Date: 2026-06-03

## Background

Desktop chat sessions sometimes remain in a visible "thinking" state for a long time and then reveal assistant content in a single burst near the end of the run. A related but distinct failure mode also occurs when the provider request times out after several minutes. Existing code and tests already show that:

- The kernel emits `message.parts.appended` incrementally for `text.delta`, `reasoning.delta`, and tool-call references.
- The desktop conversation runtime forwards runtime events as they are published.
- The renderer can merge incremental runtime events into the active session detail.
- Existing service tests confirm that streamed text parts are published before `sendMessage()` resolves.

That makes blind behavior changes risky. This spec defines a diagnostics-only slice that identifies where streaming latency is introduced without changing visible chat behavior.

## Goals

- Diagnose whether delayed visible streaming is caused by provider latency, runtime publish latency, bridge delivery latency, renderer latency, or active-session detail publishing overhead.
- Preserve current chat behavior, retry behavior, and user-facing copy.
- Keep the change small enough to ship behind normal logging without broad refactors.

## Non-Goals

- No changes to streaming UX, placeholders, or timing labels.
- No transport rewrite.
- No throttling, batching, or prioritization changes yet.
- No changes to provider timeout behavior in this slice.

## Suspected Failure Modes

### 1. Provider produces little or no visible output for a long period

The model may spend a long time in reasoning or tool execution before emitting visible assistant text. In that case the UI correctly stays in a running state, but users perceive it as stalled.

### 2. Bun-side work delays runtime event delivery

The conversation service performs active-session detail loading and full-detail signature comparisons during a live run. If that work becomes expensive for large sessions, runtime events may be logically published on time but delivered later than expected.

### 3. Bridge or renderer latency

Runtime events may reach the desktop bridge promptly but arrive late in the renderer, or the renderer may receive them promptly but apply them slowly.

## Diagnostic Strategy

Add timestamped lifecycle diagnostics for a single conversation run, keyed by `sessionId`, `runId`, and `turnId` when available.

### Required timestamps

For each active chat run, record the first occurrence of:

1. `provider.request_sent`
2. `provider.first_protocol_frame`
3. `provider.first_ai_event`
4. `conversation.first_runtime_event_publish`
5. `conversation.first_message_part_publish`
6. `renderer.first_runtime_event_received`
7. `renderer.first_runtime_event_merged`

The resulting logs must let us compute:

- request sent -> first protocol frame
- first protocol frame -> first AI event
- first AI event -> first runtime event publish
- first runtime event publish -> first message part publish
- first message part publish -> renderer receive
- renderer receive -> renderer merge

## Scope

### Bun conversation service diagnostics

Instrument the desktop conversation service around `sendMessage()` and runtime event publishing:

- Track first runtime event publish time for each active run.
- Track first published `message.parts.appended` time for each active run.
- Track session detail progress/final publish counts and per-publish elapsed time.
- Track `loadSessionDetail()` elapsed time during active polling-driven progress updates.
- Write structured runtime logs with stable event names and correlation fields.

### Provider/runtime correlation

Reuse existing provider telemetry stages and correlate them to the same conversation run:

- `request_sent`
- `first_byte` when available
- `first_protocol_frame`
- `first_ai_event`

If some providers cannot emit every stage, missing stages are acceptable as long as the absence is observable in the final diagnostic trail.

### Renderer diagnostics

Add lightweight renderer-side diagnostics for the active selected session only:

- Record the first receipt of `desktopConversationRuntimeEventsUpdated`.
- Record the first successful merge of runtime events into local session detail.
- Record only the first event of each kind per run to avoid log spam.

Renderer diagnostics must go to the existing desktop runtime log bridge and remain internal-only.

## Logging Shape

Use structured logs rather than free-form text so later analysis can compare runs reliably.

### Required fields

- `category`: `"chat_streaming_diagnostics"`
- `phase`: stable phase name such as `provider.request_sent`
- `sessionId`
- `runId` when known
- `turnId` when known
- `workspaceId` when known
- `at`
- `elapsedMsFromRequestSent` when request start is known

### Optional fields

- `runtimeEventType`
- `detailPublishReason`
- `detailLoadElapsedMs`
- `detailPublishElapsedMs`
- `detailMessageCount`
- `detailToolCallCount`
- `detailInteractionCount`

## Overhead Constraints

- Do not log every runtime event or every text delta.
- Only the first qualifying timestamp per phase should be recorded for a run.
- Detail publish diagnostics may record every progress/final publish, but only as one structured entry per publish.
- Diagnostics must not allocate large cloned payloads or serialize full session detail objects into logs.

## Testing

Add the smallest useful test coverage:

1. A service-level diagnostic test proving that first streamed part publication still occurs before the final `sendMessage()` response while diagnostics are enabled.
2. A renderer-level test proving that first runtime-event receipt and first merge are logged once for the active run.
3. No end-to-end transport test in this slice unless existing harness support already makes it cheap.

## Acceptance Criteria

After one real desktop conversation run, logs must allow an engineer to answer:

- Did the provider send a first protocol frame quickly or slowly?
- Did the first AI event occur quickly after the first protocol frame?
- Was the first `message.parts.appended` publish delayed after the first AI event?
- Did the renderer receive runtime events shortly after they were published?
- Did active-session detail loading/publishing consume enough time to plausibly delay streaming?

## Rollout

- Ship diagnostics with no UI changes.
- Inspect real logs from at least one "slow thinking" run and one normal run.
- Only after that evidence exists should we design a behavior-changing fix such as detail publish throttling, runtime-event prioritization, or a transport adjustment.
