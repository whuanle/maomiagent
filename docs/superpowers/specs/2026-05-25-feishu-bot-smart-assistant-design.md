# Feishu Bot Scoped Smart Assistant And Semantic Confirmation Design

Date: 2026-05-25
Status: Draft for review
Owner: Codex

## 1. Context

The desktop Feishu bot runtime already has a working WebSocket transport and can route plain text messages into the desktop conversation pipeline. However, bot-created conversations still do not expose Feishu smart-assistant capabilities by default, so the bot cannot actually use Feishu calendar, docs, tasks, or meetings from normal chat turns.

The user wants the Feishu bot channel to become a practical action surface with these rules:

- all Feishu bot conversations enable Feishu capabilities by default
- the bot channel exposes only:
  - `docs`
  - `calendar`
  - `tasks`
  - `meetings`
- private chats must remain stably isolated per person
- group chats do not need strict per-user conversation isolation
- mutating operations must never execute immediately
- confirmation must happen through normal user replies such as `是的`, `确认`, `没问题`, `好的`
- the system should rely on semantic intent judgment rather than rigid button or command UX

The current codebase already contains reusable Feishu domain action handlers and a conversation capability provider. This design focuses on connecting those existing parts to the Feishu bot channel with a scoped capability surface and a bot-safe confirmation loop.

## 2. Goals

- Enable Feishu smart-assistant capabilities by default for all Feishu bot-created conversations.
- Limit the bot channel to the four requested Feishu domains:
  - `docs`
  - `calendar`
  - `tasks`
  - `meetings`
- Preserve stable conversation routing:
  - private chats isolate naturally
  - group chats share context by chat and thread
- Require confirmation before all mutating actions.
- Allow confirmation, cancellation, and modification through natural-language follow-up messages instead of buttons or explicit slash commands.
- Reuse the existing Feishu action registry and confirmation contracts instead of introducing a second domain execution stack.

## 3. Non-Goals

- No redesign of the Feishu page interaction model beyond what is already simplified for the bot panel.
- No broad expansion to other Feishu domains such as messenger, drive, mail, contact, base, or sheets.
- No card-button confirmation UI in this pass.
- No strict per-user isolation inside group chats.
- No attempt to make the model infer confirmation from unbounded context without a persisted pending-action state.

## 4. Approaches Considered

### Approach A: Scoped capability injection with persisted semantic confirmation

For bot-created conversations, enable Feishu capabilities by default, but only expose the four requested domains. Persist one pending mutating action per bot conversation scope and use a lightweight semantic intent step to classify follow-up user replies into `confirm`, `cancel`, `modify`, `new_request`, or `unclear`.

Pros:

- matches the user’s requested interaction model
- safely gates mutating actions
- limits tool exposure to the requested domains only
- reuses the existing action handlers and their `confirmationRequired` contract
- avoids fragile keyword-only confirmation logic

Cons:

- requires a pending-action state model keyed by bot conversation scope
- adds one extra routing stage before normal follow-up turns

### Approach B: Full Feishu capability exposure with prompt-only confirmation behavior

Enable the existing full `feishu.smartAssistant` surface for bot conversations and rely on prompt instructions plus model behavior to avoid non-target domains and to infer confirmations from raw context.

Pros:

- smaller implementation delta
- reuses more existing capability wiring unchanged

Cons:

- violates the user’s explicit domain constraint
- increases accidental tool exposure
- makes mutation safety too dependent on prompt behavior

### Approach C: Bot-only domain planner outside the conversation capability layer

Route bot messages into a separate planner that directly maps user requests to domain actions and manages confirmation itself, without using the existing conversation capability provider as the primary tool surface.

Pros:

- tight execution control
- clear bot-specific behavior

Cons:

- duplicates logic already present in the smart-assistant action stack
- creates a second Feishu execution path to maintain
- drifts away from the existing conversation architecture

## 5. Recommendation

Choose Approach A.

It is the only option that satisfies all of the confirmed product rules at once:

- bot conversations get Feishu capabilities by default
- only four domains are exposed
- private and group routing stay predictable
- mutating operations cannot run without confirmation
- confirmation works through normal conversational replies

It also keeps the implementation aligned with the current desktop architecture by reusing the existing Feishu action registry instead of building a separate bot-only domain executor.

## 6. Proposed Design

### 6.1 Conversation binding rules

