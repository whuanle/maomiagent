# WeChat Lightweight Executor Design

Date: 2026-05-21
Status: Draft for review
Owner: Codex

## Context

The WeChat channel is now functionally closer to the intended behavior than it was earlier in the week:

- WeChat messages already run through a dedicated `wechat.agent`
- the page-level model selector remains authoritative
- pseudo `<tool_call>` leakage is blocked
- pure text questions can succeed
- image send-back through `wechat_send_media_file` is already wired

However, the current WeChat experience is still too heavy for the channel.

The most recent successful screenshot-send run (`run_046bb078b906`) showed the actual screenshot and media-send tools were not the slow part. The total end-to-end runtime was about 131 seconds, but direct tool execution only consumed about 6.5 seconds:

- `terminal_create_session`: about 0.7s
- `terminal_execute`: about 0.03s
- `terminal_read_output`: about 0.1s
- `terminal_close_session`: about 0.04s
- `wechat_send_media_file`: about 5.6s

The remaining time was spent on repeated model decisions between each tool call. In practice, one WeChat screenshot task was expanded into multiple think-act-think-act rounds. That is acceptable on desktop for complex work, but it is the wrong product posture for WeChat.

Investigation of the current runtime surface also showed that:

- `skill__easytouch` is not a direct screenshot action tool; it is an instruction-lookup tool that loads `SKILL.md`
- the actual screenshot path is currently being improvised through terminal tools plus `wechat_send_media_file`
- the WeChat user wants this channel to stay lightweight because complex work should continue on desktop
- the WeChat-native abilities that matter most are image receive and image send; video and generic file/media workflows can be ignored for now

## Problem Statement

WeChat is currently too intelligent in the wrong way. It still behaves like a general-purpose execution surface, even though the user wants it to behave like a lightweight messaging endpoint.

This causes two product problems:

1. high-frequency tasks such as “截图发我” are much slower than necessary because they are decomposed into too many model-driven turns
2. WeChat keeps inheriting general runtime capabilities that are more appropriate for desktop than for a chat channel

We need to keep WeChat useful, but narrow its job:

- short text replies
- image receive and analysis
- image send-back
- one high-frequency shortcut for “capture desktop and send to WeChat”

Anything beyond that should be explicitly redirected to desktop rather than executed through long chains.

## Goals

- Keep WeChat as a lightweight channel rather than a full desktop execution surface.
- Preserve the WeChat page model selector as the source of truth for model choice.
- Keep `wechat.agent` as the single WeChat entry agent.
- Preserve image receive into the conversation as attachments.
- Preserve image send-back through WeChat-native runtime capability.
- Add one explicit WeChat-native shortcut for “capture desktop and send to WeChat”.
- Make the screenshot-send path much shorter than the current multi-round terminal orchestration path.
- Redirect complex or long-running tasks to desktop instead of attempting them in WeChat.
- Keep internal execution hidden from end-user WeChat replies.

## Non-Goals

- No broad WeChat-side support for generic multi-step automation.
- No generic `skills.runtime` exposure for WeChat conversations.
- No generic `mcp.runtime` exposure for WeChat conversations.
- No attempt to make WeChat a code-editing, debugging, or repository-work surface.
- No new support for video send, video receive, or rich media beyond image handling.
- No change to the WeChat page model configuration UX.
- No change to desktop chat or other channels.

## Product Rules

- All WeChat messages continue to run through `wechat.agent`.
- The selected model still comes from the WeChat page (`selectedChannelId` and `selectedModelId`).
- WeChat supports only lightweight channel work:
  - short text replies
  - inbound image analysis
  - outbound image send
  - desktop screenshot and send-back
- WeChat does not expose broad desktop execution power by default.
- If the user requests complex work, the channel must clearly redirect them to desktop.
- Final WeChat replies must remain short and user-facing only.

## Approaches Considered

### Approach A: Prompt-only tightening

Keep the current capability surface and only change the WeChat agent prompt so it “acts faster” and “plans less”.

Pros:

- smallest code delta
- preserves maximum flexibility

Cons:

- does not address the root cause of the latency
- still allows screenshot and media tasks to expand into too many tool rounds
- keeps WeChat exposed to a desktop-sized capability surface

### Approach B: WeChat lightweight executor, recommended

Keep `wechat.agent` and the UI model selector, but shrink the runtime surface to a small WeChat-native capability set and introduce a dedicated screenshot-send shortcut.

Pros:

- directly reduces latency on the most common WeChat action path
- matches the user’s product boundary for WeChat vs desktop
- keeps model choice flexible without making WeChat a general automation shell

Cons:

- removes generic skills and MCP usage from WeChat turns
- requires a dedicated WeChat-native action tool for screenshot-send

### Approach C: Image-only messenger

Reduce WeChat all the way down to short text plus inbound/outbound image handling, and remove screenshot-send as well.

Pros:

- simplest and most stable channel surface
- smallest long-term maintenance burden

Cons:

- removes a valuable high-frequency workflow the user explicitly wants to keep

## Recommendation

Choose Approach B.

The user has already stated that complex work belongs on desktop. The product issue is not that WeChat lacks power; it is that WeChat currently has the wrong kind of power. A lightweight executor model preserves the useful messaging and image flows while cutting off the long, desktop-style orchestration path that is making the channel feel slow and awkward.

