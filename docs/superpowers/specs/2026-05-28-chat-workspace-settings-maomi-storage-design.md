# Chat Workspace Settings .maomi Storage Design

Date: 2026-05-28
Status: Draft for review
Owner: Codex

## Context

The current chat workspace settings flow is split across browser-local state and runtime session metadata:

- [conversation-workspace-settings-storage.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts) persists workspace chat defaults in `window.localStorage`
- [conversation-workspace-settings-panel.tsx](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx) reads and writes that browser-local state, then separately calls a Bun-side workspace settings sync RPC for existing sessions
- [use-chat-workspace-pane-state.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts) reads the same browser-local state while building default session metadata and while saving preferred model selection
- [assistant-interaction-permission-card.tsx](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/assistant-interaction-permission-card.tsx) also writes browser-local workspace settings directly when saving approval rules

This creates three problems:

- workspace chat defaults are not stored with the workspace itself
- UI defaults and actual runtime defaults can diverge
- multiple code paths can keep writing different sources of truth

The user requirement is narrower and stricter than the current design:

- chat workspace settings must no longer use `localStorage`
- settings must persist in the workspace directory under `.maomi`
- new workspaces must default to enabled `MCP 工具`, enabled `Skills`, and enabled `记忆`
- when the user changes those settings, app restarts must restore the last saved values from the workspace itself

This means the browser-local persistence model must be removed for chat workspace settings and replaced with a workspace-owned file contract.

## Goals

- Make the workspace directory the only persistence source for chat workspace settings.
- Store chat workspace settings at `<workspaceRoot>/.maomi/chat/settings.json`.
- Remove read and write usage of `localStorage` from the chat workspace settings flow.
- Ensure new workspaces default to enabled `MCP 工具`, enabled `Skills`, and enabled `记忆`.
- Ensure saved settings survive app restart because they are read from `.maomi`.
- Make new conversation creation consume the same workspace settings source as the settings UI.
- Keep existing session sync behavior explicit instead of relying on front-end-only state.

## Non-Goals

- This work does not redesign unrelated modules that still use browser storage for other features.
- This work does not attempt to migrate unrelated `.maomi` caches into one generic workspace config system.
- This work does not change the visual layout of the settings page beyond what is required by the storage refactor.
- This work does not create a repository-shared configuration model or Git-aware config workflow.
- This work does not migrate old `localStorage` chat settings into `.maomi`.

## Approaches Considered

### A. Keep the current front-end storage model and only change the visible default switch states

Show `MCP 工具`, `Skills`, and `记忆` as enabled by default in the settings panel, but keep `localStorage` and current session seeding behavior.

Pros:

- smallest surface change in the UI

Cons:

- does not satisfy the requirement to store settings in `.maomi`
- keeps multiple sources of truth
- keeps UI defaults and runtime defaults inconsistent
- still loses settings when the browser-local store is unavailable or reset

### B. Add a Bun-side workspace settings service backed by `.maomi`, then route all chat settings reads and writes through typed RPC

Move chat workspace settings persistence to a Bun-side service that reads and writes `<workspaceRoot>/.maomi/chat/settings.json`. Front-end hooks become RPC-driven state instead of direct browser storage.

Pros:

- fully satisfies the `.maomi` persistence requirement
- gives one source of truth for the settings UI, new session defaults, and existing session sync
- allows Bun-side defaulting for `MCP 工具`, `Skills`, and `记忆`
- removes front-end storage coupling from runtime session creation

Cons:

- larger change surface than a UI-only patch
- requires new RPC contract and tests

### C. Keep front-end storage for reads, but mirror writes to `.maomi`

Continue reading browser-local state in the front end while also writing a `.maomi` file as a backup.

Pros:

- lower initial implementation cost than a full Bun-side source-of-truth shift

Cons:

- preserves two sources of truth
- keeps race conditions between browser state and workspace file state
- still fails the requirement to stop depending on `localStorage`

## Recommendation

Choose Approach B.

The correct boundary is:

- chat workspace settings are owned by the workspace
- Bun is the only authority for defaulting, normalization, file persistence, and existing-session sync
- the front end becomes a typed RPC consumer and no longer reads or writes browser-local chat workspace settings

This is the smallest coherent design that satisfies all user requirements without preserving the current split-brain behavior.

## Proposed Design

### 1. Workspace-owned settings file

Chat workspace settings will be stored at:

- `<workspaceRoot>/.maomi/chat/settings.json`

This file is treated as workspace-local application state:

- it is private to the workspace on the local machine
- it is not designed as a Git-managed shared config contract
- it should only be created when a setting is first saved, not merely when a workspace is opened

Writes must use the same safe pattern already used by existing `.maomi` caches:

- ensure the target directory exists
- write to a temporary file
- rename the temporary file into place atomically

### 2. File schema

The settings file should use a versioned document so future additions do not require another persistence redesign.

