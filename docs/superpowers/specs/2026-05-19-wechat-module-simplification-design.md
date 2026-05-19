# WeChat Module Simplification Design

Date: 2026-05-19
Status: Draft for review
Owner: Codex

## 1. Context

The desktop WeChat module currently spans two user-visible concerns:

- configuration and login control in [apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.tsx](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.tsx)
- message relay and media handling in [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts)

The user reported three concrete problems:

1. the page's right-side `接入信息` area has low value and should be removed
2. WeChat replies leak internal process content and are not appropriate for end users
3. image send and receive behavior needs to be verified

Current code inspection confirmed three important facts:

- the right side of the page currently renders both `接入信息` and `接入账号记录`
- outbound reply extraction currently combines assistant `text` and `reasoning` parts before sending the result back to WeChat
- the module already has inbound media materialization and outbound `wechat_send_media_file` support; this is not a zero-to-one media feature build

The user then confirmed four product constraints:

1. keep the left `接入配置` area unchanged
2. remove all right-side summary and preview content so only the account list remains
3. WeChat should actively filter thought process and tool execution traces from the text returned to end users
4. WeChat must continue to expose tool and memory capability usage internally, and the agent should still be allowed to send images proactively when the task needs it

## 2. Problem Statement

We need one focused WeChat module pass that does three things without broad architecture churn:

- simplify the desktop WeChat page so the main content is only the account list
- stop leaking internal reasoning and execution traces in channel replies
- verify and preserve the existing image receive and proactive image send path

This is not a conversation-core redesign. It is a WeChat-channel correction pass.

## 3. Goals

- Keep the left configuration panel behavior and controls unchanged.
- Remove the right-side `接入信息` surface entirely.
- Render only the account list as the main right-side content.
- Keep WeChat runtime capabilities enabled, including tool access and memory usage.
- Ensure the final text sent back to WeChat contains only end-user-facing content.
- Ensure inbound images still arrive as conversation attachments.
- Ensure outbound proactive image sending remains available through the existing WeChat runtime capability.

## 4. Non-Goals

- No redesign of the general conversation session model.
- No new structured "safe final answer" contract added across all channels.
- No disabling of `mcp.runtime`, `skills.runtime`, memory, or existing WeChat runtime capability exposure.
- No rewrite of the left-side configuration workflow, QR login start flow, or runtime model selection controls.
- No new image protocol, file store, or media transport abstraction.
- No forced recreation of existing WeChat conversation bindings or session history.

## 5. Approaches Considered

### Approach A: Minimal patch

Remove the right-side info card and stop reading `reasoning` parts, but leave the rest of the reply extraction behavior intact.

Pros:

- smallest edit count
- fastest short-term fix

Cons:

- still allows execution summaries and internal logs to leak if they land inside assistant `text`
- does not define a stable WeChat-channel output rule

### Approach B: WeChat-channel simplification and output sanitization

Simplify the page to a single account-list panel and introduce a WeChat-specific outbound text extraction and sanitization step, while preserving the existing capability and media model.

Pros:

- directly addresses all three reported problems
- keeps the change surface mostly inside the WeChat module
- preserves tool, memory, and proactive media behavior

Cons:

- requires new WeChat-specific tests
- introduces a small amount of channel-specific output logic

### Approach C: Conversation-core final-answer redesign

Change the general conversation system so every channel consumes a separately-modeled end-user-safe answer artifact.

Pros:

- architecturally clean in the long term

Cons:

- much larger scope than the current problem
- higher regression risk outside WeChat
- unnecessary for the current pass

## 6. Recommendation

Choose Approach B.

This pass needs to be simple, local, and effective. The product issue is on the WeChat surface, so the fix should stay mostly inside the WeChat page and WeChat relay service. We should not expand this into a cross-channel conversation refactor.

## 7. Proposed Design

### 7.1 Page structure

The page will remain a split layout because the user explicitly wants to keep the left `接入配置` panel unchanged.

The right side will be simplified to one panel only:

- title: `接入账号记录`
- supporting text: concise account-list guidance only
- body: the existing account table with the current actions

The following right-side content will be removed:

- `接入信息`
- account summary counters
- QR status summary
- default workspace summary
- workspace switch summary
- the `WechatLoginPreview` section

To keep the module maintainable, the account list should be extracted into a dedicated component under:

- `apps/desktop/MaomiAgent/src/mainview/modules/wechat/components`

This keeps `page.tsx` focused on state loading, mutations, and layout assembly instead of keeping all table rendering inline.

