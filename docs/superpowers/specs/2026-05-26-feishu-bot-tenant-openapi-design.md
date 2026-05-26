# Feishu Bot Tenant-Only OpenAPI Design

Date: 2026-05-26
Status: Draft for review
Owner: Codex

## 1. Context

The desktop Feishu bot runtime already has a working WebSocket transport, stable message routing, pending-action confirmation, and a conversation pipeline that can project bot messages into desktop sessions.

However, the current Feishu action layer still mixes two different product surfaces conceptually:

- the Feishu bot channel
- the Feishu smart assistant OAuth channel

That is the wrong boundary for this feature.

The Feishu bot is a multi-user surface backed by the bot application itself. Its OpenAPI execution must use the bot application's own identity plane and only expose actions that are valid under tenant-level application credentials.

The Feishu smart assistant is a separate personal surface backed by a single user's OAuth grant. Its `user_access_token` represents an individual and must not be reused by the bot channel.

The user explicitly requires:

- Feishu bot and Feishu smart assistant must be fully isolated
- bot execution must not use or depend on any user token
- bot capabilities should be modeled as a tenant-only capability JSON similar in shape to the smart-assistant catalog
- the bot must only expose actions that the Feishu SDK and OpenAPI support under tenant credentials
- unsupported actions must not be offered by the bot

This design turns the Feishu bot into a tenant-only OpenAPI surface with a strict capability allowlist and hard token isolation.

## 2. Goals

- Make the Feishu bot use only its own application credential plane.
- Prevent all runtime, state, and capability mixing between:
  - bot tenant credentials
  - smart-assistant personal OAuth credentials
- Introduce a bot-specific tenant capability catalog that drives:
  - visible actions
  - runtime allowlist checks
  - user-facing status and diagnostics
- Support a first rollout of real tenant-only Feishu SDK actions for:
  - `calendar.agenda`
  - `calendar.find_slot`
  - `calendar.create_event`
  - `tasks.create`
  - `tasks.complete`
- Keep the existing bot WebSocket runtime, conversation routing, semantic confirmation, and processed-dialog list intact.

## 3. Non-Goals

- No reuse of smart-assistant `user_access_token` inside the bot channel.
- No hidden fallback from bot execution to personal OAuth.
- No attempt to make the bot act as a tenant-wide administrator for tasks.
- No first-pass enablement of docs, meetings, or minutes in the bot tool surface until tenant-only semantics are explicitly confirmed and implemented.
- No redesign of the simplified Feishu bot page layout that was already agreed upon.

## 4. Approaches Considered

### Approach A: Tenant-only bot capability catalog with a dedicated bot SDK gateway

Keep the existing bot runtime and action registry shape, but add a bot-only tenant capability catalog and a dedicated Feishu SDK gateway that uses only bot application credentials.

Pros:

- matches the requested isolation boundary
- minimizes disruption to the current WebSocket bot flow
- enables real OpenAPI execution without inheriting smart-assistant OAuth behavior
- keeps capability exposure explicit and auditable

Cons:

- requires a second Feishu capability catalog model
- requires a second execution gateway instead of sharing the smart-assistant one

### Approach B: Reuse the smart-assistant catalog and filter it for bot sessions

Continue to use the existing smart-assistant action catalog and try to filter out unsupported actions for bot sessions at runtime.

Pros:

- smaller short-term code delta
- more shared state shape

Cons:

- violates the requested product isolation
- makes it easy to accidentally expose user-token actions in the bot
- keeps the wrong conceptual boundary in place

### Approach C: Build a completely separate bot planner and bypass the existing action registry

Create a new bot-only planner and executor that does not use the existing action registry structure.

Pros:

- strongest surface isolation
- highly explicit control over bot behavior

Cons:

- duplicates existing action-routing and confirmation patterns
- increases maintenance cost
- slows down delivery of real tenant-only OpenAPI support

## 5. Recommendation

Choose Approach A.

It keeps the already-working bot conversation pipeline and semantic confirmation loop, while finally fixing the token and capability boundary that matters for this feature:

- bot execution uses only bot application credentials
- smart-assistant OAuth remains personal and separate
- bot-visible actions are explicitly tenant-only
- unsupported actions are blocked at both injection time and execution time

## 6. Proposed Design

### 6.1 Hard credential isolation

The system will maintain three distinct conceptual buckets, but only two are active in this feature:

- `feishu_bot_tenant`
- `feishu_smart_assistant_personal`
- future buckets if needed later

For this design, the bot only uses `feishu_bot_tenant`.

Rules:

- bot runtime never reads smart-assistant OAuth tokens
- bot runtime never writes smart-assistant OAuth state
- bot capability injection never consults smart-assistant action readiness
- bot execution never falls back to `user_access_token`

This is a hard product boundary, not a best-effort convention.

### 6.2 Bot tenant capability catalog

The bot gets its own capability catalog, structurally similar to the smart-assistant catalog but semantically independent.

