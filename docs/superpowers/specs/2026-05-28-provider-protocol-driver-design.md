# Provider Protocol Driver Design

Date: 2026-05-28
Status: Draft for review
Owner: Codex

## Context

The desktop AI stack already has a routing layer, but the current boundary stops too early:

- [desktop-ai-execution-profile-materializer.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-execution-profile-materializer.ts) resolves model selection into `protocolFamily` and `apiStyle`
- [desktop-ai-runtime-service.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-runtime-service.ts) and [provider-runtime-registry.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/provider-runtime-registry.ts) choose a runtime adapter by protocol
- individual adapters then each own their own request build, fetch, retry, timeout, abort, response-mode detection, and event decoding flow
- [desktop-ai-conversation-runtime.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts) still contains provider-facing request shaping such as tool history reduction and function-call preference handling

This means the current layer is a runtime selector, not yet a full protocol integration boundary.

The recent Kimi regression makes the gap visible:

- the current Kimi channel resolves to `providerType = "kimi-for-coding"`, `protocolFamily = "anthropic"`, and `apiStyle = "messages"`
- the same session can stream successfully through Xiaomi, but Kimi can stall until a `provider_runtime_timeout`
- Xiaomi succeeds quickly partly because its runtime path disables function calling and therefore strips historical tool traces before dispatch
- Kimi keeps function calling enabled, so it still sends heavier tool history through the provider path
- when the system times out today, the runtime only knows that no `AiTurnEvent` arrived within the timeout window; it does not know whether the provider failed to respond, failed to stream, or whether the protocol layer failed to decode the first event

The repo also already models future protocol expansion beyond OpenAI and Anthropic:

- [desktop-models.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/shared/desktop-models.ts) includes `protocolFamily = "google"` and `apiStyle = "generate-content"`
- [desktop-models-service.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/models/implementation/services/desktop-models-service.ts) already infers Google providers into that protocol pair
- the runtime registry does not yet implement a Google protocol driver

The user requirement is to preserve the existing message structure and make provider/API-SDK integration a real isolation layer:

- upper layers continue to speak the existing `AiTurnRequest`, `AiTurnEvent`, and `MessagePart` contracts
- model providers interact with that unified message model only
- OpenAI chat, OpenAI responses, Anthropic messages, Claude-compatible services, Kimi-compatible services, and future Gemini-compatible services must plug in below the same protocol integration boundary

This is therefore not a prompt tweak or a Kimi-only patch. It is a driver-boundary correction.

## Goals

- Preserve the existing `AiTurnRequest`, `AiTurnEvent`, and `MessagePart` contracts.
- Keep upper layers such as desktop conversation runtime and one-shot execution protocol-agnostic.
- Introduce a unified provider protocol driver layer below `AiTurnPort`.
- Separate provider-facing normalization from chat-specific runtime logic.
- Make transport concerns shared across protocols:
  - timeout
  - retry
  - abort
  - response mode detection
  - telemetry
  - error normalization
- Keep protocol-specific code focused on:
  - prompt encoding
  - provider transport binding
  - event decoding
  - capability declaration
- Support current implemented protocol pairs:
  - `openai / responses`
  - `openai / chat-completions`
  - `anthropic / messages`
- Define an extension path for `google / generate-content` without changing the top-level message model.
- Make first-byte and first-event failures observable so Kimi-like regressions can be diagnosed directly.

## Non-Goals

- This work does not redesign the kernel message model.
- This work does not replace `AiTurnPort` as the top-level runtime contract.
- This work does not require a full SDK migration for every existing provider in one pass.
- This work does not force Gemini implementation in the same first refactor, but the design must make Gemini a normal protocol addition.
- This work does not redesign chat UI layout or conversation persistence format.
- This work does not attempt a broad rename-only cleanup of every runtime file.

## Approaches Considered

### A. Keep the current adapters and only extract a few helper utilities

Leave each adapter as an end-to-end request pipeline and only share small helpers for retry, timeout, or SSE parsing.

Pros:

- smallest initial code movement
- low short-term migration risk

Cons:

- keeps duplicated provider pipelines
- keeps provider-specific behavior scattered across adapters and conversation runtime
- does not create a true protocol isolation layer
- future Gemini support still requires another mostly independent adapter implementation

