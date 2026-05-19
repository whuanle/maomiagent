# Desktop Browser Lightweight Hidden Recovery Design

Date: 2026-05-19
Status: Draft for review
Owner: Codex

## 1. Context

The current standalone desktop browser page in [apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx](apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx) is no longer shaped like a browser.

Its current behavior is a session-management shell:

- search field
- role and state filters
- address input used as a launch field
- open-primary and open-task actions
- a table of stored browser sessions

This is inconsistent with the intended product direction that was previously explored in:

- `docs/superpowers/specs/2026-05-16-desktop-browser-minimal-closure-design.md`
- `docs/superpowers/specs/2026-05-16-desktop-browser-lightweight-tabs-design.md`

Those prior designs describe the desktop browser as a lightweight browser surface with tabs, an address bar, and one visible browsing runtime, not as a background workbench or session-admin table.

The user confirmed two key facts for this recovery:

1. the target is the standalone AI browser page, not the chat-side browser consumer
2. after recovery, the browser should remain hidden from menu, chat sidebar, and route entry until the implementation is more complete

## 2. Problem Statement

We need to recover the standalone AI browser page back toward its intended lightweight browser shape.

This is not a broad feature expansion. It is a directional recovery:

- remove the current background/workbench/session-list mental model
- restore a browser-first mental model
- keep the recovered implementation hidden from product navigation for now

The recovery is considered successful when the standalone browser module behaves like a lightweight tabbed browser internally, even though it is not yet exposed as a public-facing page.

## 3. Goals

- Replace the current session-list page shape with a lightweight tabbed browser page.
- Use a single visible browser runtime plus lightweight tab metadata.
- Support basic browser interactions on the standalone page:
  - new tab
  - close tab
  - switch tab
  - address entry and navigation
  - back
  - forward
  - refresh
  - open current page in the system browser
  - screenshot of the current page to clipboard
- Keep the chat-side browser consumer out of scope for this pass.
- Remove menu, chat-sidebar, and route exposure after recovery so the page remains hidden.

## 4. Non-Goals

- No attempt to make the browser public-facing again in this pass.
- No repair of the chat-side browser consumer in this pass.
- No full browser fidelity such as preserving full per-tab history stacks, scroll position, or full in-memory DOM/runtime state.
- No background browser workbench, session-management dashboard, or task-oriented browser control surface.
- No broad automation, page inspection, or browser MCP expansion in this pass.

## 5. Approaches Considered

### Approach A: Continue patching the current session list page

Keep the current table-driven page and add browser interactions on top of it.

Pros:

- smaller apparent surface change
- lower immediate edit count in one file

Cons:

- preserves the wrong mental model
- mixes browser interactions into a resource/list page shape
- makes later cleanup harder because the page is fundamentally not a browser shell

### Approach B: Rebuild the standalone page as a lightweight tabbed browser and hide all entry points

Replace the current standalone page with a browser-first shell while immediately removing menu, chat-sidebar, and route exposure.

Pros:

- matches the intended product direction
- restores the right interaction model instead of layering more patches on the wrong one
- lets the team recover the implementation without prematurely exposing it

Cons:

- larger change than simply editing the table page
- requires both page reconstruction and entry cleanup

### Approach C: Replay older browser/workbench code directly from the historical architecture

Try to pull older browser code patterns straight from the pre-current architecture and map them onto the current desktop codebase.

Pros:

- closest to historical evidence
- may recover details that no longer exist in the current module

Cons:

- architecture mismatch is too large
- high risk of importing old assumptions and broken ownership boundaries into the current desktop module layout

## 6. Recommendation

Choose Approach B.

This pass must recover the correct browser interaction model, not prolong the current session-management shell. Rebuilding the standalone page into a lightweight tabbed browser, then hiding all entry points, is the smallest change that still moves the module back onto the intended track.

## 7. Proposed Design

### 7.1 Scope of the recovered page

The standalone browser page becomes a browser shell again.

It should render:

- a tab strip
- a browser toolbar on the same visual plane
- a single visible browser surface
- a minimal empty state for tabs that do not yet have an address

It should no longer render:

- session search
- role filter
- state filter
- session table
- open-primary action
- open-task action
- background session-management concepts as the main page experience

### 7.2 Interaction model

The recovered standalone page supports these direct interactions:

1. create tab
2. close tab
3. switch tab
4. type an address
5. confirm navigation
6. back
7. forward
8. refresh
9. open current confirmed URL in the system browser
10. capture the current page to clipboard

The page should feel like a small built-in browser, not a task workbench.

### 7.3 Tab model

Each tab stores only lightweight metadata:

- `tabId`
- `title`
- `address`
- `status`
- `createdAt`
- `updatedAt`

Rules:

- new tabs are appended in creation order
- tab order remains stable unless the user closes a tab
- new tabs start with an empty address
- `about:blank` must not be shown to the user as the visible address or title
- if no page title exists yet, the tab falls back to address, then a default browser label