The Feishu bot runtime will bind incoming messages to desktop conversation sessions using channel-aware scope keys.

Private chat:

- one stable Feishu private chat maps to one stable desktop conversation session
- the binding key is the private `chatId`
- no additional user split is required because the private chat already uniquely identifies the person-facing channel

Group chat:

- one group thread maps to one shared desktop conversation session
- the binding key is `chatId + threadId`
- if `threadId` is absent, fall back to `chatId`
- no per-user session split is applied inside group chat

Even though group chats do not isolate by user, each inbound message must still carry speaker identity into the conversation context:

- `senderId`
- `senderName`
- `chatType`
- `chatId`
- `threadId`

This allows the model to understand who said what without fragmenting the conversation into separate user sessions inside the same group thread.

### 6.2 Bot-scoped capability injection

All new conversations created by the Feishu bot runtime will enable Feishu capability access by default.

However, the bot channel must not expose the full smart-assistant domain surface. Instead, the capability provider will filter the bot-visible action space to only:

- `docs`
- `calendar`
- `tasks`
- `meetings`

This filtering must be driven by conversation metadata or a bot-scoped capability policy so that:

- bot-created conversations receive the limited allowlist automatically
- non-bot surfaces are not forced into the same restriction
- future Feishu smart-assistant work can evolve separately from the bot channel

### 6.3 Mutation gating and pending action model

Read-only actions may execute immediately.

Mutating actions must never execute on the first turn. Instead, the runtime creates a pending action record for the current bot conversation scope and returns a confirmation summary to the user.

Each conversation scope may hold at most one pending action at a time.

The pending action record stores:

- `pendingId`
- `scopeKey`
- `sessionId`
- `domain`
- `actionId`
- normalized action input
- user-facing summary text
- initiator `senderId`
- initiator `senderName`
- `createdAt`
- `expiresAt`

The initial reply format remains plain text. Example:

- `准备创建会议：今天 9:00-10:00，主题 AI 落地讨论。回复确认即可执行，也可以直接补充修改。`

No button, slash command, or card interaction is required.

### 6.4 Semantic confirmation classifier

When a conversation scope has a pending action, the next user turn does not immediately enter the normal conversation pipeline. It first goes through a constrained semantic classification step.

The classifier output is limited to exactly five outcomes:

- `confirm`
- `cancel`
- `modify`
- `new_request`
- `unclear`

This classification is semantic rather than keyword-only. The runtime should recognize natural replies such as:

- `确认`
- `好的`
- `没问题`
- `是的`
- `改成下午三点`
- `先别建了`

but the classifier result must always collapse into one of the five explicit categories above so the bot runtime can remain deterministic.

### 6.5 Follow-up behavior rules

When the classifier returns:

- `confirm`
  - re-execute the stored action with `confirm=true`
- `cancel`
  - clear the pending action and reply that the operation has been canceled
- `modify`
  - combine the original draft intent with the new user correction
  - regenerate a new pending action summary
  - do not execute yet
- `new_request`
  - drop the previous pending action
  - treat the incoming message as a fresh user request
- `unclear`
  - keep the pending action
  - reply that the user needs to clarify whether they want to execute, cancel, or modify the pending action

For group chat, confirmation is scoped to the same thread but is not restricted to the original sender. This follows the user’s rule that group conversations do not require strict per-user isolation.

The system must still record:

- who initiated the action
- who confirmed it

so later audit or debugging does not lose attribution.

### 6.6 Expiration and safety rules

Pending actions must expire automatically after a fixed timeout. The default timeout is `30 minutes`.

After expiration:

- the old pending action is discarded
- a later reply such as `确认` must not execute the old action
- the bot replies that the previous pending action has expired and asks the user to restate the request

Mutation execution errors must not discard the pending action automatically. If the action fails due to permission issues, invalid input, scheduling conflict, or similar domain errors:

- keep the pending action
- return a short user-facing explanation
- allow the user to modify the request or retry confirmation

### 6.7 Execution flow

The runtime flow is:

1. Feishu WebSocket receives an inbound message event.
2. The bot runtime normalizes the event into a channel message.
3. The runtime resolves the session binding by private or group scope rules.
4. The runtime ensures the conversation exists and is marked as a Feishu bot conversation with the scoped allowlist.
5. The inbound user message is appended with sender and chat metadata.
6. If there is no pending action:
   - run normal conversation handling
   - allow read-only Feishu actions to execute immediately
   - if a mutating action returns `confirmationRequired`, materialize a pending action summary instead of executing