### B. Add a protocol driver layer below `AiTurnPort` and keep current top-level contracts unchanged

Preserve existing runtime service and adapter entry points, but move common execution flow into a shared protocol runner. Protocol implementations contribute codec, transport binding, decoder, and capabilities only.

Pros:

- preserves existing message contracts and upper-layer interfaces
- creates a real provider integration boundary without rewriting the entire runtime surface
- allows Kimi and Xiaomi to share provider-facing normalization logic
- makes Google Gemini a normal protocol-driver addition instead of another one-off integration path
- centralizes diagnostics for first-byte, first-frame, and first-event failures

Cons:

- larger refactor than helper extraction
- requires adapting existing adapter internals to delegate to shared execution

### C. Rebuild around vendor-specific SDK clients first, then re-wrap them into the current runtime

Create separate OpenAI, Anthropic, and Google SDK layers first and let protocol differences live inside vendor-specific clients.

Pros:

- can align closely with official SDKs
- useful where official SDK semantics are significantly richer than raw HTTP

Cons:

- vendor and protocol concerns become coupled again
- `openai / responses` and `openai / chat-completions` still need protocol-level branching above the vendor client
- larger migration surface than needed for the current problem

## Recommendation

Choose Approach B.

The correct stable boundary is:

- upper layers continue to emit and consume unified turn contracts
- a shared protocol runner owns common execution flow
- each protocol driver owns only protocol-specific encoding, transport binding, decoding, and capability declaration

This is the smallest coherent change that fixes the current boundary problem without redesigning the message model.

## Proposed Design

### 1. Stable contracts remain unchanged

The following contracts remain the only public interface for upper layers:

- [ai-turn-contracts.ts](e:/workspace/MaomiAgent/kernel/ai/contracts/ai-turn-contracts.ts)
  - `AiTurnRequest`
  - `AiTurnEvent`
  - `AiTurnPort`
- [message/index.ts](e:/workspace/MaomiAgent/kernel/src/core/message/index.ts)
  - `MessagePart`
  - `MessageRecordWithParts`

Desktop conversation runtime, one-shot execution, and kernel execution code should continue to speak only these contracts.

No provider-specific payload types, SDK callbacks, or protocol event variants may leak above the protocol driver layer.

### 2. Introduce a unified protocol driver layer

Below `AiTurnPort`, add a shared protocol execution structure composed of five roles.

#### `TurnRequestNormalizer`

This layer transforms a unified `AiTurnRequest` into a provider-facing form while preserving top-level message semantics.

Responsibilities:

- compact older heavy tool results
- remove or downgrade unsupported capability usage
- normalize reasoning and tool-call history when a provider requires stricter continuation shape
- apply provider-specific prompt shaping rules that are still expressed in unified request terms

This replaces the current split where some normalization happens only in desktop conversation runtime and some capability behavior is implicit in per-adapter request building.

#### `PromptCodec`

This layer converts normalized unified turn input into protocol payload structures.

Existing files remain the main codec implementations:

- [anthropic-messages-prompt-codec.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/anthropic/anthropic-messages-prompt-codec.ts)
- [openai-responses-prompt-codec.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/openai/openai-responses-prompt-codec.ts)
- [openai-chat-completions-prompt-codec.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/openai/openai-chat-completions-prompt-codec.ts)

Future Gemini support would add:

- `google-generate-content-prompt-codec.ts`

#### `TransportBinding`

This layer owns the actual provider call mechanism.

Responsibilities:

- HTTP or SDK request dispatch
- request timeout
- retry policy
- abort handling
- response header inspection
- stream versus JSON versus SDK-callback mode selection
- provider request metadata collection

This layer is the correct home for Kimi-specific Anthropic-compatible transport quirks and future Gemini SDK-specific invocation details.

#### `EventDecoder`

This layer converts protocol responses into unified `AiTurnEvent` sequences.

Existing parsers remain the main decoder implementations:

- [anthropic-messages-event-parser.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/anthropic/anthropic-messages-event-parser.ts)
- [openai-responses-event-parser.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/openai/openai-responses-event-parser.ts)
- [openai-chat-completions-event-parser.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/openai/openai-chat-completions-event-parser.ts)

Future Gemini support would add:

