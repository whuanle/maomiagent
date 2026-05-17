# DI Container And Module Loader

This directory contains the standalone DI subsystem for the MaomiAgent app framework.

Current status:

- The container is implemented and tested.
- The module-class loading layer is implemented and tested.
- The service-collection planning layer is implemented for module registration and service registration.
- The system is wired into the current host bootstraps and minimal sidecar runtime.

## Design Goals

- No decorators.
- No reflection-based service discovery.
- No assembly or directory scanning for service registration.
- Module authors register services explicitly in their module class.
- Module registration and service registration should happen in a planning phase before the container is built.
- The host only needs to load a root module class.
- Third-party modules use a fixed export name by default.
- Runtime contracts and module contracts are abstracted behind shared tokens.
- Cross-module access should use abstractions, not implementation classes.

## Core Concepts

### Service identifiers

Services are resolved by either:

- an explicit token created with `createServiceToken<T>("name")`
- or a namespaced token created with `createServiceNamespace("module.shared").token<T>("name")`
- a class constructor

Recommended rule:

- Use tokens for all runtime-facing and cross-module abstractions.
- Only use class constructors as identifiers for internal/private implementations.
- Do not expose implementation classes from one module to another module.

### Lifetimes

- `singleton`: one instance per container
- `scoped`: one instance per scope
- `transient`: a new instance every resolve

### Registration helpers

- `asValue(value)`
- `asClass(MyService, options?)`
- `asFactory((context) => ..., options?)`
- `asAlias(targetToken)`

### Container APIs

- `createContainer()`
- `container.register(...)`
- `container.registerMany(...)`
- `container.resolve(...)`
- `container.tryResolve(...)`
- `container.resolveAll(...)`
- `container.createScope(...)`
- `container.listRegistrations(...)`
- `container.dispose()`

### Service collection APIs

- `createServiceCollection()`
- `services.register(...)`
- `services.registerMany(...)`
- `services.addSingleton(...)`
- `services.addScoped(...)`
- `services.addTransient(...)`
- `services.addAlias(...)`
- `services.addModule(...)`
- `services.load(...)`
- `services.loadModules(...)`
- `services.listRegistrations(...)`
- `services.listModules()`
- `services.buildContainer()`
- `services.buildServiceProvider()`
- `services.buildModuleHost()`

Recommended bootstrap flow:

```ts
import {
  DependencyModuleBase,
  asClass,
  createServiceCollection,
} from "./index"

class RuntimeModule extends DependencyModuleBase {
  static moduleId = "runtime"

  override configureServices(context) {
    context.register(RuntimeLogger, asClass(RuntimeLogger, {
      lifetime: "singleton",
      source: context.module.moduleId,
    }))
  }
}

const services = createServiceCollection()
services.addModule(RuntimeModule)

const container = services.buildServiceProvider()
```

This keeps module registration and service registration in a build-time phase,
while service resolution only happens after the container is built.

If the system needs lifecycle hooks, use a module host:

```ts
const services = createServiceCollection()
services.addModule(RuntimeModule)

const host = services.buildModuleHost()
await host.start()

// ...run application...

await host.dispose()
```

## Module-Class Pattern

Modules are explicit classes that implement `configureServices(context)`.

Recommended base class:

```ts
import { DependencyModuleBase } from "./index"

export class MyModule extends DependencyModuleBase {
  static moduleId = "my.module"

  override configureServices(context) {
    // Register services here manually.
  }
}
```

### Module dependencies

Modules can declare dependencies with a static `dependencies` field.

```ts
export class FeatureModule extends DependencyModuleBase {
  static moduleId = "feature.module"
  static dependencies = [SharedModule] as const

  override configureServices(context) {
    // Feature registrations.
  }
}
```

The loader resolves the module graph in dependency-first order and calls
`configureServices()` for each module once.

Recommended rule:

- Use `createServiceCollection()` + `loadModules()` as the main bootstrap path.
- Prefer `addSingleton()` / `addScoped()` / `addTransient()` for manual registrations inside the planning phase.
- Treat `loadDependencyModules(container, rootModule)` as a lower-level direct-loading API.
- Do not resolve runtime services from `configureServices()`; use it only to plan registrations.

