# Browser Shell Redesign Design

## Summary

Redesign the desktop browser module to closely match the provided Codex-style browser screenshot. The current page reads like a workbench shell with a centered card, oversized controls, strong borders, and a tool-heavy layout. The new design should feel like a lightweight native browser surface: thin top chrome, low-contrast gray palette, full-bleed blank canvas, and a minimal centered empty state.

This redesign is intentionally presentation-first. Existing browser tab, navigation, extract, screenshot, and interaction logic should remain intact unless a visual requirement makes a small structural adjustment necessary.

## Goals

1. Make the browser page visually resemble the provided Codex reference as closely as practical inside the existing app shell.
2. Remove the current card-like empty state and replace it with a full-canvas browser blank page.
3. Reduce Ant Design visual weight so the browser feels like a native shell rather than a dashboard.
4. Keep current browser behaviors and store/controller data flow stable while changing the UI presentation.
5. Use EasyTouch-assisted screenshot comparison during implementation to iteratively tune spacing and proportions.

## Non-Goals

1. Rebuilding browser state management, controller protocols, or provider wiring.
2. Adding new browsing capabilities.
3. Designing a richer browser home page with shortcuts, recommendations, or onboarding content.
4. Perfect pixel-for-pixel cloning when constrained by the host app shell or existing control set.

## Reference Constraints

The provided screenshot defines the target visual language:

1. Very thin top chrome.
2. A compact left-aligned active tab labeled like `新建页卡` / `新建标签页`.
3. A separate small `+` affordance.
4. A second thin toolbar row with back, forward, refresh, and a long subtle address field.
5. A flat, low-contrast gray browser canvas.
6. A centered empty state composed of icon, title, and one short helper line only.

The redesign should optimize for these proportions and relationships rather than preserving the current browser module styling.

## User Experience

### Empty State

When no tab is active, the page should look like a normal blank browser window rather than a product empty state. The main canvas remains visible and fills the available area. The center content is minimal:

1. A muted globe-style icon.
2. A single title such as `开始浏览`.
3. A short helper line such as `输入 URL 以打开页面`.

There should be no card container, no elevated panel, no CTA button in the middle of the page, and no explanatory product copy.

### Tab Strip

The tab strip becomes much lighter and thinner:

1. Tabs render as compact inline items, not pill cards.
2. The active tab uses a subtle filled or tinted state close to the reference.
3. Tabs no longer show a second URL line in the strip.
4. The close affordance remains available but visually quiet.
5. The create-tab action becomes a small standalone `+` button rather than a large labeled button.

### Toolbar

The toolbar should visually read as a browser chrome row:

1. Back, forward, and refresh are lightweight icon buttons on the left.
2. The address field occupies the visual center and most of the width.
3. The address field placeholder becomes `输入 URL`.
4. Extract, screenshot, and interact remain available but are visually downgraded to quiet utility actions on the right.
5. Control height, border radius, border contrast, and spacing all shift toward a thin native look.

### Content Surface

The current inner card language is removed:

1. The browser surface fills the content area edge to edge.
2. The default background becomes a consistent soft gray.
3. Empty and loaded states share the same browser-canvas visual language.
4. When screenshots or extracted content exist, they can still appear, but the containing frame should remain restrained and browser-like rather than card-like.

## Component Design

### `BrowserShell`

`BrowserShell` remains the top-level composition component. It continues to orchestrate:

1. `BrowserTabStrip`
2. `BrowserToolbar`
3. `BrowserWebviewSurface`
4. `BrowserToolPanel`

The state flow through the browser domain store and controller stays unchanged. This redesign should not turn `BrowserShell` into a new domain layer.

### `BrowserTabStrip`

`BrowserTabStrip` is restyled and slightly simplified:

1. Remove the stacked title + URL presentation inside each tab.
2. Prefer a single-line tab label.
3. Keep loading and close indicators, but scale them down visually.
4. Convert the current prominent `新建标签页` button into a small add affordance aligned with the reference layout.

If multiple tabs exist, horizontal scrolling remains acceptable, but visual styling should still feel flat and quiet.

### `BrowserToolbar`