It will live under bot state and be computed from bot configuration plus the tenant-only allowlist.

Example shape:

```json
{
  "profile": "feishu_bot_tenant",
  "credentialKind": "tenant_access_token",
  "allowUserAccessToken": false,
  "identitySource": "bot_app",
  "resourceLocator": {
    "fromMessageSender": true,
    "allowedUserIdTypes": ["open_id", "union_id"]
  },
  "domains": [
    {
      "key": "calendar",
      "status": "ready",
      "requiredScopes": [
        "calendar:calendar:readonly",
        "calendar:calendar.event:read",
        "calendar:calendar.free_busy:read",
        "calendar:calendar.event:create",
        "calendar:calendar.event:update"
      ]
    },
    {
      "key": "tasks",
      "status": "ready",
      "requiredScopes": [
        "task:task:read",
        "task:task:write",
        "task:task:writeonly"
      ],
      "notes": [
        "Only app-visible or app-managed tasks are supported."
      ]
    },
    {
      "key": "docs",
      "status": "planned"
    },
    {
      "key": "meetings",
      "status": "planned"
    }
  ],
  "actions": [
    "calendar.agenda",
    "calendar.find_slot",
    "calendar.create_event",
    "tasks.create",
    "tasks.complete"
  ],
  "blockedActions": [
    "docs.search",
    "docs.read",
    "docs.create",
    "docs.update",
    "meetings.search_records",
    "meetings.read_minutes"
  ]
}
```

This catalog is not derived from personal OAuth readiness. It is derived from:

- bot app configuration
- tenant-only Feishu SDK/OpenAPI compatibility
- implementation readiness for each action

### 6.3 Resource locator model

Bot message sender identity is used only as a resource locator, never as a token source.

The runtime may extract:

- `open_id`
- `union_id`
- `chat_id`
- `thread_id`
- sender display information

These values may be used to:

- locate the sender's primary calendar
- locate invitees or members when the action input already contains supported identifiers
- stamp audit metadata onto pending actions and processed-dialog records

These values must never be used to:

- resolve a user token
- access smart-assistant OAuth state
- emulate personal execution

### 6.4 Bot-visible first-rollout allowlist

The first rollout will expose exactly these actions to the bot:

- `calendar.agenda`
- `calendar.find_slot`
- `calendar.create_event`
- `tasks.create`
- `tasks.complete`

The first rollout will explicitly not expose:

- docs actions
- meetings actions
- minutes actions
- any other Feishu domains

The reason is not UI simplification. The reason is tenant-only correctness.

Only actions whose tenant-credential semantics are explicitly understood and implemented are allowed into the bot surface.

### 6.5 Bot runtime tool injection policy

Bot-created conversations will not receive the generic smart-assistant tool surface.

Instead, the conversation capability provider will inject a bot-specific tool surface derived from the bot tenant catalog.

Two enforcement layers are required:

1. injection-time filtering
   - unsupported actions do not appear in the bot-visible action space

2. execution-time filtering
   - if a blocked or unknown action somehow reaches execution, the runtime rejects it deterministically

This prevents accidental capability bleed-through from prompt behavior, stale metadata, or future refactors.

### 6.6 Tenant SDK gateway

A dedicated `desktop-feishu-bot-tenant-sdk-gateway` will be introduced.

Responsibilities:

- create and cache the bot application's Feishu SDK client
- acquire and refresh `tenant_access_token` or `app_access_token` as required by the SDK flow
- apply tenant-scoped request options such as `withTenantToken(...)`
- expose normalized methods for the allowed bot actions
- convert SDK errors into stable application-level failures

This gateway must not know about smart-assistant OAuth state.

### 6.7 Calendar action semantics

#### `calendar.agenda`

Flow:

1. Resolve sender `open_id` or `union_id` from the message event.
2. Resolve the sender's primary calendar using tenant-safe identifier types.
3. Query the time window from that calendar.
4. Return normalized agenda items.

Failure conditions:

- missing sender locator id
- primary calendar not found
- bot lacks access to the target calendar
- invalid time window

#### `calendar.find_slot`

Flow:

1. Resolve the sender's primary calendar as the baseline target.
2. Resolve additional supported attendee identifiers if present.
3. Use tenant-safe free/busy query APIs.
4. Return normalized slot suggestions or free/busy ranges.

The first implementation may stay conservative and support:

- self-only slot lookup
- self plus explicitly parseable tenant-safe participants

It must not invent unsupported cross-user semantics.

#### `calendar.create_event`

Flow:

1. The first request produces a pending action and confirmation summary.
2. Only a confirmed action executes.
3. Resolve the sender's primary calendar.
4. Create the event through the tenant gateway.
5. If the request is for a meeting, map it to calendar event creation with meeting-enabled payload fields.
6. If supported attendee ids are available, add attendees through tenant-safe APIs.

The user-facing semantics are:

- "create a schedule" and "create a meeting" both map to `calendar.create_event`
- meeting behavior is expressed through event payload configuration, not a second create action

