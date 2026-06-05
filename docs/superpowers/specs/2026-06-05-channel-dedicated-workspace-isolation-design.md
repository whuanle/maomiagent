# Channel Dedicated Workspace Isolation Design

Date: 2026-06-05
Status: Approved for implementation
Owner: Codex

## Context

The current WeChat and Feishu bot runtimes assume a workspace already exists before they create a conversation session.

Today:

- WeChat tries `selectedWorkspaceId` or `defaultExecutionWorkspaceId`
- if neither is configured, WeChat falls back to the first existing workspace
- if no workspace exists, WeChat throws `未配置 selectedWorkspaceId 或 defaultExecutionWorkspaceId，无法创建会话`
- Feishu bot follows a similar pattern by resolving configured workspace ids first and then falling back to an existing workspace list

This behavior creates two product problems:

1. a fresh installation with no existing workspace can fail on the first incoming channel message
2. even when workspaces do exist, different channel users can be routed into the same shared workspace, which breaks isolation and causes cross-user context leakage

The required product behavior is:

- WeChat should isolate by the account-side `userId`
- Feishu should isolate by `tenantKey + chatId`
- Feishu group chats should use one shared workspace for the whole group
- Feishu personal chats should naturally isolate through their own `chatId`

`threadId` should not create a separate workspace. Different threads inside the same Feishu chat should continue sharing the same chat-level workspace.

## Goals

- Remove the requirement that channel conversations depend on a preconfigured default workspace.
- Automatically create or reuse a dedicated workspace for each channel identity scope.
- Prevent different WeChat users from sharing the same workspace.
- Prevent different Feishu chats from sharing the same workspace.
- Keep Feishu group chats mapped to one workspace per group.
- Keep existing conversation binding behavior intact after a workspace is resolved.
- Preserve backward compatibility for existing explicit workspace configuration where it is still valid.

## Non-Goals

- No redesign of the WeChat or Feishu settings pages in this pass.
- No migration of every historical binding into a new workspace immediately.
- No per-sender workspace split inside the same Feishu group chat.
- No change to conversation threading semantics.
- No change to channel model-selection behavior.

## Product Rules

- WeChat workspace scope is keyed by the account-side `userId`.
- If a legacy WeChat account does not yet expose a usable `userId`, the runtime may fall back to a stable account-level key to avoid delivery failure, but that is only a compatibility fallback.
- Feishu workspace scope is keyed by `tenantKey + chatId`.
- Feishu personal chats and group chats both use the same rule; the difference comes from `chatId` semantics, not from a separate branching model.
- Feishu `threadId` remains a conversation/session concern and must not affect workspace ownership.
- Channel runtimes should prefer dedicated-workspace resolution over generic “first workspace in the list” fallback.

## Approaches Considered

### Approach A: keep default workspace behavior and only improve errors

Keep the existing default-workspace resolution and replace the current failure with a more descriptive error.

Pros:

- smallest code delta
- no new workspace creation path in channel runtimes

Cons:

- does not solve fresh-install failure
- does not solve cross-user workspace sharing
- keeps channel isolation dependent on manual configuration

### Approach B: create dedicated workspaces lazily on first real message, recommended

Resolve a stable identity key from the incoming channel message, then look up or create a dedicated workspace before creating the channel conversation session.

Pros:

- directly fixes fresh-install failure
- creates workspaces only for identities that actually use the channel
- gives stable isolation semantics for both WeChat and Feishu
- keeps group-chat sharing and personal-chat isolation aligned with real channel boundaries

Cons:

- first message for a new identity takes the workspace-create path
- requires channel runtimes to receive workspace create capability

### Approach C: precreate workspaces during channel configuration

Create dedicated workspaces when WeChat login or Feishu bot config is saved.

Pros:

- avoids first-message creation work in some cases

Cons:

- configuration time does not reliably know all future Feishu chat scopes
- can create many unused workspaces
- still requires a lazy path for newly encountered identities

## Recommendation

Choose Approach B.

Dedicated workspaces are fundamentally runtime identity artifacts, not configuration artifacts. The first message is the earliest reliable moment to know which WeChat user or Feishu chat is actually speaking. Lazy creation keeps the data model aligned with real usage while solving both the install-time failure and the cross-user contamination problem.