### 7.2 Outbound WeChat reply rule

The WeChat channel should keep internal capabilities available, but the final text sent to end users must be filtered at the channel boundary.

The outbound reply flow will become:

1. inspect the latest assistant message in the conversation result
2. collect only assistant `text` parts
3. ignore assistant `reasoning` parts entirely
4. run a lightweight WeChat-specific sanitization pass over the merged text
5. if the sanitized result is empty, send a stable fallback reply

The sanitization pass should stay intentionally simple and line-oriented. It should remove obvious internal-output lines such as:

- execution-summary style headings
- tool-trace labels
- shell or command echo lines
- code fence blocks used as execution logs
- raw local file path lines
- English internal-log paragraphs that clearly describe runtime execution rather than user-facing results

The sanitization must not try to suppress legitimate user-facing result text just because it mentions work that was completed. For example, a normal end-user sentence like "图片已经发给你了" should remain valid. The goal is to remove execution process leakage, not to hide task results.

### 7.3 Capability and memory stance

The WeChat channel must keep its current capability posture.

`buildWechatConversationSettings()` should continue to enable:

- `mcp.runtime`
- `skills.runtime`
- `wechat.runtime`

This pass will not disable tool usage or memory usage inside the WeChat-backed session. The correction happens only at the outbound text boundary.

### 7.4 Media behavior

Inbound media support remains part of the current design:

- received WeChat media is materialized to disk
- materialized media is converted into conversation attachments
- those attachments continue into `conversationCommand.sendMessage(...)`

Outbound proactive media also remains part of the design:

- the WeChat runtime capability provider must continue to expose `wechat_send_media_file`
- the relay service must continue to support `sendConversationMedia(...)`
- sanitizing the final text reply must not interfere with actual media sending

This means the agent can still decide to send an image proactively when the task requires it. The channel correction only changes how plain text replies are extracted and cleaned.

### 7.5 Error handling

If sanitization removes all content from the candidate reply, WeChat should still receive a stable fallback message rather than silence.

If media sending fails, the existing error path remains valid:

- log the failure in the WeChat service
- preserve the delivery-error notice behavior already implemented for the channel

This pass does not introduce new retry orchestration.

## 8. File Impact

The implementation should stay concentrated in these areas:

- UI page and components:
  - [apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.tsx](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.tsx)
  - new component file under [apps/desktop/MaomiAgent/src/mainview/modules/wechat/components](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/wechat/components)
  - [apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.css](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.css)
- WeChat relay service:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts)
- WeChat tests:
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts)
  - [apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.test.ts](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.test.ts)
- Optional renderer regression coverage if needed:
  - test file under [apps/desktop/MaomiAgent/src/mainview/modules/wechat](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/wechat)

## 9. Testing Strategy

The implementation should be validated with focused regression coverage:

- service-level tests proving WeChat reply extraction ignores `reasoning`
- service-level tests proving obvious execution-summary and internal-log text is stripped from the final outbound reply
- service-level tests proving the fallback reply is used when sanitization removes everything
- capability-provider tests proving `wechat_send_media_file` remains exposed
- existing inbound-media attachment tests kept green

For the renderer, a lightweight regression test is acceptable if it can cheaply prove the main content now renders only the account list panel. If renderer regression coverage becomes disproportionately expensive, the plan can rely on existing page structure tests plus manual verification for the final visual check.

## 10. Risks and Mitigations

### Risk: sanitization removes too much user-facing text

Mitigation:

- keep the filtering line-oriented and conservative
- prefer removing obvious internal markers over broad text heuristics
- include tests for mixed content where only the internal portion is stripped

### Risk: page simplification accidentally breaks account actions

Mitigation:

- preserve the existing account-table columns and action handlers
- move rendering into a dedicated component without changing the command wiring

### Risk: media capability regresses while fixing text output

Mitigation:

- keep media code paths untouched except for surrounding test coverage
- explicitly test that the capability provider still exposes `wechat_send_media_file`

## 11. Acceptance Criteria

This design is considered implemented correctly when all of the following are true:

- the desktop WeChat page keeps the left configuration panel intact
- the right side shows only the account list panel
- WeChat no longer receives assistant `reasoning` content
- obvious internal execution summaries and tool traces are not echoed back to WeChat users
- WeChat sessions still keep tool and memory capabilities enabled
- inbound image analysis still works through conversation attachments
- outbound proactive image sending remains available through the existing WeChat capability