```json
{
  "version": 1,
  "updatedAt": "2026-05-28T12:00:00.000Z",
  "settings": {
    "approvalAutoEnabled": true,
    "contextCompressionThresholdPercent": 80,
    "defaultFilePreviewMode": "preview",
    "defaultTerminalShellKind": "powershell",
    "selectedChannelId": "openai",
    "selectedModelId": "gpt-5",
    "managedExecutionEnabled": false,
    "thinkingEnabled": true,
    "permissionRules": [],
    "memoryEnabled": true,
    "sandboxEnabled": false,
    "feishuSmartAssistantEnabled": false,
    "capabilityPreferences": {
      "memory.runtime": true,
      "mcp.runtime": true,
      "skills.runtime": true,
      "feishu.smartAssistant": false
    }
  }
}
```

The logical settings payload should merge the current device-level and workspace-level chat defaults into one workspace-owned settings object. After this change there is no separate persisted "global chat defaults" store for this feature. If a setting belongs to the chat settings panel and it must persist, it persists in this workspace file.

### 3. Default values

When the file does not exist, Bun must return normalized built-in defaults instead of an error.

The required defaults are:

- `approvalAutoEnabled: true`
- `contextCompressionThresholdPercent: 80`
- `defaultFilePreviewMode: "preview"`
- `defaultTerminalShellKind` remains unset unless the user explicitly saves one
- `thinkingEnabled: true`
- `managedExecutionEnabled: false`
- `memoryEnabled: true`
- `sandboxEnabled: false`
- `feishuSmartAssistantEnabled: false`
- `selectedChannelId` remains unset unless the user explicitly saves one
- `selectedModelId` remains unset unless the user explicitly saves one
- `capabilityPreferences["memory.runtime"] = true`
- `capabilityPreferences["mcp.runtime"] = true`
- `capabilityPreferences["skills.runtime"] = true`
- `capabilityPreferences["feishu.smartAssistant"] = false`

These defaults matter in two places:

- what the settings panel shows before any explicit save
- what new conversation sessions inherit when no workspace settings file exists yet

### 4. Bun-side settings service

A dedicated Bun-side chat workspace settings service should be added for this persistence contract.

Its responsibilities are:

- resolve the workspace root from `workspaceId`
- read `<workspaceRoot>/.maomi/chat/settings.json`
- normalize settings fields and defaults
- merge and save patches back to disk
- optionally sync the relevant settings into existing session metadata

The service should not be a generic settings registry. It should stay focused on the chat workspace settings contract introduced by this feature.

### 5. RPC contract

The front end should stop reading and writing chat workspace settings directly. It should instead use two typed RPC operations.

#### `getDesktopConversationWorkspaceSettings`

Input:

- `workspaceId`

Response:

- `settings`: fully normalized chat workspace settings
- `exists`: whether `.maomi/chat/settings.json` already exists
- `path`: absolute path to the settings file
- `warnings`: optional normalization or parsing warnings

Behavior:

- missing file is not an error
- malformed file returns normalized defaults plus warnings

#### `saveDesktopConversationWorkspaceSettings`

Input:

- `workspaceId`
- `patch`
- `syncExistingSessions`

Response:

- `settings`: fully normalized saved settings
- `path`
- `updatedAt`
- `syncedSessionCount`
- `warnings`

Behavior:

- read current saved file or built-in defaults
- merge the patch with normalized current settings
- write the merged result atomically
- if `syncExistingSessions` is true, update existing sessions in the workspace using the existing conversation session metadata sync path

### 6. Front-end state model

The current browser-storage hook should stop being the persistence authority.

The current [conversation-workspace-settings-storage.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts) file should be replaced or renamed so that it becomes a state and normalization layer around RPC data instead of browser storage.

Recommended front-end shape:

- one RPC-driven `useConversationWorkspaceSettings(workspaceId)` hook
- returned state includes:
  - `settings`
  - `loading`
  - `saving`
  - `error`
  - `warnings`
  - `saveSettings(patch, options)`

The current `CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT` may remain as an in-window broadcast event if useful, but it must no longer depend on `localStorage` events or browser persistence semantics.

The old `useConversationGlobalSettings` persistence behavior should be removed for this feature. If the UI still visually groups settings into sections, both sections still read and write the same workspace-owned `.maomi` settings document.

### 7. Front-end call sites that must move to RPC

All current chat workspace settings write paths must be unified.

#### Settings panel

[conversation-workspace-settings-panel.tsx](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx) should:

- load settings through the new RPC-backed hook
- stop optimistically writing browser-local settings
- save through `saveSettings(...)`

#### Permission-rule persistence card

[assistant-interaction-permission-card.tsx](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/components/assistant-interaction-permission-card.tsx) should:

- stop reading or writing browser-local workspace settings
- save approval rules through `saveSettings({ permissionRules }, { syncExistingSessions: true })`

#### Preferred model selection

[use-chat-workspace-pane-state.ts](e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts) should:

- stop reading browser-local workspace settings for preferred model selection
- stop writing browser-local workspace settings when model preference changes
- read preferred model values from the RPC-loaded workspace settings
- save preferred model values through `saveSettings({ selectedChannelId, selectedModelId }, { syncExistingSessions: false })`

