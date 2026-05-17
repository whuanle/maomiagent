import { pathToFileURL } from "node:url"
import { resolve as resolvePath } from "node:path"
import { asValue, type DependencyContainer, type DependencyRegistry } from "./container"
import {
  DuplicateModuleIdentifierError,
  InvalidDependencyModuleError,
  ModuleDependencyCycleError,
  ModuleExportNotFoundError,
} from "./errors"

export const DEFAULT_DEPENDENCY_MODULE_EXPORT_NAME = "MaomiModule"

export interface DependencyModule {
  // Registration hooks run before the container is built.
  // Use them to publish contracts, main registrations, and late composition in three explicit passes.
  preConfigureServices?(context: DependencyModuleContext): void
  configureServices(context: DependencyModuleContext): void
  postConfigureServices?(context: DependencyModuleContext): void

  // Runtime hooks run against the built container and are intended for warmup,
  // subscriptions, bridges, and other host-facing startup/shutdown work.
  onStart?(context: DependencyModuleRuntimeContext): void | Promise<void>
  onStop?(context: DependencyModuleRuntimeContext): void | Promise<void>
}

export abstract class DependencyModuleBase implements DependencyModule {
  preConfigureServices(_context: DependencyModuleContext): void {
    // Default no-op. Concrete modules can override this to pre-register contracts.
  }

  configureServices(_context: DependencyModuleContext): void {
    // Default no-op. Concrete modules can override this to register services.
  }

  postConfigureServices(_context: DependencyModuleContext): void {
    // Default no-op. Concrete modules can override this to compose or override registrations.
  }

  onStart(_context: DependencyModuleRuntimeContext): void | Promise<void> {
    // Default no-op. Concrete modules can override this to attach runtime hooks.
  }

  onStop(_context: DependencyModuleRuntimeContext): void | Promise<void> {
    // Default no-op. Concrete modules can override this to tear down runtime hooks.
  }
}

export type DependencyModuleClass<T extends DependencyModule = DependencyModule> = {
  new (): T
  readonly moduleId?: string
  readonly dependencies?: readonly DependencyModuleClass[]
}

export type DependencyModuleRecord = {
  moduleId: string
  moduleClass: DependencyModuleClass
  instance: DependencyModule
  dependencyIds: string[]
  depth: number
  order: number
}

export type DependencyModuleContext = {
  module: DependencyModuleRecord
  modules: readonly DependencyModuleRecord[]
  services: DependencyRegistry
  registry: DependencyRegistry
  container?: DependencyContainer
  register: DependencyRegistry["register"]
  registerMany: DependencyRegistry["registerMany"]
  addSingleton: DependencyRegistry["addSingleton"]
  addScoped: DependencyRegistry["addScoped"]
  addTransient: DependencyRegistry["addTransient"]
  addAlias: DependencyRegistry["addAlias"]
  load: DependencyRegistry["load"]
  hasModule: (moduleClassOrId: DependencyModuleClass | string) => boolean
  getModule: (moduleClassOrId: DependencyModuleClass | string) => DependencyModuleRecord | undefined
}

export type DependencyModuleRuntimeContext = {
  module: DependencyModuleRecord
  rootModule: DependencyModuleRecord
  modules: readonly DependencyModuleRecord[]
  container: DependencyContainer
  services: DependencyContainer
  hasModule: (moduleClassOrId: DependencyModuleClass | string) => boolean
  getModule: (moduleClassOrId: DependencyModuleClass | string) => DependencyModuleRecord | undefined
}

export type DependencyModuleLoadResult = {
  rootModule: DependencyModuleRecord
  modules: readonly DependencyModuleRecord[]
}

export type DependencyModulePlanRecord = {
  moduleId: string
  moduleClass: DependencyModuleClass
  dependencyIds: string[]
  depth: number
  order: number
}

type TraversalNode = {
  moduleClass: DependencyModuleClass
  moduleId: string
  dependencyIds: string[]
  depth: number
}

function normalizeModuleId(moduleClass: DependencyModuleClass): string {
  const fromStatic =
    typeof moduleClass.moduleId === "string" ? moduleClass.moduleId.trim() : ""
  if (fromStatic) {
    return fromStatic
  }
  const fromName = typeof moduleClass.name === "string" ? moduleClass.name.trim() : ""
  if (fromName) {
    return fromName
  }
  throw new InvalidDependencyModuleError(
    "Dependency module must define a static moduleId or a named class",
  )
}

function isDependencyModuleClass(
  value: unknown,
): value is DependencyModuleClass {
  if (typeof value !== "function") {
    return false
  }
  return typeof (value as Partial<DependencyModule>).configureServices === "function"
    || typeof (value as { prototype?: Partial<DependencyModule> }).prototype?.configureServices === "function"
}

function getDependencyModuleDependencies(
  moduleClass: DependencyModuleClass,
): readonly DependencyModuleClass[] {
  const dependencies = moduleClass.dependencies
  if (!Array.isArray(dependencies)) {
    return []
  }
  return dependencies
}

