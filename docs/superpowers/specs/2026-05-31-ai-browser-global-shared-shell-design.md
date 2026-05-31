# AI Browser Global Shared Shell Design

Date: 2026-05-31
Status: Draft for review
Owner: Codex

## Context

The current AI browser page in [apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx](/e:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx) is still shaped like a resource-management page:

- toolbar with search and filters
- address launch field
- open actions
- session table

That structure does not match the intended product direction. The user explicitly wants the AI browser module to be a real browser, not a backend panel.

The target reference is a browser-first shell with:

- tab strip
- navigation controls
- address bar
- large visible page area
- lightweight tool actions around the current page

The user also added an important cross-surface requirement:

1. the standalone `AI 浏览器` page and the chat-side browser sidebar must show the same browser
2. data and visible state must stay identical between both entry points
3. an action in one place must update the other place immediately

This means the browser cannot be modeled as two separate page-local UIs. It must become one global browser capability with two synchronized shells.

## Problem Statement

We need to redesign the AI browser from a session-management view into a browser-first product surface while also supporting a mirrored chat-sidebar view.

The key product correction is not only visual. It requires a different ownership model:

- the browser is global, not workspace-scoped
- the active tab is global and unique
- the standalone page and the chat sidebar are only two views over one shared browser state

If we keep page-local state or separate implementations for the two entry points, they will drift and fail the “one place changes, the other place changes too” requirement.

## Goals

- Replace the current browser page with a real tabbed browser shell.
- Make the AI browser global and not scoped to any workspace.
- Define one shared browser state used by both:
  - the standalone `AI 浏览器` route
  - the chat-side browser sidebar
- Ensure both entry points always show the same:
  - tab list
  - active tab
  - address
  - loading state
  - tool state
  - tool results
- Keep the main browser experience focused on browsing, not on resource tables or background session management.
- Provide three first-phase browser tools around the current page:
  - content extraction with useful-content filtering
  - screenshot
  - simple visual interaction

## Non-Goals

- No workspace-specific browser instances.
- No independent state per entry point.
- No dashboard, overview cards, stats cards, or explanatory landing content.
- No attempt to replace Playwright or match its full automation coverage.
- No advanced browser-profile management, multi-tenant isolation, or complex automation planning in phase one.
- No table-first browser history or session-admin experience as the main surface.

## Approaches Considered

### Approach A: Rebuild only the standalone browser page

Treat the `AI 浏览器` route as a proper browser, but keep the chat sidebar as a later or separate concern.

Pros:

- smallest short-term scope
- fastest visible page correction

Cons:

- fails the mirrored-state requirement
- guarantees future duplication when the sidebar browser is added
- pushes the hardest product requirement out of the design

### Approach B: Global browser controller and store with two shell views

Create one global browser domain with a shared controller and shared state store. The standalone browser page and chat sidebar each render that same domain through different shells.

Pros:

- directly satisfies the user requirement
- keeps product meaning clear
- creates a stable base for future browser tools
- avoids synchronization drift between entry points

Cons:

- requires more up-front design than a page-only rewrite
- introduces a new shared state layer

### Approach C: Two separate UIs with event synchronization

Keep separate page and sidebar implementations and synchronize actions through an event bus or ad hoc message passing.

Pros:

- can look simpler at first glance
- allows each surface to evolve independently

Cons:

- high drift risk
- duplicated browser semantics
- harder to reason about active tab, tool state, and recovery

## Recommendation

Choose Approach B.

The browser is now a product capability, not a page-local widget. Once the user required a single shared browser visible from both the standalone route and the chat sidebar, the correct architecture became one global browser domain with two rendering shells.

This is the smallest design that correctly matches the intended behavior:

- one browser
- one tab model
- one active tab
- one set of tool results
- two synchronized views

## Proposed Design

### 1. Product model

The AI browser becomes a global singleton browser capability.

It is not attached to any workspace, session table, or task bucket. It always represents one globally shared active browser instance with multiple tabs.

The product surfaces are:

- `AI 浏览器` standalone page
- chat-side browser sidebar

Those surfaces are not separate browser instances. They are alternate shells over the same browser state.

### 2. Information architecture