Partial success is allowed but must be reported honestly. Example:

- event created successfully
- one or more attendees could not be added

That must not be reported as a total success.

### 6.8 Task action semantics

#### `tasks.create`

This action creates a task under tenant-safe application semantics.

Important boundary:

- it is not a personal "all my private tasks" proxy
- it only operates within application-visible or application-managed task scope

If the sender can be represented as a supported task member identifier, that person may be attached to the created task as a member or assignee when valid.

If not, the task may still be created as an application-managed task, but the result text must say so explicitly.

#### `tasks.complete`

This action is only valid when the target task is already known and application-manageable.

Rules:

- no fuzzy "complete one of my tasks" behavior
- no guessing a task by title if the result is ambiguous
- no pretending tenant credentials can complete arbitrary personal tasks

If `taskId` is missing or the task is not application-visible, the action must stop with a clear explanation instead of a guessed mutation.

### 6.9 Blocked domains and actions

For the first rollout:

- `docs` remains blocked
- `meetings` remains blocked
- `minutes` remains blocked

Blocked means:

- not injected into the bot tool surface
- rejected if forced into execution
- reported as unavailable in a user-facing, non-internal way

This is intentionally strict. It protects the tenant-only boundary and keeps the first rollout auditable.

### 6.10 Confirmation and conversation flow

The existing bot confirmation model remains in place:

- mutating actions do not execute on the first turn
- pending actions are stored per bot conversation scope
- natural-language confirmation remains supported

What changes is the execution backend:

- the stored execute input for bot actions is now interpreted under tenant-only semantics
- pending action replay never attempts to resolve personal tokens

Private and group conversation routing rules remain as previously approved:

- private chat binds by `chatId`
- group chat binds by `chatId + threadId`, with fallback to `chatId`

### 6.11 Error model

User-facing failures should be short, honest, and surface the real boundary:

- missing sender locator:
  - `当前消息缺少可用的飞书身份标识，无法定位目标资源。`
- calendar permission failure:
  - `机器人应用暂时没有该日历的访问或写入权限。`
- task scope failure:
  - `当前机器人只支持应用可管理的任务，不支持直接操作个人全部待办。`
- blocked capability:
  - `当前飞书机器人未开通此能力。`

Internal terms such as `tenant_access_token` should not appear in end-user messages by default.

### 6.12 State and type changes

The shared Feishu state model should gain bot-specific catalog types rather than reusing smart-assistant action view types.

Expected additions:

- bot tenant capability profile view
- bot tenant domain/action view types
- bot blocked action list
- explicit bot credential kind metadata

The state hydrator should compute bot tenant capability state independently from smart-assistant OAuth state.

## 7. File-Level Integration Plan

Primary files expected to change during implementation:

- `apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-state-hydrator.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-bot-runtime.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-conversation-capability-provider.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/calendar-domain-action-handler.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/tasks-domain-action-handler.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/meetings-domain-action-handler.ts`

New files expected:

- `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-bot-tenant-sdk-gateway.ts`
- tests covering bot tenant capability injection and tenant-only execution

## 8. Testing Strategy

### 8.1 State and catalog tests

- bot tenant catalog is computed independently from smart-assistant OAuth state
- bot catalog declares:
  - `credentialKind = tenant_access_token`
  - `allowUserAccessToken = false`
- bot action allowlist contains only first-rollout actions
- blocked actions remain unavailable

### 8.2 Capability injection tests

- bot conversations receive only tenant-only actions
- smart-assistant conversations keep their own capability surface
- bot sessions never inherit user-token-only actions

### 8.3 Runtime tests

- sender `open_id` and `union_id` remain available as locator metadata
- missing sender locator id blocks tenant actions that need target resource resolution
- blocked actions are rejected deterministically
- pending confirmed actions replay through the tenant gateway only

### 8.4 Calendar integration tests

- `calendar.agenda` resolves sender primary calendar then queries it
- `calendar.find_slot` performs tenant-safe availability queries
- `calendar.create_event` executes only after confirmation
- meeting-style event creation emits the expected meeting-enabled payload
- partial attendee-add failures are reported honestly

### 8.5 Task integration tests

- `tasks.create` uses real SDK create behavior
- `tasks.complete` updates only application-manageable tasks
- missing `taskId` prevents guessed completion
- out-of-scope tasks fail with explicit boundary messaging

### 8.6 Real smoke tests

- bot channel creates a real calendar event visible in Feishu calendar
- bot channel can create an application-managed task
- blocked domains are refused instead of faked
- no smart-assistant OAuth state is consulted during bot execution

## 9. Success Criteria

This design is successful when all of the following are true:

- Feishu bot and Feishu smart assistant are operationally isolated
- bot actions execute only through tenant credentials
- bot cannot accidentally use personal OAuth tokens
- bot-visible capabilities are explicitly tenant-only
- calendar and task actions produce real Feishu-side state changes
- unsupported actions are not faked and are not exposed

