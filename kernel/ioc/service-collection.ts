import {
  asAlias,
  asValue,
  createScopedBinding,
  createContainer,
  createSingletonBinding,
  createTransientBinding,
  defineContainerModule,
  type AliasBindingOptions,
  type ContainerModule,
  type DependencyContainer,
  type DependencyRegistry,
  type ScopedServiceDescriptor,
  type ServiceBinding,
  type ServiceIdentifier,
  type ServiceLifetime,
  type SingletonServiceDescriptor,
  type TransientServiceDescriptor,
} from "./container"
import { ModuleAlreadyLoadedError, ModuleLifecycleError } from "./errors"
import {
  configureDependencyModules,
  instantiateDependencyModules,
  startDependencyModules,
  stopDependencyModules,
  type DependencyModuleClass,
  type DependencyModuleLoadResult,
  type DependencyModuleRecord,
} from "./module"
import {
  describeServiceIdentifier,
  isServiceToken,
  type InjectableClass,
} from "./token"

export type ServiceRegistrationPlanInfo = {
  planId: string
  tokenDescription: string
  bindingKind: ServiceBinding<unknown>["kind"]
  lifetime: ServiceLifetime
  order: number
  source?: string
}

export type ServiceCollection = DependencyRegistry & {
  addModule: (module: ContainerModule | DependencyModuleClass) => ServiceCollection
  loadModules: (rootModuleClass: DependencyModuleClass) => DependencyModuleLoadResult
  listRegistrations: (
    identifier?: ServiceIdentifier<unknown>,
  ) => ServiceRegistrationPlanInfo[]
  listModules: () => readonly DependencyModuleRecord[]
  buildContainer: () => DependencyContainer
  buildServiceProvider: () => DependencyContainer
  buildModuleHost: () => ModuleHost
}

export type ModuleHost = {
  readonly container: DependencyContainer
  readonly services: DependencyContainer
  listModules: () => readonly DependencyModuleRecord[]
  start: () => Promise<void>
  stop: () => Promise<void>
  dispose: () => Promise<void>
}

type PlannedBinding<T> = {
  planId: string
  identifier: ServiceIdentifier<T>
  binding: ServiceBinding<T>
  tokenDescription: string
  sequence: number
}

type BindingLookupKey = symbol | InjectableClass<unknown>

const DEFAULT_BINDING_ORDER = 100

function normalizeModuleId(value: string): string {
  const trimmed = value.trim()
  return trimmed || "anonymous-module"
}

function bindingLifetime(binding: {
  kind: ServiceBinding<unknown>["kind"]
  lifetime?: ServiceLifetime
}): ServiceLifetime {
  if (binding.kind === "value") {
    return "singleton"
  }
  if (binding.kind === "alias") {
    return "transient"
  }
  return binding.lifetime ?? "transient"
}

function bindingOrder(binding: ServiceBinding<unknown>): number {
  return typeof binding.order === "number" && Number.isFinite(binding.order)
    ? Math.trunc(binding.order)
    : DEFAULT_BINDING_ORDER
}

function comparePlannedBindings(
  left: PlannedBinding<unknown>,
  right: PlannedBinding<unknown>,
): number {
  const orderDiff = bindingOrder(left.binding) - bindingOrder(right.binding)
  if (orderDiff !== 0) {
    return orderDiff
  }
  return left.sequence - right.sequence
}

function toBindingLookupKey(identifier: ServiceIdentifier<unknown>): BindingLookupKey {
  return isServiceToken(identifier) ? identifier.key : identifier
}

class ServiceCollectionImpl implements ServiceCollection {
  // The collection stores a registration plan, not live resolved services.
  private readonly bindings: PlannedBinding<unknown>[] = []
  private readonly registryModuleIds = new Set<string>()
  private readonly dependencyModuleIds = new Set<string>()
  private readonly moduleRecords: DependencyModuleRecord[] = []
  // Each root module graph is preserved so a ModuleHost can replay lifecycle hooks per graph.
  private readonly dependencyModuleLoads: DependencyModuleLoadResult[] = []
  private bindingSequence = 0

  register<T>(
    identifier: ServiceIdentifier<T>,
    binding: ServiceBinding<T>,
  ): ServiceCollection {
    this.bindingSequence += 1
    this.bindings.push({
      planId: `plan_${String(this.bindingSequence).padStart(5, "0")}`,
      identifier: identifier as ServiceIdentifier<unknown>,
      binding: binding as ServiceBinding<unknown>,
      tokenDescription: describeServiceIdentifier(identifier),
      sequence: this.bindingSequence,
    })
    return this
  }

  registerMany<T>(
    identifier: ServiceIdentifier<T>,
    bindings: readonly ServiceBinding<T>[],
  ): ServiceCollection {
    for (const binding of bindings) {
      this.register(identifier, binding)
    }
    return this
  }

  addSingleton<T>(
    identifier: ServiceIdentifier<T>,
    descriptor: SingletonServiceDescriptor<T>,
  ): ServiceCollection {
    return this.register(identifier, createSingletonBinding(descriptor))
  }

  addScoped<T>(
    identifier: ServiceIdentifier<T>,
    descriptor: ScopedServiceDescriptor<T>,
  ): ServiceCollection {
    return this.register(identifier, createScopedBinding(descriptor))
  }