The standalone browser page becomes a browser-first surface with four layers:

1. tab strip
2. navigation bar
3. main web view
4. right-side tool panel

The page opens directly into that structure with no dashboard, overview cards, session list, or explanatory copy.

The chat-side browser sidebar uses the same semantic structure in compressed form:

1. tab strip
2. navigation bar
3. main web view
4. tool access and current tool output

The sidebar is narrower, but it still represents the same active browser and follows the same interaction rules.

### 3. Shared browser state

Introduce a shared browser state model owned outside both shells.

Minimum state shape:

- `tabs`
  - `id`
  - `title`
  - `url`
  - `draftUrl`
  - `loading`
  - `canGoBack`
  - `canGoForward`
  - `faviconUrl?`
  - `lastExtractResult?`
  - `lastScreenshotResult?`
  - `lastInteractionResult?`
- `activeTabId`
- `toolPanel`
  - closed
  - extract
  - screenshot
  - interact
- `toolRuntime`
  - current action state
  - current error state
  - last successful action timestamp
- `uiState`
  - standalone tool panel width
  - standalone tool panel open or closed state
  - chat sidebar browser visibility state

Rules:

- there is exactly one global tab collection
- there is exactly one global active tab
- both shells always render the same active tab
- tool results belong to tabs, not to shells
- closing one shell never clears browser state

### 4. Controller responsibilities

Introduce a `BrowserController` as the action boundary for browser behavior.

The controller owns actions such as:

- create tab
- close tab
- activate tab
- update draft URL
- navigate active tab
- go back
- go forward
- refresh
- extract current page content
- capture screenshot
- perform simple visual interaction

The controller writes normalized results back into the shared browser store.

The page shell and sidebar shell must not implement separate browser behavior. They only dispatch controller actions and subscribe to store updates.

### 5. Standalone page shell

The standalone `AI 浏览器` page must feel like a browser first.

#### 5.1 Tab strip

The tab strip supports:

- create tab
- close tab
- switch tab

Display rules:

- active tab is visually emphasized
- inactive tabs are lighter
- title comes from page title when available
- fallback title comes from normalized URL, then a browser default label
- loading is shown with a minimal state indicator

#### 5.2 Navigation bar

The navigation bar includes:

- back
- forward
- refresh
- address bar
- tool entry actions

Behavior rules:

- address bar shows the active tab draft while editing
- confirming navigation normalizes and commits the draft URL
- both shells reflect the same draft and confirmed URL state
- a new tab focuses the address field and starts empty

#### 5.3 Main web view

The web view takes the remaining height and remains the visual center of the page.

It must not be visually displaced by tables, side summaries, or resource cards.

#### 5.4 Right-side tool panel

The right panel is the current-tab tool area, not a permanent resource dashboard.

It is closed by default and opens when the user selects one of the browser tools.

It supports three panels:

- extract content
- screenshot
- visual interaction

### 6. Chat sidebar shell

The chat-side browser sidebar is a compressed rendering shell for the same browser.

It keeps the same interaction model, but adapts the layout for narrower width.

Behavior rules:

- tab operations update the global browser state
- navigation updates the global browser state
- tool actions update the global browser state
- the visible page content is always the same active tab as the standalone browser
- opening or closing the sidebar never destroys the browser session

The sidebar may use a tighter layout, but it must not invent a different browsing model such as independent current tab or independent tool context.

### 7. Tool scope

The AI browser tool area focuses only on the current active tab.

#### 7.1 Content extraction

Phase-one extraction returns structured useful content from the current page:

- title
- final URL
- cleaned main text
- optional useful links summary
- filtered content intended to remove obvious layout noise when feasible

This tool is not a general knowledge organizer in phase one. Its goal is reliable page-content capture with practical filtering.

#### 7.2 Screenshot

Phase-one screenshot supports:

- visible viewport screenshot
- optional full-page screenshot if implementation cost remains reasonable

Screenshot results are stored on the current tab context and become visible from both shells immediately.

#### 7.3 Visual interaction

Phase-one visual interaction is intentionally simple and does not compete with Playwright.

Supported actions:

- click
- type
- scroll
- wait

Failure output should stay action-oriented rather than diagnostic-heavy. Example:

- element not found
- page still loading
- action timed out

### 8. State and synchronization rules

Synchronization rules are strict:

1. creating, closing, or switching tabs in one shell updates the other shell immediately
2. navigating in one shell updates the other shell immediately
3. tool panel selection is shared when it represents the current active browser context
4. extract, screenshot, and interaction results are shared because they belong to the tab
5. hiding one shell does not reset tabs, tool results, or active page state

There is no per-shell current tab, no per-shell independent tool mode, and no per-workspace browser partition.

### 9. Empty, loading, and error states

All user-facing copy should stay minimal and task-focused.

#### 9.1 Empty tab

Show only the minimum entry state:

- address input ready
- simple prompt such as `输入 URL 打开页面`

#### 9.2 Loading

Use minimal state copy only:

- `正在加载`

#### 9.3 Tool loading

Tool panels use only current-action status:

- extracting
- capturing
- interacting

No internal architecture or mechanism explanation is shown to the user.

#### 9.4 Page errors

If a page fails to load, the web view should offer only direct next steps:

- retry
- copy URL
- edit URL

#### 9.5 Tool errors

Tool failures stay inside the tool area and do not take over the whole browser shell.

Examples:

- extraction failed with retry
- screenshot failed with retry
- interaction failed with brief reason and retry

### 10. Persistence and recovery

The browser is global, so persisted state should also be global instead of workspace-scoped.

Phase-one persistence should cover:

- open tabs
- active tab
- last confirmed URL per tab
- minimal recoverable tab metadata
- last tool results when practical

It should not depend on the active workspace selection used elsewhere in chat.

Recovery rules:

- reopening the standalone page restores the same global browser state
- reopening the chat sidebar restores the same global browser state
- neither surface becomes the owner of recovery logic alone

### 11. Implementation boundaries

The implementation should be split into a dedicated browser module component tree rather than one page file.

Preferred high-level structure:

- `src/mainview/modules/browser/components/`
  - browser shells
  - tab strip
  - navigation bar
  - tool panel
  - empty and error states
- shared browser store files
- browser controller files
- optional bridge/runtime adapter files

This keeps page chrome, browser state, and tool rendering separated and supports later reuse in the chat sidebar.

### 12. Testing and acceptance

The design is complete when the following behaviors are true.

#### 12.1 Page shape

- entering `AI 浏览器` opens directly into a browser shell
- there is no session table, workspace filter, overview card, or backend-panel framing

#### 12.2 Shared state

- creating a tab in the standalone page appears immediately in the chat sidebar
- switching tabs in the sidebar changes the standalone page immediately
- navigating from either shell updates the same active tab URL and page view

#### 12.3 Tool sharing

- extraction started in one shell appears in the other shell
- screenshot results triggered in one shell are visible in the other shell
- visual interaction state and results are shared between shells

#### 12.4 Global ownership

- changing workspace elsewhere in the app does not create a different browser instance
- closing one shell does not clear browser state

#### 12.5 Scope discipline

- the browser tools work without introducing Playwright-level dependency expectations
- the browser remains focused on page browsing plus lightweight tool actions

## Risks and Mitigations

### Risk 1: Two shells drift into separate semantics

Mitigation:

- centralize actions in `BrowserController`
- centralize state in one browser store
- keep shells stateless beyond layout concerns

### Risk 2: Tool panel grows into a backend dashboard

Mitigation:

- keep tool UI anchored to the current tab
- avoid history tables and workspace management framing
- keep empty and loading copy minimal

### Risk 3: Browser state becomes accidentally workspace-scoped

Mitigation:

- use browser-specific global persistence keys
- do not route browser recovery through workspace restore helpers

### Risk 4: Phase-one scope expands toward Playwright replacement

Mitigation:

- limit interaction support to click, type, scroll, and wait
- keep advanced automation out of scope

## Open Questions Resolved In This Design

- Should the browser be a real browser instead of a backend panel?
  - Yes.
- Should it use multiple tabs?
  - Yes.
- Should the tool panel live on the right side?
  - Yes, for the standalone shell.
- Should the chat sidebar and standalone page show the same browser?
  - Yes.
- Should they share one global active browser state?
  - Yes.