### 8. New conversation session seeding

New conversation creation must no longer depend on the front end synchronously reading workspace settings.

Today, `buildConversationSessionDefaultMetadata(workspaceId)` uses browser-local state to compose default metadata before creating a session. That should be removed as a source-of-truth path.

The new behavior should be:

- the front end sends explicit session creation intent such as `workspaceId`, `title`, `selectedAgentId`, and any explicit metadata overrides
- Bun reads the workspace `.maomi` settings file during session creation
- Bun derives default session metadata from those workspace settings
- Bun merges explicit metadata from the request on top of the file-derived defaults

Merge rules:

- explicit request values win over workspace defaults
- workspace defaults only fill missing values
- `capabilityPreferences` is merged by key rather than replaced wholesale
- `approvalAutoEnabled` maps to `interactionGovernance.approvalMode`
- `contextCompressionThresholdPercent` maps to `conversationSettings.contextCompressionThresholdPercent`
- `selectedChannelId` and `selectedModelId` remain on root session metadata for compatibility with existing session consumers

This change ensures that even if the settings panel has not yet fully hydrated in the front end, new sessions still inherit the correct workspace defaults from `.maomi`.

### 9. Existing session sync behavior

Saving workspace settings and syncing existing sessions are related but not identical concerns. The design should keep them explicit.

`saveDesktopConversationWorkspaceSettings(..., syncExistingSessions)` should synchronize only session-relevant settings when requested.

Fields that should sync to existing sessions:

- `approvalAutoEnabled`
- `contextCompressionThresholdPercent`
- `managedExecutionEnabled`
- `thinkingEnabled`
- `permissionRules`
- `memoryEnabled`
- `sandboxEnabled`
- `feishuSmartAssistantEnabled`
- `capabilityPreferences`

Fields that should not rewrite historical session metadata:

- `defaultFilePreviewMode`
- `defaultTerminalShellKind`
- `selectedChannelId`
- `selectedModelId`

This keeps historical sessions stable while still allowing true default-setting behavior for future sessions.

### 10. No-workspace behavior

Because persistence is now workspace-owned, there is no persisted chat settings surface without a selected workspace.

Expected behavior:

- if no workspace is selected, the panel may render an empty state or a disabled settings surface
- no chat settings should be editable or saveable without a workspace
- there is no browser-local fallback settings store for this feature

### 11. Error handling

The settings service should distinguish four cases clearly:

- file missing
- file malformed
- file read failure
- file write failure

Rules:

- missing file returns defaults without an error
- malformed JSON returns defaults with warnings
- file read failure returns an error result to the front end and should not silently mutate state
- file write failure must not report a successful save
- concurrent saves should be serialized inside Bun to avoid lost updates

The front end should surface these states lightly:

- malformed file warning: use defaults and show a single non-blocking warning
- save failure: preserve current loaded state and show a save failure message

### 12. Local storage removal contract

After this design lands, chat workspace settings must no longer:

- read from `window.localStorage`
- write to `window.localStorage`
- use browser-local cached settings as a fallback source of truth

Old `localStorage` values are intentionally ignored. This design does not migrate them into `.maomi`.

### 13. Testing

Coverage should include at least the following areas.

#### Bun-side settings service tests

- returns defaults when `.maomi/chat/settings.json` does not exist
- defaults include enabled `memory.runtime`, enabled `mcp.runtime`, and enabled `skills.runtime`
- saves merged patches to the correct workspace file
- normalizes malformed fields
- returns warnings for malformed JSON
- serializes concurrent saves without losing fields

#### Session creation tests

- new sessions inherit workspace defaults from `.maomi`
- explicit request metadata overrides workspace defaults
- `approvalAutoEnabled` maps to `approvalMode`
- `selectedChannelId` and `selectedModelId` are injected from `.maomi` defaults when present

#### Existing session sync tests

- `syncExistingSessions: true` updates existing sessions for session-relevant settings
- `syncExistingSessions: false` does not rewrite historical sessions
- preferred model selection changes do not rewrite historical session metadata
- permission-rule saves update both the workspace file and existing sessions when sync is requested

#### Front-end hook and page tests

- the settings panel loads through RPC and not browser storage
- toggling settings does not touch `localStorage`
- preferred model selection saves through the new RPC
- no-workspace state is non-editable

### 14. Acceptance Criteria

- Chat workspace settings persist at `<workspaceRoot>/.maomi/chat/settings.json`.
- Chat workspace settings no longer read or write `localStorage`.
- New workspaces default to enabled `MCP 工具`, enabled `Skills`, and enabled `记忆`.
- Restarting the app restores the previously saved chat settings from `.maomi`.
- New conversation sessions inherit workspace defaults from the `.maomi` settings file.
- Approval-rule persistence and preferred model persistence use the same workspace-owned settings source.
- Existing session sync remains available and is explicitly controlled by the save request.