`BrowserToolbar` keeps current behaviors but changes presentation:

1. Keep the same navigation callbacks and keyboard handling.
2. Restyle icon buttons to be smaller, flatter, and lower contrast.
3. Make the address field the dominant control in width, but not in visual weight.
4. Preserve extract, screenshot, and interact actions with reduced prominence.

If necessary, text labels for the right-side tool actions may be hidden in favor of icon-first presentation, as long as discoverability remains acceptable and tests are updated accordingly.

### `BrowserWebviewSurface`

`BrowserWebviewSurface` is the largest structural change:

1. The no-tab state becomes a full browser blank page canvas.
2. The current centered card container is removed entirely.
3. The visual language for a tab with no screenshot should align with the same blank-canvas style, not a placeholder card.
4. Existing screenshot rendering and extracted text overlays may remain, but they should sit inside a flatter browser frame.

This component is responsible for making the page feel like the reference rather than a workbench surface.

### `page.css`

`page.css` becomes the main implementation surface for the redesign:

1. Reduce shell gaps and outer padding where they conflict with the reference.
2. Flatten borders, shadows, and corner radii across browser-specific classes.
3. Rebuild top chrome spacing and empty-state positioning.
4. Keep responsive behavior functional on smaller widths without reintroducing bulky components.

## Visual Tokens and Styling Rules

The redesign should bias toward these visual rules:

1. Low-contrast gray-on-gray palette.
2. Minimal shadows; prefer flat surfaces.
3. Smaller radii than the current design.
4. Thin separators instead of card borders.
5. Quiet iconography and subdued placeholder text.
6. Large empty canvas with the center state positioned slightly above dead center if that better matches the reference.

The browser module should still respect app theme variables where possible, but may introduce browser-specific class styling to better match the reference proportions.

## Data Flow and Behavior

No primary data-flow redesign is needed.

1. Browser store, provider, and controller remain the source of truth.
2. Tab creation, activation, closing, navigation, refresh, extraction, screenshot, and interaction callbacks continue to work as they do now.
3. Any DOM structure changes must preserve accessibility labels and keyboard navigation where already supported.

This is a UI-shell redesign, not a logic rewrite.

## Error Handling

Error behavior remains the same:

1. Snapshot load failures continue to surface through toast messages.
2. Action failures continue to use the current failure normalization path.
3. The empty canvas must still render cleanly even when no tab exists or an action cannot run.

No extra inline warning panels should be introduced into the main browser canvas.

## Testing

Implementation should update browser UI tests to reflect the new structure and wording.

At minimum, cover:

1. Empty state renders without the old card CTA pattern.
2. Tab strip still exposes tab activation and tab creation affordances.
3. Toolbar navigation and address input remain operational.
4. Browser tool actions still render and invoke the expected handlers.
5. Any changed copy such as `输入 URL` is reflected in tests if assertions depend on visible text.

## EasyTouch Verification

Implementation should use EasyTouch during visual tuning:

1. Capture the browser module after each major styling pass.
2. Compare the captured result against the supplied reference image.
3. Tune top-bar height, left padding, tab size, address bar width, and center empty-state placement iteratively.

EasyTouch is for implementation-time visual calibration, not for changing runtime behavior.

## Risks

1. Existing tests may assert on the current tab text layout or button labeling and will need targeted updates.
2. Over-flattening controls could hurt discoverability for extract, screenshot, and interact actions if they become too visually weak.
3. The host application shell may prevent exact 1:1 replication of the reference screenshot, especially around outer margins and title-bar interactions.
4. The current browser tool panel still reflects a utility-oriented workflow and may feel visually mismatched until it receives a follow-up polish pass.

## Recommended Implementation Shape

Implement in one focused UI pass:

1. Restyle `BrowserTabStrip`.
2. Restyle `BrowserToolbar`.
3. Rebuild the empty and placeholder structure in `BrowserWebviewSurface`.
4. Rework `page.css` to support the new chrome and canvas proportions.
5. Update browser tests to match the new UI contract.
6. Use EasyTouch screenshots to fine-tune the final layout.

This keeps the redesign scoped, testable, and visually aligned with the approved reference.
