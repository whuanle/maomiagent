# WeChat Dedicated Agent Design

Date: 2026-05-20
Status: Draft for review
Owner: Codex

## Context

The desktop WeChat channel currently shares the general conversation pipeline and model-selection flow. That keeps the integration surface small, but it also means the channel inherits the behavior of whichever model is selected in the WeChat configuration page.

This became a concrete product problem for action-oriented WeChat requests such as:

- `使用 easytouch 把桌面截图发我`

Investigation against the live desktop state showed the current failure is not that WeChat media sending is missing. It is a channel-execution mismatch:

- the WeChat module still enables `skills.runtime` and `wechat.runtime` in [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts)
- the selected WeChat model in the live state is currently `xiaomi / mimo-v2.5-pro` in [C:/Users/ASUS/.maomiagent/desktop/data/wechat-state.json](</C:/Users/ASUS/.maomiagent/desktop/data/wechat-state.json:4>)
- for models marked `supportsFunctionCall=false`, the runtime strips structured tool definitions and forces `toolChoice: "none"` in [apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts:239)
- the runtime still injects a plain-text tool catalog block into the prompt in [apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts:2644)
- the live failed WeChat turn persisted only assistant `text` containing literal `<tool_call>` markup, while the corresponding `kernel_tool_calls` count was zero

In other words, the model could still see tool names such as `skill__easytouch`, but it no longer had a real structured tool-call path. The model therefore produced pseudo tool-call text instead of a real tool invocation, and the WeChat relay forwarded that text back to the user.

The user wants a simpler direction than code-heavy per-message routing:

1. keep the WeChat page model selector as the source of truth
2. do not add a large amount of hard-coded tool-intent branching
3. handle WeChat messages through a dedicated agent
4. let the agent decide when to use tools, skills, and memory
5. keep internal execution hidden from end-user WeChat replies

## Problem Statement

We need WeChat messages to run through a dedicated channel-aware agent rather than the generic desktop-primary path, while preserving the existing WeChat page model configuration.

The dedicated agent must:

- bias toward actual tool execution for action-oriented WeChat requests
- preserve existing memory and channel capabilities
- prevent pseudo `<tool_call>` / internal-trace content from being returned to end users

This is not a UI redesign and not a broad model-routing engine. It is a WeChat message-entry correction.

## Goals

- Route all WeChat conversation turns through a dedicated WeChat agent.
- Keep the WeChat page model configuration unchanged and authoritative.
- Preserve `mcp.runtime`, `skills.runtime`, `wechat.runtime`, memory, and existing attachment handling.
- Make the agent prefer real execution over descriptive non-actions for WeChat requests.
- Prevent internal reasoning, tool traces, XML-like pseudo tool tags, and execution logs from being sent back to WeChat users.
- Keep existing conversation bindings, history, memory use, and compaction behavior intact.

## Non-Goals

- No per-keyword code router for screenshots, images, or specific skills.
- No automatic model switching to a fixed fallback model such as `kimi-k2.6`.
- No rewrite of the WeChat configuration page model selector.
- No replacement of the existing conversation runtime, tool runtime, or memory system.
- No attempt to interpret free-form `<tool_call>...</tool_call>` text as executable tool instructions.
- No forced recreation of existing WeChat sessions or bindings.

## Product Rules

- All WeChat messages use a dedicated agent identity, for example `wechat.agent`.
- The actual model still comes from the WeChat page configuration (`selectedChannelId` and `selectedModelId`).
- The WeChat agent may use skills, tools, attachments, and memory.
- The WeChat agent should actively execute when the user asks for actions such as screenshot capture or sending files.
- The WeChat channel must never return raw reasoning, tool traces, execution summaries, pseudo tool tags, or similar internal process content.
- If the selected model cannot produce a real tool call, the channel must fail cleanly instead of pretending execution happened.

## Approaches Considered

### Approach A: Code-driven tool intent router

Detect screenshot / image / system-action messages in code and override the model or execution path on those turns.

Pros:

- deterministic for a narrow set of scenarios
- can work even if the selected model is weak at following agent instructions

Cons:

- expands channel logic into brittle business rules
- requires ongoing maintenance for every new tool-like request form
- conflicts with the user's preference to avoid a pile of code restrictions

### Approach B: Dedicated WeChat agent on the existing model selector

Assign all WeChat messages to a dedicated agent with a channel-specific prompt, while still honoring the current WeChat model selection from the UI.

Pros:

- keeps the decision surface inside agent behavior rather than code branching
- preserves the current UI contract for model selection
- localizes the change mostly to WeChat session entry and agent definition

Cons:

- still depends on the selected model actually supporting real tool calling
- requires careful prompt wording and focused regression coverage

### Approach C: Output-only filtering

Do not change agent identity. Only filter out pseudo tool text and internal traces from WeChat replies.

Pros:

- smallest surface area
- improves visible leakage quickly

Cons:

- does not improve execution behavior
- leaves WeChat action requests on the same generic agent path that already failed

## Recommendation

Choose Approach B.

The failure here is not only an output sanitization problem. WeChat currently lacks a channel-specific execution posture. A dedicated WeChat agent gives the channel a clear behavioral contract without introducing a large code router, and it still preserves the existing model-selection UX that the user wants to keep.

## Proposed Design

### 1. WeChat session entry uses a fixed agent identity

All WeChat-created or WeChat-resumed conversation sessions should carry a fixed `selectedAgentId`, for example:

- `wechat.agent`

