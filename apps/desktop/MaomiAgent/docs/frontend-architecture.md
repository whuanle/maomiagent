# MaomiAgent Desktop Frontend Architecture

This document defines the renderer structure for `apps/desktop/MaomiAgent`. The goal is to keep the desktop shell stable while business pages are migrated module by module without regressing the shipped UI or blindly copying legacy host assumptions. The desktop app must stay self-contained: do not import renderer code, shared runtime helpers, or route entries from the legacy `app/` project.

## Layers

- `src/mainview/main.tsx`: renderer bootstrap only. It installs host bridges and then boots the desktop-native renderer root. It must not delegate to any legacy renderer entry.
- `src/mainview/App.tsx`: desktop shell composition target. It owns app-wide route, language, theme and menu preference state until those are promoted to dedicated stores. Every desktop route renders inside this shell; routes that are not migrated yet must stay as desktop-native placeholders instead of falling back to the legacy app.
- `src/mainview/components/window-shell`: shell-only components that are visible across routes, including the custom titlebar and route placeholders.
- `src/mainview/components/settings-page`: settings route components. Settings panels can manage shell preferences and future module preferences, but should not import module page internals.
- `src/mainview/lib`: renderer services and host adapters. Electrobun or browser APIs stay behind these adapters.
- `src/mainview/config`: static shell configuration such as route and titlebar menu definitions.
- `src/mainview/i18n`: translation dictionaries and lookup helpers.
- `src/mainview/theme` and `src/mainview/styles`: Ant Design tokens, theme stylesheet selection and semantic CSS.

## Module Migration Target

New business pages should be added under `src/mainview/modules/<module-name>` with this shape:

```text
src/mainview/modules/<module-name>/
  page.tsx
  components/
  hooks/
  services/
  types.ts
  index.ts
```

Rules:

- `page.tsx` is the route-level React entry for the module.
- `components/` contains presentational components owned by the module.
- `hooks/` contains module-local state and view-model hooks.
- `services/` contains renderer-side service adapters for that module. It may call shared host adapters from `src/mainview/lib`, but should not call Electrobun directly.
- `types.ts` contains module DTOs and local view models.
- `index.ts` exports only the public module page entry and route metadata needed by the shell.

## Coupling Rules

- Shell code can import module `index.ts`, but not module internals.
- Modules can import shared shell primitives from `components/system`, `i18n`, `theme`, and `lib` adapters.
- Modules should not import each other directly. Cross-module data should move through shared services or future runtime/application ports.
- Route configuration stays centralized in `config/titlebar.ts` until module route manifests are introduced.
- Host-specific APIs stay in `lib/*bridge*` or `lib/*window*`; UI components consume typed helpers instead.

## Migration Constraints

- Carry the shipped UI design into mainview. Preserve layout proportions, styling language, semantic class hooks, visual hierarchy, and interaction order unless the migration task explicitly includes a design change.
- Confirm the active renderer entry before touching business pages. `src/mainview/main.tsx` must remain desktop-native only; if a change reintroduces delegation to the legacy root, treat it as a regression.
- A page is only considered migrated when the new mainview route owns rendering with desktop-native code. Importing, mounting, or wrapping the legacy page or legacy app route inside mainview does not count as a completed migration.
- A page is only considered migrated when all four seams are wired together: Bun-side module or service, desktop RPC contract, Electrobun renderer bridge, and the active route render path.
- Do not move host communication into React page components. Replace transport inside typed adapters under `src/mainview/lib` or module `services/`; page components should keep consuming stable view-model shaped helpers.
- Replace transport, backend integration, and page processing logic behind the migrated page, not the visual contract. The new host path must preserve user-facing behavior and operational meaning unless a scoped product change is documented alongside the migration.
- Remove legacy sidecar assumptions from Electrobun paths. Do not keep hard-coded `127.0.0.1:4198`, `/__maomi/sidecar-info`, sidecar-only empty states, or copy that tells the user to reconnect a sidecar when the feature now depends on desktop bridge APIs.
- Do not import files from the legacy `app/` project into `apps/desktop/MaomiAgent`. If a feature is not migrated yet, render a desktop-native placeholder and track the missing capability explicitly.
- Keep backend capabilities honest. If the Bun host only exposes a subset of the old feature surface, document the gap and keep the route on the old path until the missing capability is intentionally cut or replaced.
- Treat visual fidelity and implementation migration as separate concerns. Rebuild the page as mainview-native code while carrying over the shipped design; do not use the legacy page shell as a shortcut.

## Feature-Specific Rules

- Logs migration should preserve the current toolbar, primary table skeleton, and styling hooks in a mainview-native page. The intended change is the data source swap from legacy HTTP or sidecar calls to the desktop logs bridge, not a page redesign or a legacy route wrapper.
- Workspace migration must follow directory, project, worktree, and session semantics instead of collapsing the feature into a local favorites list. Do not assume one server per workspace, and do not call the page migrated if only directory record CRUD exists or if the route still renders through the legacy workspace page.
- If a temporary workspace slice ships with reduced scope, mark it explicitly as an interim record-management slice and list the missing activation, restore, Git, or session behaviors in the same document or PR.

## Migration Review Checklist

- Verify that the desktop renderer does not import or delegate to legacy `app/` files.
- Verify that the migrated route is rendered by a mainview-native page instead of mounting or wrapping the legacy page.
- Verify that the Bun module surface, desktop RPC typing, window bridge exposure, and active route mount are all present for the feature.
- Compare the migrated page against the shipped page for layout, class names, copy tone, and primary interactions.
- Check that host-specific empty states and error messages mention the real host capability boundary instead of stale sidecar wording.
- For workspace-related work, verify that the feature still represents directory-to-project and session semantics rather than only local metadata rows.
- Run focused validation for the touched slice and record what it does not cover.

## Performance Rules

- Route panes should keep module state local and avoid app-wide state updates for keystrokes, table scrolling or streaming content.
- Heavy module widgets should use dynamic import at the module boundary when they are migrated.
- Long lists should use virtualization or paginated table data before being connected to real stores.
- Shared shell components must avoid subscribing to module-local state, so titlebar interactions stay responsive while pages stream or render large content.

## Current Transition Status

- The desktop shell provides titlebar navigation, theme selection, language switching, settings entry and Electrobun window controls.
- `src/mainview/main.tsx` now boots the desktop-native renderer root only. Desktop routes must stay inside `src/mainview` and must not fall back to legacy `app/` files.
- Routes that are not feature-complete yet still render inside the desktop shell as native placeholders. Treat those routes as unmigrated capability slices, not as permission to reattach the legacy renderer.
- The custom titlebar uses Electrobun drag-region classes and no-drag classes. Keep the absolute drag layer behind controls when editing it.