function buildDependencyCyclePath(
  stack: DependencyModuleClass[],
  repeated: DependencyModuleClass,
): string[] {
  const startIndex = stack.findIndex((item) => item === repeated)
  const cycle = startIndex >= 0 ? stack.slice(startIndex) : [...stack]
  cycle.push(repeated)
  return cycle.map((item) => normalizeModuleId(item))
}

function resolveTraversalGraph(
  rootModuleClass: DependencyModuleClass,
): TraversalNode[] {
  // The graph is resolved once into dependency-first order and then reused by planning,
  // configuration, and lifecycle phases so every phase sees the same module ordering.
  const stack: DependencyModuleClass[] = []
  const visited = new Set<DependencyModuleClass>()
  const moduleIdMap = new Map<string, DependencyModuleClass>()
  const ordered: TraversalNode[] = []

  const visit = (
    moduleClass: DependencyModuleClass,
    depth: number,
  ) => {
    if (!isDependencyModuleClass(moduleClass)) {
      throw new InvalidDependencyModuleError(
        "Dependency module class must implement configureServices(context)",
        {
          moduleClass: String(moduleClass),
        },
      )
    }

    if (stack.includes(moduleClass)) {
      const cyclePath = buildDependencyCyclePath(stack, moduleClass)
      throw new ModuleDependencyCycleError(
        `Dependency module cycle detected: ${cyclePath.join(" -> ")}`,
        {
          cyclePath,
        },
      )
    }

    if (visited.has(moduleClass)) {
      return
    }

    const moduleId = normalizeModuleId(moduleClass)
    const existing = moduleIdMap.get(moduleId)
    if (existing && existing !== moduleClass) {
      throw new DuplicateModuleIdentifierError(
        `Duplicate dependency module identifier "${moduleId}" detected`,
        {
          moduleId,
          existingModule: normalizeModuleId(existing),
          incomingModule: moduleId,
        },
      )
    }
    moduleIdMap.set(moduleId, moduleClass)

    stack.push(moduleClass)
    const dependencyClasses = getDependencyModuleDependencies(moduleClass)
    for (const dependencyClass of dependencyClasses) {
      visit(dependencyClass, depth + 1)
    }
    stack.pop()

    visited.add(moduleClass)
    ordered.push({
      moduleClass,
      moduleId,
      dependencyIds: dependencyClasses.map((item) => normalizeModuleId(item)),
      depth,
    })
  }

  visit(rootModuleClass, 0)
  return ordered
}

function createModuleContext(
  registry: DependencyRegistry,
  module: DependencyModuleRecord,
  modules: readonly DependencyModuleRecord[],
  options?: {
    container?: DependencyContainer
  },
): DependencyModuleContext {
  return {
    module,
    modules,
    services: registry,
    registry,
    container: options?.container,
    register: registry.register.bind(registry),
    registerMany: registry.registerMany.bind(registry),
    addSingleton: registry.addSingleton.bind(registry),
    addScoped: registry.addScoped.bind(registry),
    addTransient: registry.addTransient.bind(registry),
    addAlias: registry.addAlias.bind(registry),
    load: registry.load.bind(registry),
    hasModule: (moduleClassOrId) => hasModuleRecord(modules, moduleClassOrId),
    getModule: (moduleClassOrId) => getModuleRecord(modules, moduleClassOrId),
  }
}

function hasModuleRecord(
  modules: readonly DependencyModuleRecord[],
  moduleClassOrId: DependencyModuleClass | string,
): boolean {
  if (typeof moduleClassOrId === "string") {
    return modules.some((item) => item.moduleId === moduleClassOrId.trim())
  }
  return modules.some((item) => item.moduleClass === moduleClassOrId)
}

function getModuleRecord(
  modules: readonly DependencyModuleRecord[],
  moduleClassOrId: DependencyModuleClass | string,
): DependencyModuleRecord | undefined {
  if (typeof moduleClassOrId === "string") {
    const moduleId = moduleClassOrId.trim()
    return modules.find((item) => item.moduleId === moduleId)
  }
  return modules.find((item) => item.moduleClass === moduleClassOrId)
}

function createModuleRuntimeContext(
  container: DependencyContainer,
  rootModule: DependencyModuleRecord,
  module: DependencyModuleRecord,
  modules: readonly DependencyModuleRecord[],
): DependencyModuleRuntimeContext {
  // Runtime hooks get the built container, unlike registration hooks which only see the registry.
  return {
    module,
    rootModule,
    modules,
    container,
    services: container,
    hasModule: (moduleClassOrId) => hasModuleRecord(modules, moduleClassOrId),
    getModule: (moduleClassOrId) => getModuleRecord(modules, moduleClassOrId),
  }
}

function callModuleConfigurationMethod(
  record: DependencyModuleRecord,
  methodName: "preConfigureServices" | "configureServices" | "postConfigureServices",
  context: DependencyModuleContext,
): void {
  // Keep phase dispatch centralized so the three registration passes stay symmetric.
  const handler = record.instance[methodName]
  if (typeof handler === "function") {
    handler.call(record.instance, context)
  }
}

