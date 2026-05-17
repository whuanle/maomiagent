# @maomiagent/module-sdk

Browser SDK for MaomiAgent application-layer modules.

This package wraps the iframe host bridge used by MaomiAgent modules so module authors do not need to hand-roll `window.postMessage` contracts.

## Scope

This SDK is for **MaomiAgent application modules** only.

It is not:

- OpenCode plugin SDK
- MCP SDK
- Skill SDK

## Usage

```ts
import { createMaomiModuleSdk } from "@maomiagent/module-sdk/web"

const sdk = createMaomiModuleSdk()

const context = await sdk.getContext()
const models = await sdk.host.models.list()

sdk.reportState({
  ready: true,
  title: context.navigation.title,
  badge: String(models.items.length),
  health: "ok",
})
```

## Current host methods

- `sdk.getContext()`
- `sdk.onContextChange(listener)`
- `sdk.reportState(state)`
- `sdk.module.fetch(path, init?)`
- `sdk.host.workspace.getActive()`
- `sdk.host.workspace.list()`
- `sdk.host.models.list()`
- `sdk.host.conversations.list()`
- `sdk.host.conversations.getContext()`
- `sdk.host.storage.get(key)`
- `sdk.host.storage.set(key, value)`
- `sdk.host.storage.remove(key)`
- `sdk.host.localSurfaces.list(input?)`
- `sdk.host.localSurfaces.open(input)`
- `sdk.host.localSurfaces.get({ surfaceId, workspaceId? })`
- `sdk.host.localSurfaces.getContent({ surfaceId, workspaceId? })`
- `sdk.host.localSurfaces.updateContent(input)`
- `sdk.host.localSurfaces.save(input)`
- `sdk.host.localSurfaces.reload({ surfaceId, workspaceId? })`
- `sdk.host.localSurfaces.close({ surfaceId, workspaceId? })`
- `sdk.host.tasks.list(input?)`
- `sdk.host.tasks.get({ taskId, workspaceId? })`
- `sdk.host.tasks.create(input)`
- `sdk.host.tasks.update(input)`
- `sdk.host.tasks.runNow({ taskId, workspaceId? })`
- `sdk.host.tasks.runManyNow({ taskIds, workspaceId? })`
- `sdk.host.tasks.pauseSchedule({ taskId, workspaceId? })`
- `sdk.host.tasks.pauseManySchedules({ taskIds, workspaceId? })`
- `sdk.host.tasks.resumeSchedule({ taskId, workspaceId? })`
- `sdk.host.tasks.resumeManySchedules({ taskIds, workspaceId? })`
- `sdk.host.navigation.openBuiltin(routeKey)`
- `sdk.host.navigation.openModule(moduleId)`
- `sdk.ui.notify({ tone, message })`

## Notes

- `@maomiagent/module-sdk/web` is browser-only.
- The module host owns permissions and enforces them server-side.
- Modules should treat all host data as projected, stable API data, not as internal MaomiAgent implementation state.
- MaomiAgent also mirrors this browser SDK at `/module-host/sdk/web.js` for iframe modules that want a zero-bundle host-served import.

## Server Helper

This package also exposes `@maomiagent/module-sdk/server` with a minimal helper:

```ts
import { defineMaomiModuleServer, json } from "@maomiagent/module-sdk/server"

export default defineMaomiModuleServer({
  async fetch(request, context) {
    return json({
      ok: true,
      moduleId: context.module.moduleId,
    })
  },
})
```

Inside module server handlers, `context.host.localSurfaces` and `context.host.tasks` are also available with the same permission checks as the browser bridge, including batch task run/pause/resume helpers for scheduled tasks.

Module servers can also expose MCP dynamically during lifecycle startup instead of hard-coding `mcpServers` in `maomi.module.json`:

```ts
import { defineMaomiModuleServer } from "@maomiagent/module-sdk/server"

export default defineMaomiModuleServer({
  async activate(context) {
    await context.host.mcp.replace([
      {
        name: "runtime_registered_tools",
        scope: "workspace",
        transport: "stdio",
        endpoint: "node",
        metadata: {
          args: ["${modulePath}/dist/mcp.js", "--workspace", "${workspaceId}"],
        },
      },
    ])
  },
})
```

Available module server MCP methods:

- `context.host.mcp.list()`
- `context.host.mcp.register(input)`
- `context.host.mcp.registerMany(inputs)`
- `context.host.mcp.replace(inputs)`
- `context.host.mcp.unregister({ name, scope? })`
- `context.host.mcp.clear()`