This agent selection should be applied when the WeChat service creates a new bound conversation session and should also be lazily repaired for older bindings when a new message arrives. Existing `sessionId` values remain valid; only the session metadata needs to converge to the dedicated agent identity.

This design reuses the existing agent-selection path already supported by the conversation service in [apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts) and by the runtime agent prompt injection flow in [apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts:1220).

We should not build a parallel WeChat-only execution stack. The WeChat channel should continue to call `conversationCommand.sendMessage(...)`, but it should do so with a stable agent identity.

### 2. Add a built-in WeChat primary agent

Introduce a new built-in primary agent in [apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts).

This agent should:

- be visible to the runtime as a normal agent descriptor
- have a dedicated prompt focused on channel execution behavior
- not require a dedicated model strategy override
- continue to use the model selected by the WeChat page

The prompt should establish these behavioral rules:

- treat WeChat as an end-user channel, not an engineering console
- when the user asks for a concrete action, prefer doing it rather than explaining how it could be done
- when a relevant skill or tool is available, use it instead of narrating hypothetical tool syntax
- when sending an image or file to WeChat is part of the task, use the WeChat media capability rather than describing the intended send
- never emit internal execution markup such as `<tool_call>`, `<function=...>`, raw tool traces, or reasoning as the final user-facing reply
- after successful execution, answer with a short natural-language outcome only

The purpose of this agent is not to bypass model capability limits. Its purpose is to make the expected behavior explicit and channel-specific whenever the chosen model can support it.

### 3. Keep model selection on the WeChat page

The WeChat page remains the only user-facing place that chooses:

- `selectedChannelId`
- `selectedModelId`

The dedicated agent does not hard-code `kimicode / kimi-k2.6`, and it does not silently rewrite the saved WeChat configuration. If the user changes the page configuration, subsequent WeChat turns continue to use the newly selected channel and model.

This preserves the current product contract:

- agent identity is fixed by the channel
- model identity is still controlled by the UI

### 4. Preserve current capability exposure

The existing WeChat conversation settings should continue enabling:

- `mcp.runtime`
- `skills.runtime`
- `wechat.runtime`

The dedicated agent relies on those capabilities remaining exposed. This design does not disable memory or tool access. It moves the behavior contract into the agent prompt rather than into additional request classification code.

### 5. Failure handling for pseudo tool-call text

The current channel already sanitizes WeChat replies in [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts). That sanitization should remain, but one explicit failure rule must be added for the dedicated-agent design:

- if the latest assistant output contains pseudo tool-call markup such as `<tool_call>` / `<function=...>` and there were no real tool calls recorded for that run, WeChat must not echo that text back to the user

Instead, the relay should return a stable user-facing failure message, for example:

- `当前模型未完成该操作，请切换到支持工具调用的模型后重试。`

This is a narrow defensive rule, not a free-form text-to-tool interpreter. We should never execute a tool because the assistant printed XML-like text.

### 6. History and session compatibility

Existing WeChat bindings remain intact:

- same `sessionId`
- same memory history
- same processed message retention
- same compaction behavior

The only compatibility change is session-metadata convergence toward `wechat.agent`. For older sessions that predate this design, the WeChat service should patch the bound session metadata on the next inbound message rather than requiring a manual reset.

## File Impact

The implementation should stay concentrated in these areas:

- WeChat relay and binding entry:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts)
- Built-in agent definitions:
  - [apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts)
- Conversation-session tests and WeChat binding tests:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts)
  - [apps/desktop/MaomiAgent/src/bun/modules/conversation/tests/desktop-conversation-service.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/conversation/tests/desktop-conversation-service.test.ts)

This pass should not require WeChat page UI structure changes.

## Testing Strategy

The implementation should be validated with focused regression coverage:

- WeChat binding tests proving new sessions are created with `selectedAgentId = "wechat.agent"`
- WeChat binding tests proving old bound sessions are lazily repaired to `wechat.agent`
- conversation/runtime tests proving the dedicated agent prompt is injected when `selectedAgentId` is `wechat.agent`
- WeChat relay tests proving successful action-oriented turns return only natural-language results
- WeChat relay tests proving pseudo `<tool_call>` text with zero real tool calls is turned into a stable failure message rather than echoed
- existing capability-provider tests kept green so `skills.runtime` and `wechat.runtime` remain exposed

## Risks and Mitigations

### Risk: selected model still does not support real tool calling

Mitigation:

- make the failure mode explicit and user-facing
- never pretend execution happened
- keep the UI model selector authoritative so the user can switch to a compatible model

### Risk: the dedicated prompt is too weak and the model still narrates instead of acting

Mitigation:

- keep the WeChat agent prompt direct and action-oriented
- validate with concrete tool-use cases such as screenshot capture and WeChat media send

### Risk: session migration breaks existing history

Mitigation:

- do not recreate sessions
- patch only the selected agent metadata
- preserve the existing `sessionId` and historical records

## Acceptance Criteria

This design is considered implemented correctly when all of the following are true:

- every WeChat conversation turn runs with the dedicated WeChat agent identity
- the WeChat page still controls the selected channel and model
- the dedicated agent can use existing MCP, WeChat, skill, and memory capabilities
- action-oriented WeChat requests no longer default to pseudo `<tool_call>` responses when the model is capable of real tool execution
- if the selected model is not capable of real tool execution, WeChat returns a clean failure instead of fake tool markup
- end-user WeChat replies no longer expose reasoning, tool traces, execution summaries, or XML-like pseudo tool-call content