## Proposed Design

### 1. Keep a fixed WeChat agent, but narrow its job

WeChat should continue using `wechat.agent` as the single channel-specific agent identity. The model still comes from the WeChat configuration page, so the channel keeps the existing model-selection contract.

What changes is the mission of the agent:

- answer short text questions
- analyze inbound images
- send images back to the user
- call one explicit screenshot-send shortcut when the user asks for a desktop screenshot
- redirect all heavier work to desktop

This means WeChat remains agent-driven, but the agent is no longer treated as a general orchestration surface.

### 2. Replace broad capability exposure with a WeChat-native runtime surface

The current WeChat conversation settings expose a broader runtime surface than the channel needs. This design narrows the WeChat runtime contribution to a channel-native subset:

- keep inbound image materialization into conversation attachments
- keep `wechat_send_media_file`
- add a dedicated WeChat-native screenshot-send tool
- remove broad `skills.runtime`
- remove broad `mcp.runtime`

The goal is not to make WeChat dumb. The goal is to stop offering it tools that invite desktop-style multi-step execution.

### 3. Add a dedicated screenshot-send action

Introduce one WeChat-specific action tool, for example:

- `wechat_capture_desktop_and_send`

Its job is to complete the whole high-frequency user workflow in one tool boundary:

1. capture the desktop screenshot
2. validate the generated file
3. send the image back through WeChat
4. return a compact result object for the final user-facing reply

This explicitly replaces the current improvised path where the model chains:

- `terminal_create_session`
- `terminal_execute`
- `terminal_read_output`
- `terminal_close_session`
- `wechat_send_media_file`

The screenshot action should be implemented server-side as a bounded operation. The agent should only decide whether to call it, not how to orchestrate its internal steps.

### 4. Preserve inbound image analysis

Inbound WeChat images already land on disk and enter the conversation as attachments. That behavior should remain unchanged.

The difference is only in scope:

- image analysis remains supported
- image-triggered complex follow-up automation does not

This keeps the most useful WeChat-native receive path without reopening the broader execution surface.

### 5. Redirect complex tasks to desktop

The WeChat channel should stop attempting tasks such as:

- code edits
- repo investigation
- long troubleshooting flows
- multi-step automation chains
- tasks that require repeated observations or long-running supervision

For those cases, `wechat.agent` should answer with a short redirect such as:

- `这类任务请到桌面继续。`

This is a product decision, not a temporary fallback.

### 6. Keep reply formatting compact

WeChat replies should remain short and user-facing:

- text question: short answer
- image analysis: short answer based on the image
- screenshot-send: send the image, then optionally one short natural-language confirmation
- complex task: short redirect to desktop

WeChat should not produce long summaries, step-by-step execution commentary, or tool narratives. The channel should feel like a messaging surface, not an execution transcript.

## File Impact

The implementation should stay concentrated in these areas:

- WeChat service and channel settings:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts)
- WeChat capability provider surface:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.ts)
- Built-in WeChat agent prompt:
  - [apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts)
- WeChat binding and runtime tests:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts)
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.test.ts)

This pass should not require WeChat page UI layout changes.

## Testing Strategy

The implementation should be validated with focused regression coverage:

- WeChat sessions continue using `selectedAgentId = "wechat.agent"`
- WeChat runtime capability exposure no longer includes broad `skills.runtime`
- WeChat runtime capability exposure no longer includes broad `mcp.runtime`
- inbound WeChat images still become conversation attachments
- `wechat_send_media_file` remains available and working
- the new screenshot-send tool completes a bounded screenshot-to-WeChat flow
- simple text questions still work
- complex tasks are redirected to desktop instead of entering long execution chains
- final WeChat replies do not expose internal execution details

## Risks and Mitigations

### Risk: removing broad runtime capabilities makes some previous WeChat tasks impossible

Mitigation:

- accept this intentionally as a product boundary
- keep the redirect-to-desktop path explicit and short
- preserve the few high-frequency tasks that matter most

### Risk: screenshot-send still feels slow if implemented as a wrapper around the same long chain

Mitigation:

- treat screenshot-send as a single bounded server-side action
- do not expose its internal sub-steps as separate WeChat-visible decision points

### Risk: model choice still affects quality of short text replies

Mitigation:

- keep the UI model selector authoritative
- rely on the channel boundary change to improve speed and determinism for action workflows
- allow the user to choose a different WeChat model if short-text quality is not acceptable

## Acceptance Criteria

This design is considered implemented correctly when all of the following are true:

- WeChat still supports short text Q&A.
- A user can send an image to WeChat and receive an image-aware reply.
- A user can request a desktop screenshot and receive the image through WeChat without the old multi-step terminal orchestration path being exposed to the model.
- Generic WeChat tasks no longer have access to broad skills and MCP runtime capability.
- Complex requests are redirected to desktop rather than expanded into long WeChat execution chains.
- End-user replies remain concise and do not leak internal execution process.

## Open Question Resolved

The user confirmed that WeChat should remain capable of proactively sending an image whenever the task result requires it; the user does not need to explicitly repeat “发图片给我” every time. That behavior remains part of the lightweight executor design.