export function planDependencyModules(
  rootModuleClass: DependencyModuleClass,
): DependencyModulePlanRecord[] {
  // Planning is pure graph analysis: no container and no service resolution yet.
  return resolveTraversalGraph(rootModuleClass).map((node, index) => ({
    moduleId: node.moduleId,
    moduleClass: node.moduleClass,
    dependencyIds: [...node.dependencyIds],
    depth: node.depth,
    order: index,
  }))
}

export function instantiateDependencyModules(
  rootModuleClass: DependencyModuleClass,
): DependencyModuleLoadResult {
  // Module instances are created once and then reused across registration and runtime phases.
  const modules = planDependencyModules(rootModuleClass).map((node) => ({
    moduleId: node.moduleId,
    moduleClass: node.moduleClass,
    instance: new node.moduleClass(),
    dependencyIds: [...node.dependencyIds],
    depth: node.depth,
    order: node.order,
  }))

  const rootModule = modules.find((item) => item.moduleClass === rootModuleClass)
  if (!rootModule) {
    throw new InvalidDependencyModuleError(
      "Root dependency module was not loaded",
      {
        rootModule: normalizeModuleId(rootModuleClass),
      },
    )
  }

  return {
    rootModule,
    modules,
  }
}

export function configureDependencyModules(
  registry: DependencyRegistry,
  modules: readonly DependencyModuleRecord[],
  options?: {
    container?: DependencyContainer
  },
): void {
  // Split configuration into three passes so modules can publish extension points first,
  // register main services second, and wire cross-module composition last.
  for (const record of modules) {
    callModuleConfigurationMethod(
      record,
      "preConfigureServices",
      createModuleContext(registry, record, modules, options),
    )
  }

  for (const record of modules) {
    callModuleConfigurationMethod(
      record,
      "configureServices",
      createModuleContext(registry, record, modules, options),
    )
  }

  for (const record of modules) {
    callModuleConfigurationMethod(
      record,
      "postConfigureServices",
      createModuleContext(registry, record, modules, options),
    )
  }
}

export async function startDependencyModules(
  container: DependencyContainer,
  result: DependencyModuleLoadResult,
): Promise<void> {
  // Startup follows dependency order so dependents only observe already-started prerequisites.
  for (const record of result.modules) {
    if (typeof record.instance.onStart !== "function") {
      continue
    }

    await record.instance.onStart(
      createModuleRuntimeContext(
        container,
        result.rootModule,
        record,
        result.modules,
      ),
    )
  }
}

export async function stopDependencyModules(
  container: DependencyContainer,
  result: DependencyModuleLoadResult,
): Promise<void> {
  // Shutdown reverses startup order so dependents release before their prerequisites disappear.
  for (const record of [...result.modules].reverse()) {
    if (typeof record.instance.onStop !== "function") {
      continue
    }

    await record.instance.onStop(
      createModuleRuntimeContext(
        container,
        result.rootModule,
        record,
        result.modules,
      ),
    )
  }
}

export function resolveDependencyModuleClass(
  exportsValue: Record<string, unknown>,
  exportName = DEFAULT_DEPENDENCY_MODULE_EXPORT_NAME,
): DependencyModuleClass {
  const candidate = exportsValue[exportName]
  if (!candidate) {
    throw new ModuleExportNotFoundError(
      `Dependency module export "${exportName}" was not found`,
      {
        exportName,
        availableExports: Object.keys(exportsValue),
      },
    )
  }
  if (!isDependencyModuleClass(candidate)) {
    throw new InvalidDependencyModuleError(
      `Export "${exportName}" is not a valid dependency module class`,
      {
        exportName,
      },
    )
  }
  return candidate
}

export async function importDependencyModuleClass(
  modulePath: string,
  options?: {
    exportName?: string
  },
): Promise<DependencyModuleClass> {
  const trimmed = modulePath.trim()
  if (!trimmed) {
    throw new ModuleExportNotFoundError("Dependency module path is required", {
      modulePath,
    })
  }

  const specifier =
    /^[a-zA-Z]+:/.test(trimmed)
      ? trimmed
      : pathToFileURL(resolvePath(trimmed)).href
  const loaded = await import(specifier) as Record<string, unknown>
  return resolveDependencyModuleClass(
    loaded,
    options?.exportName ?? DEFAULT_DEPENDENCY_MODULE_EXPORT_NAME,
  )
}

export function loadDependencyModules(
  container: DependencyContainer,
  rootModuleClass: DependencyModuleClass,
): DependencyModuleLoadResult {
  // This is the low-level path that writes directly into an already-built container.
  // The higher-level ServiceCollection path keeps the same semantics but defers container construction.
  const result = instantiateDependencyModules(rootModuleClass)

  for (const record of result.modules) {
    container.register(record.moduleClass, asValue(record.instance, {
      source: `module:${record.moduleId}`,
    }))
  }

  configureDependencyModules(container, result.modules, {
    container,
  })

  return result
}