- `google-generate-content-event-parser.ts`

#### `ProtocolDriver`

This is the composition unit bound to `protocolFamily + apiStyle`.

Each driver declares:

- identity
- codec
- transport binding
- decoder
- capabilities

The runtime registry should evolve from "choose one adapter class" into "choose one protocol driver definition", while preserving the external `createTurnPort()` shape.

### 3. Configuration and capability model

To keep message semantics separate from provider invocation details, the materialized runtime configuration should be understood as three layers.

#### `ProtocolIdentity`

This answers only:

- which protocol family is selected
- which API style is selected

Examples:

- `openai / responses`
- `openai / chat-completions`
- `anthropic / messages`
- `google / generate-content`

#### `ProviderTransportConfig`

This answers only how to connect to the provider.

Fields include:

- API credentials
- base URL
- headers
- organization or project identifiers
- region or location values where applicable
- timeout values
- optional transport mode such as `http` or `sdk`

This layer must not encode message-shaping logic.

#### `RuntimeCapabilities`

This answers which unified semantics the chosen driver can actually honor.

Fields should cover at least:

- `supportsFunctionCall`
- `supportsReasoning`
- `supportsStructuredOutput`
- `supportsAttachments`
- `supportsTemperature`
- `supportsParallelToolCalls`
- `supportsInterleavedReasoning`
- `supportsSystemBlocks`
- `supportsJsonMode`

The final capability view for a request is the intersection of:

- model-declared capability
- provider configuration constraints
- protocol driver capability

This removes the need for upper layers to keep guessing protocol behavior from metadata fragments.

### 4. Provider-facing normalization moves below chat runtime

Today, request shaping behavior is split:

- conversation runtime owns function-call preference handling and some history shaping
- protocol codecs still encode their own provider-specific continuations
- adapter transport layers apply their own streaming and fallback behavior

After this change, provider-facing normalization should live in one shared layer used by all provider invocations, including:

- desktop conversation runtime
- one-shot execution
- future non-conversation runtime entry points

The key rule is:

- capability differences may influence normalization
- protocol choice may influence normalization
- chat UI state must not be the source of provider request-shaping rules

This directly fixes the current split where Xiaomi becomes fast partly because its `supportsFunctionCall = false` path strips tool history, while Kimi retains full tool history on the provider path.

### 5. Shared transport lifecycle and observability

The shared protocol runner must model provider execution as explicit stages.

Required lifecycle stages:

- `request_built`
- `request_sent`
- `response_headers`
- `first_byte`
- `first_protocol_frame`
- `first_ai_event`
- `stream_finished`

These stages enable precise diagnosis of failures that are currently collapsed into one generic timeout.

#### Timeout model

Replace the single coarse no-activity timeout with stage-aware timeout categories:

- `connect_timeout`
- `first_byte_timeout`
- `first_event_timeout`
- `stream_idle_timeout`

This distinction is necessary to explain Kimi-like regressions:

- provider never responded
- provider responded but did not start streaming
- streaming started but no decodable protocol frame arrived
- protocol frames arrived but no unified `AiTurnEvent` was emitted

#### Error normalization

All protocol drivers must still emit unified `KernelError`, but metadata must include at least:

- phase
- provider type
- protocol family
- API style
- model ID
- HTTP status when applicable
- response content type
- resolved response mode
- attempt count
- request duration
- first-byte latency
- first-event latency
- retryable flag

#### Telemetry

The shared runner should publish runtime log events for:

- `provider_request_started`
- `provider_response_headers_received`
- `provider_first_byte_received`
- `provider_first_protocol_frame_received`
- `provider_first_ai_event_emitted`
- `provider_request_finished`

This is the minimum instrumentation required to distinguish provider-side latency from protocol-decoder regressions.

### 6. UI state semantics align with unified events

The chat UI should not imply reasoning activity before the unified event stream has actually emitted reasoning.

State rules:

- after request dispatch but before first `AiTurnEvent`, show a generic waiting state only
- show "thinking" only after `reasoning.start` or `reasoning.delta`
- show assistant content immediately after `text.start` or `text.delta`

This keeps UI state truthful and prevents the current misleading case where the UI sits on a "thinking" placeholder even though the runtime has not yet received a first provider event.

