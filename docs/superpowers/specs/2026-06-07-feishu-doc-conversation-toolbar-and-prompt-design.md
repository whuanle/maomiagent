# Feishu Doc Conversation Toolbar and Prompt Simplification Design

## 1. Context

The current Feishu docs workbench already supports:

- browsing a Feishu document tree
- checking multiple documents
- opening a new chat session with prefilled Feishu doc context
- attaching local preview tabs backed by cached Markdown files

The current experience still has four product problems:

1. The tree toolbar is dominated by a wide `添加到对话` button and does not scale well once multi-select becomes the main workflow.
2. Checking a parent document does not include its subtree by default, forcing users to manually check many children one by one.
3. Batch conversation entry is optimized for transport metadata instead of the user task, so the input box shows too much low-value context.
4. The chat handoff does not explicitly bind to the built-in `飞书文档助手` agent, so users can land in a session with the wrong agent identity.

This design focuses on the Feishu docs workbench in `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components` and the chat open pipeline in `apps/desktop/MaomiAgent/src/mainview/modules/chat`.

## 2. Problem Statement

The current implementation treats "add checked docs to conversation" as a secondary action on top of the tree. The user workflow is the opposite: they are usually selecting several related documents so AI can read them together and answer or draft against them together.

That means the product should optimize for:

- fast multi-document selection
- obvious subtree inclusion behavior
- one-click handoff into a single new conversation
- a minimal prompt that tells AI which files to read and which files to write
- a guaranteed switch to the dedicated Feishu doc writing agent

## 3. Goals

- Replace the tree action row with a compact icon-first toolbar suitable for batch document workflows.
- Make parent selection include child documents by default.
- Keep `仅当前` and `含子文档` available as explicit selection modes in the toolbar.
- Allow one click to send all selected documents into the same new conversation.
- Simplify each `<feishu_doc_context>` block to `title`, `original_markdown_path`, and `local_draft_path`.
- Add short, explicit operating rules under `注意：`.
- Ensure the conversation opened from this workflow uses the built-in `飞书文档助手` agent even if the user previously selected another agent.

## 4. Non-Goals

- Redesign the broader Feishu page layout outside the docs tree and workbench.
- Add a separate selected-doc side panel or dashboard-style summary area.
- Reintroduce Feishu doc token, root token, URL, update time, or runtime workflow metadata into the visible chat prompt.
- Change remote push behavior, document cache layout, or doc preview rendering.
- Support in-place agent switching for an already-open existing session in this rollout. The first rollout always opens a new session.

## 5. Approaches Considered

### Approach A: Keep the current selection model and only shorten the button

This approach would replace the text button with an icon and leave the rest of the tree logic mostly intact.

Pros:

- lowest code churn
- no changes to chat open flow

Cons:

- does not solve subtree selection friction
- does not improve bulk operations enough
- keeps the current prompt noise and wrong-agent risk

### Approach B: Introduce a compact tree toolbar and selection-mode-aware batch workflow

This approach upgrades the tree from "checked keys only" into "checked keys plus explicit selection mode", adds compact batch actions, simplifies prompt generation, and binds the new conversation to the Feishu doc agent.

Pros:

- directly matches the user workflow
- keeps the page within the existing "toolbar + main content" resource-management skeleton
- solves layout, interaction, and prompt problems together

Cons:

- requires moderate UI, state, and chat-open pipeline changes

### Approach C: Add a separate selected-doc review panel

This approach would keep the tree simpler and move selection management into an extra panel listing selected documents and subtree state.

Pros:

- selected results are very explicit

Cons:

- adds a persistent extra panel that conflicts with the workspace rules for resource-management pages
- makes a fast batch workflow feel heavier than necessary

## 6. Recommendation

Adopt Approach B.

It is the only option that fixes the actual user loop end to end:

- select related docs quickly
- include subtree content by default
- launch one new conversation for all selected docs
- use the correct built-in agent
- show only the file paths that matter

