# Feishu Doc Tree Runtime Design

Date: 2026-05-21

## Goal

Rebuild the Feishu document tree experience around a backend runtime instead of a frontend-only stub flow. Users may paste either a Feishu wiki node token or a document token. The app should automatically identify the token, load the real Feishu tree, keep the tree usable while deeper levels load, persist useful cache across restart, and use cached data as a fallback when remote loading fails.

## Decisions

- Real Feishu data is the source of truth.
- Persistent cache is used for speed, restart recovery, and failure fallback.
- Manual load and refresh mean force-refresh from Feishu.
- If force-refresh fails, the previous usable tree stays visible.
- The tree loads progressively: first layer appears quickly, then child layers are filled in behind it.
- The frontend must not invent document content. If remote content and cache are both unavailable, it should show a clear failure state.

## Architecture

`DesktopFeishuDocRuntime` becomes the public backend boundary for Feishu document workspace operations. It exposes stable operations for token recognition, tree loading, tree refresh, document opening, and cache-aware content reads.

The runtime is split into focused units:

- `FeishuDocTreeRemoteSource`: calls real Feishu APIs, recognizes root tokens as `wiki_node` or `document`, reads node metadata, pages child nodes, and reads document content.
- `FeishuDocTreeCache`: persists root recognition results, child-node lists, loaded timestamps, partial/full load state, and last non-fatal failures.
- `FeishuDocTreeLoader`: owns loading policy. It chooses cache vs remote, starts background refresh, avoids duplicate in-flight loads, and emits branch updates as deeper nodes finish.

The React workbench keeps only UI state: the input token, visible tree nodes, expanded keys, selected document, loading flags, and small status messages. It no longer owns the cross-session tree cache.

## Loading Flow

When the user loads a token, the frontend calls a backend operation equivalent to `loadDocTreeRoot({ token, forceRefresh })`.

1. The backend normalizes the token.
2. If this is not a manual refresh and cache exists, the backend returns the cached tree immediately with `source: "cache"`, `stale: true`, and `refreshing: true`.
3. After returning cached data, the backend starts one background remote refresh. If it succeeds, it updates the cache and notifies the frontend with fresh tree data. If it fails, the cached tree remains visible.
4. If no cache exists, or if the user explicitly clicks load/refresh, the backend reads real Feishu data immediately.
5. The backend returns the first visible layer as soon as it is available.
6. The backend then loads child branches progressively with limited concurrency. Each completed branch is cached and sent to the frontend as an incremental update.
7. If the user expands a node while the background loader is still working, the runtime reuses the in-flight branch request or starts a focused branch load for that node.

Manual refresh always bypasses cache for remote reads, but it never clears the currently visible tree until a fresh remote result is ready.

## Token Recognition

The input token can represent either a wiki node or a document. The backend owns recognition.

Recognition order:

1. Try to read the token as a wiki node.
2. If that fails with a not-found or wrong-kind response, try to read it as a document.
3. If both fail, return an unrecognized-token error while preserving the user's input and current tree.

Successful recognition is cached as `token -> kind`. Normal reopen uses the cached kind. Manual refresh may revalidate the kind so moved or changed Feishu resources can recover.

## Data Contracts

Tree nodes are normalized before reaching the frontend:

```ts
type FeishuDocTreeNode = {
  id: string
  token: string
  kind: "wiki_node" | "document"
  title: string
  hasChild: boolean
  parentToken?: string
  objType?: "doc" | "docx" | "sheet" | "mindnote" | "bitable" | "file" | "slides"
  updatedAt?: string
}
```

Root loads return cache state explicitly:

```ts
type FeishuDocTreeLoadResult = {
  rootToken: string
  rootKind: "wiki_node" | "document"
  nodes: FeishuDocTreeNode[]
  source: "remote" | "cache"
  refreshing: boolean
  stale: boolean
  loadedAt?: string
  error?: string
}
```

Incremental branch updates carry a parent token and replacement child list. The frontend merges updates by node id/token and preserves expansion/selection where possible.

## Cache Model

The cache is persistent and belongs to the backend. It stores:

- Root token recognition results.
- Root-level node snapshots.
- Child-node snapshots keyed by root, auth scope, and parent token.
- Per-branch `loadedAt` timestamps.
- Whether a branch is complete or partial.
- The last recoverable failure for observability and small UI messages.

Cache keys include the Feishu account/app identity or docs MCP identity so different authorization scopes do not share tree data.

Failures never overwrite the last successful branch snapshot.

## Frontend Experience

The workbench starts directly at the token input, load button, and tree. On reopen, the saved token is restored and submitted automatically.

States stay minimal:

- `正在加载` while the first layer is not available.
- `已显示上次结果` when cached data is visible while a refresh is running or failed.
- `加载失败` when no tree can be shown.

The load button is a force-refresh action. It shows loading while the remote first layer is being requested. Existing tree nodes stay visible during refresh.

Tree nodes are clickable as soon as they appear. Opening a document reads real Feishu content first. If remote content fails but a local draft or content cache exists, the cached content is shown with a small status. If neither exists, the document pane shows failure instead of generating fabricated content.

## Error Handling

- Not authorized: skip loading and ask the user to complete Feishu authorization.
- Token cannot be recognized: keep input and current tree, show a small failure message.
- Remote root load fails with cache: show cached tree and mark it as last result.
- Remote root load fails without cache: show empty tree failure and preserve input.
- Branch load fails: mark only that branch as failed; the rest of the tree remains usable.
- Document content fails with cache or local draft: show cached/local content.
- Document content fails without cache: show a failure state.

## Testing

Backend unit tests cover:

- Wiki-node token recognition.
- Document-token recognition.
- Unrecognized token failure.
- Cache-first reopen.
- Manual force refresh bypassing cache.
- Remote failure preserving previous cache.
- Progressive branch loading and duplicate in-flight request reuse.
- Document content remote success, cached fallback, and no-cache failure.

Frontend tests cover:

- Restored token auto-loads after the workbench mounts.
- Cached tree appears immediately while refresh runs.
- Manual refresh keeps the old tree visible until fresh data arrives.
- Failed refresh does not clear visible nodes.
- Nodes can be opened before the full subtree has finished loading.

A smoke test should exercise save token, restart or remount, automatic restore, background refresh, branch expansion, and document open.

## Scope

In scope:

- Replace stub document tree behavior with real Feishu-backed runtime behavior.
- Move tree cache ownership from React component memory into backend persistence.
- Keep the current workbench layout shape: token input, load button, tree, and document pane.
- Preserve existing local draft safety rules for editing and push operations.

Out of scope:

- Redesigning the full Feishu page navigation.
- Adding folder-token support beyond wiki node and document token recognition.
- Bulk document sync or offline mirroring of an entire enterprise library.
- Changing OAuth setup beyond what is needed for the doc runtime to call Feishu.