### 7. Migration path with minimal interface churn

The migration should happen incrementally.

#### Phase 1. Extract shared provider-facing normalizer and telemetry

Do not change public interfaces.

Add shared modules such as:

- `implementation/shared/turn-request-normalizers.ts`
- `implementation/shared/provider-telemetry.ts`

Use them from existing conversation runtime and provider adapters first.

Primary outcome:

- Kimi and Xiaomi both pass through the same provider-facing history normalization logic
- runtime logs expose first-byte and first-event timing

#### Phase 2. Add shared protocol runner

Introduce modules such as:

- `implementation/shared/protocol-turn-runner.ts`
- `implementation/shared/http-response-mode.ts`
- `implementation/shared/transport/http-transport.ts`
- `implementation/shared/transport/sdk-transport.ts`

Existing adapter file names remain stable, but their internals delegate to the shared runner.

#### Phase 3. Move adapter internals to driver composition

Keep current outward adapter identities:

- [anthropic-messages-ai-turn-port-adapter.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/anthropic/anthropic-messages-ai-turn-port-adapter.ts)
- [openai-responses-ai-turn-port-adapter.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/openai/openai-responses-ai-turn-port-adapter.ts)
- [openai-chat-completions-ai-turn-port-adapter.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/openai/openai-chat-completions-ai-turn-port-adapter.ts)

Convert them into thin wrappers around protocol-driver definitions.

#### Phase 4. Upgrade runtime registry semantics

Evolve [provider-runtime-registry.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/provider-runtime-registry.ts) from adapter-factory registry to protocol-driver registry.

Do not change the top-level `createTurnPort()` contract in this phase.

#### Phase 5. Add Google Gemini as a normal protocol driver

Once the shared runner is stable, implement `google / generate-content` by adding:

- runtime binding entry
- Google prompt codec
- Google transport binding
- Google event decoder

Upper layers should not require special-case changes for this addition.

## Testing Strategy

Testing must prove protocol isolation and prevent future regressions like the current Kimi behavior.

### 1. Normalizer contract tests

Add tests that validate:

- old heavy tool outputs are compacted independently of function-call support
- capability downgrade behavior is deterministic
- provider-facing normalization does not mutate unified message contracts unexpectedly

### 2. Protocol driver contract tests

All protocol drivers should run the same scenario suite:

- plain text streaming
- reasoning streaming
- tool call emission
- tool-result continuation
- JSON fallback
- abort
- first-byte timeout
- first-event timeout
- mid-stream idle timeout

The assertions should be expressed entirely in `AiTurnEvent` terms.

### 3. History replay regression tests

Add replay fixtures for real-world heavy-history scenarios, especially:

- Kimi continuation with heavy tool history
- Xiaomi success path from the same session shape

The replay fixtures should assert:

- provider-facing prompt size is reduced after normalization
- first-event behavior is observable
- tool history no longer creates implicit provider-path asymmetry

### 4. Conversation and one-shot integration tests

Upper-layer tests must verify:

- conversation runtime remains protocol-agnostic
- one-shot execution uses the same protocol driver pipeline
- UI-visible streaming state is driven only by actual emitted unified events

## Acceptance Criteria

- `AiTurnRequest`, `AiTurnEvent`, and `MessagePart` remain unchanged as upper-layer contracts.
- Desktop conversation runtime and one-shot execution do not branch on protocol-specific request or stream semantics.
- Provider-facing request normalization is shared across supported protocol drivers.
- Runtime logs expose first-byte and first-event milestones for each provider request.
- Generic "no activity" failures are replaced or supplemented by stage-aware timeout categories.
- Kimi heavy-history continuation no longer depends on a separate ad hoc chat-runtime branch to remain responsive.
- Xiaomi streaming behavior does not regress during the refactor.
- Adding `google / generate-content` requires only protocol-driver-layer changes and registry updates, not upper-layer runtime redesign.

## Implementation Defaults

- The first `google / generate-content` driver should launch with raw HTTP transport so it can reuse the shared runner and timeout model immediately. An SDK transport binding may be added later without changing upper-layer contracts.
- Provider-facing normalization should default to one shared normalizer plus optional per-driver post-normalization hooks. Upper layers must not regain provider-specific request-shaping branches.