### Lifecycle hooks

Modules can optionally implement these hooks:

- `preConfigureServices(context)`
- `configureServices(context)`
- `postConfigureServices(context)`
- `onStart(context)`
- `onStop(context)`

Execution order:

- `preConfigureServices`: dependency-first
- `configureServices`: dependency-first
- `postConfigureServices`: dependency-first
- `onStart`: dependency-first after the container is built
- `onStop`: reverse dependency order

Recommended use:

- `preConfigureServices`: declare shared contracts, options, extension points
- `configureServices`: register main services and adapters
- `postConfigureServices`: compose cross-module pipelines or overrides
- `onStart`: attach runtime hooks, open event streams, warm caches, start hosts
- `onStop`: detach subscriptions, flush projections, release long-lived resources

This is the seam intended for AI provider modules, application conversation modules,
frontend projection modules, and other host-oriented layers that need startup/shutdown
behavior without mixing that behavior into pure kernel contracts.

### AI / application / frontend layering

Recommended module stack:

- `AiProviderModule`: provider adapter, codec, route-specific wiring
- `ApplicationConversationModule`: projection, delivery, persistence handoff
- `FrontendShellModule`: page projection, stream bridge, view-model sync

Rules:

- AI modules register normalized `AiTurnPort` and related adapters, not vendor SDK contracts
- application modules consume unified `Message / ToolCall / Interaction / RunBoundary`
- frontend modules depend on application projection contracts, not kernel internals
- long-lived runtime behavior should live in `onStart` / `onStop`, not in `configureServices`

## Contract-First Rule

The DI container already supports dependency inversion through tokens. The
recommended pattern is:

1. Put module-facing abstractions into a dedicated `shared/` directory.
2. Define interfaces and tokens in that `shared/` directory.
3. Keep implementation classes in a separate runtime/impl directory.
4. Register implementation classes against shared tokens.
5. Resolve only the shared tokens from other modules.

That means:

- runtime code should depend on runtime shared contracts
- module code should depend on module shared contracts
- module-to-module access should also go through shared contracts

Do not make other modules depend on a concrete class just because the container
can technically resolve class constructors.

## Service Namespaces

To keep token names stable and readable, prefer the namespaced token helper:

```ts
import { createServiceNamespace } from "./index"

const runtimeShared = createServiceNamespace("runtime.shared")
const featureShared = createServiceNamespace("modules.feature.shared")

export interface RuntimeClock {
  now(): number
}

export interface FeaturePort {
  describe(): string
}

export const RUNTIME_CLOCK = runtimeShared.token<RuntimeClock>("clock")
export const FEATURE_PORT = featureShared.token<FeaturePort>("port")
```

This gives descriptions like:

- `runtime.shared.clock`
- `modules.feature.shared.port`

The helper is only for naming and organization. The dependency inversion still
comes from resolving tokens instead of implementation classes.

## Recommended Layout

When the runtime is expanded to module-class composition, each module
should have its own `shared/` directory for public abstractions.

Recommended shape:

```text
sidecar/
  modules/
    runtime/
      shared/
        contracts.ts
        tokens.ts
      impl/
        services/
        runtime-module.ts
    workspace/
      shared/
        contracts.ts
        tokens.ts
      impl/
        services/
        workspace-module.ts
    tasks/
      shared/
        contracts.ts
        tokens.ts
      impl/
        services/
        tasks-module.ts
```

Rules:

- `shared/` only contains abstractions, DTO-like contract types, and tokens.
- `impl/` contains concrete classes and module registration logic.
- one module should not import another module's `impl/`.
- module exports for third parties should be defined through `shared/` contracts.

## Runtime Interface Separation

Runtime services must be split into:

1. interface/token definitions
2. implementation classes
3. registration wiring

Example:

```ts
// modules/runtime/shared/contracts.ts
export interface RuntimeLogger {
  write(message: string): void
}

// modules/runtime/shared/tokens.ts
import { createServiceNamespace } from "@maomiagent/sidecar/di"
import type { RuntimeLogger } from "./contracts"

const runtimeShared = createServiceNamespace("runtime.shared")

export const RUNTIME_LOGGER = runtimeShared.token<RuntimeLogger>("logger")

// modules/runtime/impl/runtime-logger.ts
import type { RuntimeLogger } from "../shared/contracts"

export class RuntimeLoggerImpl implements RuntimeLogger {
  write(message: string) {
    console.log(message)
  }
}

// modules/runtime/impl/runtime-module.ts
import { asClass } from "@maomiagent/sidecar/di"
import { RUNTIME_LOGGER } from "../shared/tokens"
import { RuntimeLoggerImpl } from "./runtime-logger"

context.register(RUNTIME_LOGGER, asClass(RuntimeLoggerImpl, {
  lifetime: "singleton",
  source: "runtime",
}))
```

Any consumer module should resolve `RUNTIME_LOGGER`, not `RuntimeLoggerImpl`.

When using the planning flow, the module context exposes:

- `context.services`: the service collection / registry being configured
- `context.register(...)`: a shorthand registration helper
- `context.addSingleton(...)`, `context.addScoped(...)`, `context.addTransient(...)`: higher-level registration helpers
- `context.modules`: the resolved module graph
- `context.container`: only available when using the low-level direct container loader

When using a module host, `onStart()` and `onStop()` receive a runtime context with:

- `context.container` / `context.services`: the built container
- `context.module`: the current module record
- `context.rootModule`: the root record for the loaded module graph
- `context.modules`: the loaded module graph

## Module-to-Module Communication

If module A needs capability from module B:

1. module B defines an interface and token in `module-b/shared/`
2. module B registers its implementation to that token
3. module A depends on `module-b/shared/` only
4. module A resolves the shared token from the container

This keeps:

- dependency direction stable
- implementation replacement possible
- third-party extension points explicit

## Third-Party Module Entry

The default export name for a third-party module class is:

```ts
MaomiModule
```

Example:

```ts
import {
  DependencyModuleBase,
  createServiceToken,
  asClass,
} from "@maomiagent/sidecar/di"

const HELLO_SERVICE = createServiceToken<{ say(): string }>("hello.service")

class HelloService {
  say() {
    return "hello"
  }
}

export class MaomiModule extends DependencyModuleBase {
  static moduleId = "demo.hello"

  override configureServices(context) {
    context.register(HELLO_SERVICE, asClass(HelloService, {
      lifetime: "singleton",
      source: "demo.hello",
    }))
  }
}
```

The host can then do:

```ts
import {
  createContainer,
  importDependencyModuleClass,
  loadDependencyModules,
} from "@maomiagent/sidecar/di"

const container = createContainer()
const moduleClass = await importDependencyModuleClass("path/to/module-entry.mjs")
loadDependencyModules(container, moduleClass)
```

## Module Context

`configureServices(context)` receives a `DependencyModuleContext`.

Useful members:

- `context.module`
- `context.modules`
- `context.container`
- `context.registry`
- `context.register(...)`
- `context.registerMany(...)`
- `context.load(...)`
- `context.hasModule(...)`
- `context.getModule(...)`

This keeps the module self-contained. The host does not need to know what
services the module registers.

## What The Host Is Responsible For

The host should only do these things:

1. Resolve the module entry class.
2. Create the container.
3. Load the root module graph.
4. Later, create request scopes when the runtime is integrated.

The host should not:

- inspect module internals
- scan source files for services
- auto-register classes by naming convention
- decide module-local service bindings
- bypass shared abstractions by directly binding foreign implementation classes

## Current Constraints

- Module classes are instantiated with `new ModuleClass()`. They are not resolved from
  the container.
- Module registration is synchronous.
- The container has not been connected to `app.ts` yet.
- There is no runtime hot-reload or unload flow yet.

## Next Integration Step

When this DI subsystem is connected to the sidecar runtime, the recommended entry is:

1. Create one root container during sidecar startup.
2. Load the built-in root module graph.
3. Create one scope per Hono request.
4. Gradually migrate existing hand-wired services into module registrations.