## 7. Proposed Design

### 7.1 Tree toolbar becomes compact and icon-first

Replace the current tree action row with a single compact toolbar aligned left-to-right. The toolbar should use icon buttons with tooltips and a small selection count label.

Recommended action order:

1. `加入对话`
2. `全选`
3. `全取消`
4. selection mode toggle: `仅当前`
5. selection mode toggle: `含子文档`
6. `补选子文档`
7. `取消子文档`
8. trailing secondary text such as `已选 8 篇`

Rules:

- `加入对话` uses a conversation icon only.
- The toolbar stays in one row and does not use `space-between`.
- Tooltip text carries the full action wording.
- `加入对话` is disabled when there is no active workspace context or no checked docs.
- The toolbar remains above the tree and does not introduce a new side panel or inspector.

### 7.2 Selection model becomes mode-aware

Add an explicit toolbar-level selection mode:

- `include_subtree`
- `current_only`

Default mode is `include_subtree`.

Selection behavior:

- When the user checks a node in `include_subtree` mode, the system checks the current node and all descendant document nodes.
- If descendants are not loaded yet, the workbench silently hydrates that branch first, then completes the selection.
- If hydration partially fails, the current node stays checked and the UI shows a lightweight warning that some child documents were not included.
- When the user checks a node in `current_only` mode, only the current node is added.
- Switching the mode does not retroactively rewrite the existing checked set.

Batch actions:

- `全选` selects all currently loaded nodes and may preload the current root subtree before finalizing if the root is known.
- `全取消` clears the checked set completely.
- `补选子文档` walks the currently checked parent nodes and fills in any missing descendants.
- `取消子文档` removes descendants while preserving the checked parent nodes themselves.

The checked-set source of truth remains key-based, but the workbench now needs subtree traversal helpers that can:

- collect descendant keys for a tree node
- preserve parent keys while removing descendants
- asynchronously hydrate missing branches before computing the final checked set

### 7.3 Batch handoff always creates one new Feishu-doc session

The Feishu docs entry point should always open one new chat session for the current checked set rather than prefill an arbitrary existing session.

Conversation rules:

- all selected documents are merged into one draft input
- all available preview tabs are attached in the same request
- the request sets `createSession: true`
- the request carries the preferred agent identity for `飞书文档助手`

To make this explicit, extend `ChatConversationOpenRequest` with a dedicated agent field for new-session creation. Recommended shape:

```ts
type ChatConversationOpenRequest = {
  workspaceId?: string;
  sessionId?: string;
  createSession?: boolean;
  draftText?: string;
  attachedTabs?: ChatAttachedTabRequest[];
  selectedAgentId?: string;
};
```

New-session behavior:

- when `createSession: true`, the conversation workspace creates the session with `selectedAgentId ?? selectedComposerAgentId`
- the Feishu docs workbench passes the built-in `飞书文档助手` agent id in this field
- this workflow always creates a new session, so the user does not need to manually switch the current composer agent first

This keeps the agent switch deterministic and avoids contaminating an existing unrelated conversation.

### 7.4 Prompt text becomes minimal and task-oriented

The draft text should keep a short empty area for the user task at the top, then render a minimal rule block, then render one simplified `<feishu_doc_context>` block per selected document.

Required notice lines:

- `本次任务请使用“飞书文档助手”智能体处理。`
- `先读取 original_markdown_path。`
- `如需修改、改写、整理或续写，只能写入 local_draft_path。`
- `不要直接修改 original_markdown_path。`
- `如果缺少 local_draft_path，按只读参考处理，并先告知用户。`
- `如果需要更多信息，请读取文档同目录的元数据文件。`

Each context block must only expose:

- `title`
- `original_markdown_path`
- `local_draft_path`

Removed fields:

- `doc_token`
- `resolved_document_id`
- `root_doc_token`
- `url`
- `updated_at`
- `create_target`
- `workflow`

Result example:

```text
---

注意：

本次任务请使用“飞书文档助手”智能体处理。
先读取 `original_markdown_path`。
如需修改、改写、整理或续写，只能写入 `local_draft_path`。
不要直接修改 `original_markdown_path`。
如果缺少 `local_draft_path`，按只读参考处理，并先告知用户。
如果需要更多信息，请读取文档同目录的元数据文件。

<feishu_doc_context>
title: 产品需求总览
original_markdown_path: .maomi/feishu-docs/prd/original.md
local_draft_path: .maomi/feishu-docs/prd/draft.md
</feishu_doc_context>

<feishu_doc_context>
title: 页面交互说明
original_markdown_path: .maomi/feishu-docs/interaction/original.md
local_draft_path: .maomi/feishu-docs/interaction/draft.md
</feishu_doc_context>
```

Prompt rules:

- if both paths exist, the AI reads original and writes draft
- if only `original_markdown_path` exists, the AI treats the document as read-only reference
- if no cache path is available, the handoff may still include the title, but the workbench should prefer not to include such documents unless necessary

### 7.5 Feedback and failure handling

The UI should stay minimal and operational:

- while subtree hydration runs for a selection action, the toolbar shows a lightweight busy state
- if some children fail to load, show a concise warning and keep the successful checked items
- if no workspace is active, disable `加入对话` and keep the current existing lightweight message path
- if a selected doc cannot provide preview paths, still allow the batch conversation open, but omit the preview tab for that document

The page must not introduce explanatory empty-state prose or system-internals wording.

## 8. File Impact

Primary files expected to change during implementation:

- `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css`
- `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-chat-draft.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-doc-chat-draft.test.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench-ir-loading.test.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/chat/types.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/chat/components/workspace-pane.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts`

Likely implementation additions:

- tree helper functions for subtree selection and deselection
- a constant import for the built-in Feishu doc agent id, or an equivalent mainview-safe bridge constant
- small translation updates for new toolbar tooltips and mode labels

## 9. Testing Strategy

### 9.1 Feishu workbench state and interaction tests

- checking a parent node in `include_subtree` mode includes descendants
- checking a parent node in `current_only` mode only includes the current node
- `补选子文档` fills in missing descendants
- `取消子文档` preserves parent checks and removes descendants
- partial hydration failure preserves successful checks and triggers warning feedback

### 9.2 Prompt builder tests

- single-doc draft contains the new notice rules
- batch draft renders multiple simplified context blocks
- removed metadata fields are absent from both single and batch drafts
- read-only cases without `local_draft_path` still render correctly

### 9.3 Chat handoff tests

- Feishu-doc conversation open requests include `selectedAgentId`
- new session creation honors the request agent override
- attached preview tabs still open alongside the created session

## 10. Risks and Mitigations

### Risk: subtree auto-selection feels surprising on very large trees

Mitigation:

- keep `仅当前` and `含子文档` visible in the toolbar at all times
- default to `含子文档`, but make the current mode explicit with pressed-state styling and tooltip text

### Risk: branch hydration makes checking feel slow

Mitigation:

- keep the action async but lightweight
- allow partial success
- show a concise busy or warning state instead of blocking the whole page

### Risk: agent override leaks into unrelated chat entry points

Mitigation:

- scope the new `selectedAgentId` request field to the generic chat-open request type
- only populate it from the Feishu docs handoff path in the first rollout
- continue using the user's current composer agent for all other entry points

## 11. Acceptance Criteria

- The Feishu docs tree uses a compact icon-first toolbar instead of the wide `添加到对话` button.
- The default selection mode is `含子文档`.
- Users can explicitly switch between `仅当前` and `含子文档` from the toolbar.
- One click opens a single new conversation containing all currently selected documents.
- That conversation is created with the built-in `飞书文档助手` agent.
- The generated draft text contains only the short rule block plus simplified `<feishu_doc_context>` entries.
- The visible document context no longer includes token, URL, root, timestamp, or workflow metadata.