7. If there is a pending action:
   - run the semantic confirmation classifier first
   - handle `confirm`, `cancel`, `modify`, `new_request`, or `unclear`
8. When a mutation finally executes successfully:
   - clear the pending action
   - reply with the execution result

### 6.8 Reuse boundary

This design explicitly reuses the existing Feishu smart-assistant action handlers for:

- domain-specific input normalization
- read vs mutation semantics
- preview generation
- confirmation requirements
- actual OpenAPI execution

The Feishu bot channel adds:

- scoped domain allowlisting
- conversation binding policy
- pending action storage
- semantic confirmation routing
- bot-facing reply formatting

It does not create a second Feishu domain execution system.

## 7. Data Model Changes

The bot runtime state needs a persisted pending-confirmation structure keyed by bot conversation scope.

Required additions:

- pending action storage under Feishu bot runtime state
- per-scope keys for:
  - private `chatId`
  - group `chatId + threadId`, with `chatId` fallback when no thread exists
- optional audit fields for:
  - initiator identity
  - confirmer identity
  - last semantic classification result

Conversation metadata for bot-created sessions should also capture:

- source kind `feishu_bot`
- tenant key
- binding key inputs such as `chatId` and `threadId`
- scoped capability policy or equivalent allowlist metadata

## 8. Affected Areas

Likely backend areas:

- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-bot-runtime.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-conversation-capability-provider.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-smart-assistant-action-registry.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/stores/desktop-feishu-store.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/abstraction/ports/desktop-feishu-store.ports.ts`
- `apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts`

Likely test areas:

- Feishu bot runtime tests
- Feishu store persistence tests
- Feishu capability provider tests
- Feishu action execution / confirmation integration tests

## 9. Error Handling

The bot must surface short, task-focused messages instead of leaking internal execution detail.

Cases to handle explicitly:

- ambiguous confirmation reply
  - tell the user to clarify whether they want to execute, cancel, or modify
- expired pending action
  - tell the user the old action expired and ask for a fresh request
- SDK / OpenAPI failure
  - return a short actionable failure reason
  - preserve pending state
- group-chat cross-thread reply
  - do not apply confirmation from a different thread to the pending action

## 10. Testing And Validation

### 10.1 Conversation binding

- the same private chat always resolves to the same session
- different private chats never share a session
- the same group thread reuses one session
- different group threads do not share a session
- group chats without `threadId` fall back predictably to `chatId`

### 10.2 Capability exposure

- all bot-created conversations enable Feishu capability access
- only `docs`, `calendar`, `tasks`, and `meetings` are visible in the bot channel
- non-bot conversation surfaces are not unintentionally restricted by the bot allowlist

### 10.3 Confirmation flow

- a mutation request produces a pending summary instead of executing immediately
- natural-language confirmations such as `确认`, `好的`, and `没问题` map to `confirm`
- modification replies such as `改成下午三点` map to `modify`
- replies such as `取消` or `先别做了` map to `cancel`
- unrelated new requests map to `new_request`
- ambiguous follow-up replies map to `unclear`

### 10.4 Failure and expiry

- SDK failures preserve the pending action
- expired pending actions cannot be executed by a late confirmation
- confirmation from a different group thread does not trigger the pending action

### 10.5 End-to-end manual validation

The core manual scenario is:

1. In Feishu, send: `帮我创建一个今天 9 点到 10 点关于 AI 落地的会议`
2. The bot replies with a pending confirmation summary instead of creating the meeting immediately.
3. The user replies: `好的`
4. The bot semantically classifies the reply as `confirm`.
5. The meetings action executes successfully.
6. The bot replies with the created meeting result.

An equivalent scenario should also be verified for:

- task creation
- docs creation or modification
- group-thread confirmation behavior

## 11. Success Criteria

This design succeeds when:

1. every Feishu bot conversation automatically receives the scoped Feishu capability surface
2. only `docs`, `calendar`, `tasks`, and `meetings` are exposed in the bot channel
3. private chats remain isolated while group chats share context by chat and thread
4. mutating actions never execute without semantic confirmation
5. normal language replies such as `确认`, `好的`, and `没问题` can successfully trigger execution
6. pending actions remain safe across ambiguity, failure, and expiry cases