## Proposed Design

### 1. Add dedicated workspace resolution to channel runtimes

Before a WeChat or Feishu bot runtime creates a conversation session, it should resolve a dedicated workspace for the current channel identity.

That resolution flow should:

1. derive a stable scope key from the incoming channel metadata
2. derive a stable workspace id from that scope key
3. check whether the workspace already exists
4. create it if missing
5. return the workspace id for binding and session creation

This replaces the current assumption that a default workspace must already exist.

### 2. WeChat identity model

WeChat dedicated workspace scope is keyed by the account-side `userId`.

Resolution order:

1. use the stored account `userId` when available
2. if the account is a legacy record without `userId`, use a stable compatibility fallback derived from the WeChat account identity so message delivery does not fail

Workspace ownership is per WeChat user identity, not per peer conversation binding. Multiple messages from the same WeChat user should reuse the same workspace, while different users must resolve different workspaces.

### 3. Feishu identity model

Feishu dedicated workspace scope is keyed by `tenantKey + chatId`.

This means:

- one personal chat gets one workspace
- one group chat gets one workspace shared by the whole group
- different chats in the same tenant still get different workspaces
- the same `chatId` in different tenants must not collide

`threadId` remains part of conversation binding and reply routing, but not workspace ownership.

### 4. Stable workspace ids and names

The runtime should derive deterministic workspace ids so the same identity always resolves to the same workspace.

Examples of id shape:

- `wechat-user-<normalized-key>`
- `feishu-chat-<normalized-key>`

The exact normalization can follow existing workspace id rules, but it must:

- be deterministic
- avoid unsafe path characters
- include enough source information to prevent collisions across channels

Workspace names should stay human-readable, for example:

- `微信用户 <label>`
- `飞书会话 <label>`

If a readable label is missing, the name can fall back to the stable identity key.

### 5. Capability and dependency changes

The WeChat runtime currently only receives workspace list capability. It needs workspace mutation capability so it can create a dedicated workspace when required.

The Feishu bot runtime should also resolve through workspace create/get logic instead of list-only fallback logic.

This change belongs in the runtime service wiring layer and should stay internal to channel execution. It does not require a UI-first workflow.

### 6. Backward compatibility rules

Existing explicit workspace configuration should remain tolerated, but it should stop being the only way a channel can function.

Rules:

- existing valid bindings continue to work as-is
- if an existing binding already points to a valid session and workspace, do not move it eagerly
- if a binding must be recreated, recreate it against the dedicated workspace resolved from the new identity rules
- explicit config fields such as `selectedWorkspaceId` and `defaultExecutionWorkspaceId` may remain as compatibility fields, but the default runtime path should no longer fail when they are unset

### 7. Failure handling

If dedicated workspace resolution fails, the runtime should raise a channel-specific error that describes workspace creation failure rather than implying a missing manual selection.

Failure reasons should distinguish:

- identity key missing or invalid
- workspace creation failure
- workspace lookup inconsistency

This keeps operational diagnosis accurate and avoids misleading users into thinking they must manually pick a default workspace for a channel that should self-isolate.

## Testing

Add focused tests for both runtimes.

### WeChat

- creates a dedicated workspace when the first message arrives for a new account-side `userId`
- reuses the same workspace for repeated messages from the same `userId`
- creates different workspaces for different `userId` values
- falls back to compatibility identity only when `userId` is unavailable
- no longer fails simply because `selectedWorkspaceId` and `defaultExecutionWorkspaceId` are unset

### Feishu

- creates a dedicated workspace for a new `tenantKey + chatId`
- reuses the same workspace for repeated messages in the same chat
- creates different workspaces for different chats in the same tenant
- creates different workspaces for the same `chatId` across different tenants
- keeps different senders inside the same group chat on the same workspace
- keeps different threads inside the same chat on the same workspace

## Validation

The implementation is complete when:

- a fresh install can receive the first WeChat or Feishu message without requiring manual workspace configuration
- WeChat users are isolated by account-side `userId`
- Feishu chats are isolated by `tenantKey + chatId`
- Feishu group messages from different senders reuse the same group workspace
- session creation no longer depends on “first workspace in list” fallback behavior
- automated tests cover the new dedicated-workspace creation and reuse rules
