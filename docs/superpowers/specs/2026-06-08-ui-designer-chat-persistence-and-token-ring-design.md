# 2026-06-08 UI Designer Chat Persistence And Token Ring Design

## Background

The UI Designer module currently loses the active chat workspace after the user leaves the module and returns from another menu. The user must reselect the workspace and sometimes re-enter the desired conversation, which breaks continuity.

The chat conversation surface also has two compact layout issues:

- The right-side scrollbar in the conversation thread is visually too wide and sits too far away from the content edge.
- The bottom token usage ring adds the threshold label as a second line outside the ring, which makes the small circular indicator look unstable and misaligned.

## Goals

- Restore the previously active workspace tab when the user returns to the module.
- Restore the previously selected conversation for that workspace when the session still exists.
- Tighten the conversation thread scrollbar so it looks lighter and closer to the edge.
- Keep the token usage ring visually stable without the extra threshold line breaking the layout.

## Non-Goals

- No new global store or new persistence mechanism.
- No redesign of the chat layout, rail, or workspace shell.
- No change to token budget calculation or compaction rules.

## Design

### 1. Workspace And Session Restoration

Reuse the existing `workspace-experience-state` chat scene as the source of truth.

The chat page already persists:

- `chat.activeWorkspaceId`
- `chat.openWorkspaceIds`
- `chat.workspaceSessions[workspaceId].selectedSessionId`

The fix will tighten the restore path so the page consistently prefers the persisted active workspace when the module remounts, then lets each workspace pane restore its own preferred conversation from the stored `selectedSessionId`.

Implementation direction:

- Keep `chat-workspace-shell-state.ts` as the persistence boundary for open and active workspaces.
- Update the chat page and related workspace restore flow so the persisted active workspace is not lost or overwritten by a transient fallback during module re-entry.
- Keep session restoration inside `use-chat-workspace-pane-state.ts`, where `reloadSessions` already resolves the preferred session from stored workspace experience state.

Expected result:

- Leaving the module and returning should reopen the same workspace tab.
- If the stored conversation still exists in that workspace, it should be reselected automatically.

### 2. Conversation Scrollbar Tightening

Adjust only the direct conversation scroll container styling instead of changing all chat scrollbars.

Implementation direction:

- Reduce the thread scrollbar width on `.chat-direct-thread-scroll`.
- Reduce the thread container right padding or related spacing so the scrollbar sits visually closer to the edge.
- Keep sidebar and inspector scrollbar styling unchanged unless shared selectors force a minimal follow-up tweak.

Expected result:

- The thread scrollbar appears thinner than it does today.
- The gap between the scrollbar and the right edge becomes smaller without clipping message content.

### 3. Token Usage Ring Cleanup

The threshold label such as `T80` should stop competing with the percentage value inside the circular ring.

Implementation direction:

- Keep the percentage as the primary visible text inside the ring.
- Remove the extra threshold line from the compact ring layout.
- Preserve threshold information in tooltip or accessible label so the information still exists without disturbing the layout.

Expected result:

- The token usage ring stays compact and centered.
- The user still has access to threshold information through hover title and aria text.

## Error Handling

- If the persisted workspace no longer exists, fall back to the first valid workspace using the existing reconciliation path.
- If the persisted session no longer exists, fall back to the current session selection resolver.
- Styling changes must degrade safely when the token usage indicator or conversation thread is absent.

## Testing

- Add or update regression coverage for chat workspace restoration so persisted active workspace and preferred session are preserved across remount-like flows.
- Add or update regression coverage for the compact token ring rendering so the threshold label no longer appears as a separate visible line.
- Run targeted chat module tests covering the touched state and rendering paths.