  addTransient<T>(
    identifier: ServiceIdentifier<T>,
    descriptor: TransientServiceDescriptor<T>,
  ): ServiceCollection {
    return this.register(identifier, createTransientBinding(descriptor))
  }

  addAlias<T>(
    identifier: ServiceIdentifier<T>,
    target: ServiceIdentifier<T>,
    options?: AliasBindingOptions,
  ): ServiceCollection {
    return this.register(identifier, asAlias(target, options))
  }

  addModule(module: ContainerModule | DependencyModuleClass): ServiceCollection {
    if (typeof module === "function") {
      this.loadModules(module)
      return this
    }

    return this.load(module)
  }

  load(module: ContainerModule): ServiceCollection {
    const normalized = defineContainerModule(module)
    const moduleId = normalizeModuleId(normalized.moduleId)
    if (this.registryModuleIds.has(moduleId) || this.dependencyModuleIds.has(moduleId)) {
      throw new ModuleAlreadyLoadedError(
        `Dependency module "${moduleId}" has already been loaded`,
        {
          moduleId,
        },
      )
    }
    normalized.register(this)
    this.registryModuleIds.add(moduleId)
    return this
  }

  loadModules(rootModuleClass: DependencyModuleClass): DependencyModuleLoadResult {
    // Modules are instantiated now so they can contribute registrations,
    // but actual service resolution is still deferred until buildContainer/buildModuleHost.
    const result = instantiateDependencyModules(rootModuleClass)

    for (const module of result.modules) {
      if (this.registryModuleIds.has(module.moduleId) || this.dependencyModuleIds.has(module.moduleId)) {
        throw new ModuleAlreadyLoadedError(
          `Dependency module "${module.moduleId}" has already been loaded`,
          {
            moduleId: module.moduleId,
          },
        )
      }
    }

    for (const module of result.modules) {
      this.register(module.moduleClass, asValue(module.instance, {
        source: `module:${module.moduleId}`,
      }))
      this.dependencyModuleIds.add(module.moduleId)
      this.moduleRecords.push(module)
    }

    configureDependencyModules(this, result.modules)
    this.dependencyModuleLoads.push(result)
    return result
  }

  listRegistrations(identifier?: ServiceIdentifier<unknown>): ServiceRegistrationPlanInfo[] {
    const expectedKey = identifier ? toBindingLookupKey(identifier) : undefined
    const rows = expectedKey
      ? this.bindings.filter((item) => toBindingLookupKey(item.identifier) === expectedKey)
      : [...this.bindings]

    return rows
      .slice()
      .sort(comparePlannedBindings)
      .map((binding) => ({
        planId: binding.planId,
        tokenDescription: binding.tokenDescription,
        bindingKind: binding.binding.kind,
        lifetime: bindingLifetime(binding.binding),
        order: bindingOrder(binding.binding),
        source: binding.binding.source,
      }))
  }

  listModules(): readonly DependencyModuleRecord[] {
    return [...this.moduleRecords]
  }

  buildContainer(): DependencyContainer {
    // Replaying the plan into a fresh container keeps provider construction deterministic
    // and allows callers to rebuild isolated containers from the same registration plan.
    const container = createContainer()
    for (const binding of this.bindings) {
      container.register(binding.identifier, binding.binding)
    }
    return container
  }

  buildServiceProvider(): DependencyContainer {
    return this.buildContainer()
  }

  buildModuleHost(): ModuleHost {
    return new ModuleHostImpl(
      this.buildContainer(),
      this.dependencyModuleLoads,
    )
  }
}

function normalizeLifecycleError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

class ModuleHostImpl implements ModuleHost {
  private started = false

  constructor(
    readonly container: DependencyContainer,
    private readonly dependencyModuleLoads: readonly DependencyModuleLoadResult[],
  ) {}

  get services(): DependencyContainer {
    return this.container
  }

  listModules(): readonly DependencyModuleRecord[] {
    return this.dependencyModuleLoads.flatMap((item) => item.modules)
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    try {
      // Start each root graph in planning order; each graph already starts its own dependencies first.
      for (const result of this.dependencyModuleLoads) {
        await startDependencyModules(this.container, result)
      }
      this.started = true
    } catch (error) {
      throw new ModuleLifecycleError(
        `Module host start failed: ${normalizeLifecycleError(error)}`,
        {
          reason: normalizeLifecycleError(error),
        },
      )
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    const failures: string[] = []
    // Stop root graphs in reverse so later-added hosts release before earlier foundational hosts.
    for (const result of [...this.dependencyModuleLoads].reverse()) {
      try {
        await stopDependencyModules(this.container, result)
      } catch (error) {
        failures.push(normalizeLifecycleError(error))
      }
    }

    this.started = false

    if (failures.length > 0) {
      throw new ModuleLifecycleError(
        `Module host stop failed: ${failures.join("; ")}`,
        {
          failures,
        },
      )
    }
  }

  async dispose(): Promise<void> {
    const failures: string[] = []

    try {
      await this.stop()
    } catch (error) {
      failures.push(normalizeLifecycleError(error))
    }

    try {
      await this.container.dispose()
    } catch (error) {
      failures.push(normalizeLifecycleError(error))
    }

    if (failures.length > 0) {
      throw new ModuleLifecycleError(
        `Module host dispose failed: ${failures.join("; ")}`,
        {
          failures,
        },
      )
    }
  }
}

export function createServiceCollection(): ServiceCollection {
  return new ServiceCollectionImpl()
}