### 7.4 Draft input vs confirmed URL

The browser page must separate draft input state from confirmed tab URL state.

The page keeps:

- `addressDraft` for what the user is currently typing
- `activeTab.address` for the last confirmed URL of the active tab

Rules:

- typing changes only the draft
- pressing Enter or the explicit navigate action normalizes and navigates the draft
- only successful confirmed navigation updates the tab's saved `address`
- the address field must never be replaced by non-URL payloads such as debug output, screenshot responses, or backend metadata blobs

This separation is required because earlier browser designs explicitly identified address pollution as a real failure mode.

### 7.5 Browser runtime ownership

The standalone browser page owns visible browsing state.

Frontend-owned responsibilities:

- active tab selection
- tab order
- tab metadata updates after visible navigation
- address draft state
- visible back/forward availability
- open/refresh/screenshot loading flags
- empty-address tab behavior

Backend-owned responsibilities:

- lightweight tab/session persistence
- screenshot capture and clipboard write
- open-current-URL in the system browser

The backend must not become the primary controller for:

- open URL
- back
- forward
- refresh
- active tab switching

### 7.6 Single visible browser surface

The recovered module uses one visible browser runtime plus many lightweight tabs.

Behavior:

- switching tabs loads the selected tab's current saved URL into the single visible browser surface
- if the selected tab has no confirmed URL, the browser surface stays blank and idle
- complex runtime continuity between tabs is intentionally out of scope

This avoids the multi-surface background model that previously led to stale or browser-workbench-like behavior.

### 7.7 Toolbar actions

The toolbar must be browser-first.

Expected actions:

- back
- forward
- refresh
- address field
- navigate trigger
- open in external browser
- screenshot
- new tab

Action rules:

- back and forward affect only the current visible page
- refresh reloads only the current visible page
- external-browser open uses only the current tab's confirmed URL
- screenshot targets only the current visible page
- loading is action-scoped, not global for the whole toolbar

### 7.8 Hidden entry strategy

After the implementation is recovered, it should remain hidden.

The pass must remove or disable:

- titlebar/menu exposure of the browser module
- browser entry points from the AI conversation sidebar or attached browser affordances
- direct route/page mounting from normal app navigation

The page module and its supporting implementation remain in the codebase.

This is a hide-not-delete strategy:

- the implementation survives for continued repair
- normal users do not encounter a partially completed browser module
- later re-exposure can happen without re-recovering the browser page again

### 7.9 Chat-side scope boundary

The chat-side browser consumer stays out of scope.

This pass may remove or disable chat-side entry points so they do not expose the hidden browser page, but it must not attempt to redesign or recover chat-side embedded browser behavior.

### 7.10 Failure handling

The page should degrade locally rather than collapsing into a workbench-like fallback.

Rules:

- if navigation fails, clear only the navigation action state and keep the current tab model intact
- if persistence fails, keep the visible page usable and report persistence as secondary
- if external-browser open fails, do not affect the active tab
- if screenshot fails, do not block navigation or tab switching
- hidden entry removal must not break unrelated titlebar/menu behavior

## 8. Affected Areas

The concrete implementation is expected to involve at least these areas:

- [apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx](apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx)
- [apps/desktop/MaomiAgent/src/mainview/modules/browser/page.css](apps/desktop/MaomiAgent/src/mainview/modules/browser/page.css)
- [apps/desktop/MaomiAgent/src/mainview/App.tsx](apps/desktop/MaomiAgent/src/mainview/App.tsx)
- titlebar/menu configuration and menu item exposure
- any remaining chat-side browser entry points that surface the standalone page

If browser bridge or backend helper code is needed, changes must preserve the ownership boundary described above.

## 9. Testing and Validation

The recovery is considered complete only when all of the following are true:

1. The standalone browser page code is browser-shaped, not table/workbench-shaped.
2. New tabs start with an empty visible address, not `about:blank`.
3. Typing and confirming a URL navigates the current tab and stores only the confirmed URL.
4. Switching tabs does not reuse the old session-table behavior.
5. Back, forward, and refresh act on the current visible page only.
6. External-browser open uses the current confirmed URL only.
7. Screenshot remains scoped to the current page and does not block navigation.
8. Menu entry is hidden.
9. AI conversation sidebar exposure is hidden.
10. The standalone page is not reachable through normal app routing/navigation.

Validation should include:

- `bun run typecheck`
- focused browser page tests if added in this pass
- a manual smoke check of tab creation, address entry, navigation, switching, and hidden-entry behavior

## 10. Success Criteria

This pass succeeds when the browser implementation is back on the intended lightweight-tabs path, but product exposure is still intentionally disabled.

The success condition is not public launch. The success condition is:

- the implementation direction is corrected
- the background/workbench shell is removed
- the page can continue evolving privately without confusing users
