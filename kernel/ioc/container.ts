import {
  CircularDependencyError,
  ContainerDisposedError,
  ModuleAlreadyLoadedError,
  MultipleServiceBindingsError,
  ScopedServiceResolutionError,
  ServiceNotFoundError,
} from "./errors"
import {
  describeServiceIdentifier,
  type InjectableClass,
  isServiceToken,
  type ServiceIdentifier,
  type ServiceToken,
} from "./token"

export type ServiceLifetime = "singleton" | "scoped" | "transient"

export type DisposalHandler<T> = {
  bivarianceHack: (value: T) => void | Promise<void>
}["bivarianceHack"]

export type BindingOptions<T> = {
  lifetime?: ServiceLifetime
  order?: number
  source?: string
  onDispose?: DisposalHandler<T>
}

export type ValueBindingOptions<T> = {
  order?: number
  source?: string
  onDispose?: DisposalHandler<T>
}

export type AliasBindingOptions = {
  order?: number
  source?: string
}

export type ServiceDescriptorOptions<T> = {
  order?: number
  source?: string
  onDispose?: DisposalHandler<T>
}

export type ClassServiceDescriptor<T> = ServiceDescriptorOptions<T> & {
  useClass: InjectableClass<T>
  dependencies?: readonly ServiceIdentifier<unknown>[]
}

export type FactoryServiceDescriptor<T> = ServiceDescriptorOptions<T> & {
  useFactory: (context: ResolutionContext) => T
}

export type ValueServiceDescriptor<T> = ValueBindingOptions<T> & {
  useValue: T
}

export type SingletonServiceDescriptor<T> =
  | ClassServiceDescriptor<T>
  | FactoryServiceDescriptor<T>
  | ValueServiceDescriptor<T>

export type ScopedServiceDescriptor<T> =
  | ClassServiceDescriptor<T>
  | FactoryServiceDescriptor<T>

export type TransientServiceDescriptor<T> =
  | ClassServiceDescriptor<T>
  | FactoryServiceDescriptor<T>

export type FactoryBinding<T> = {
  kind: "factory"
  factory: (context: ResolutionContext) => T
  lifetime: ServiceLifetime
  order: number
  source?: string
  onDispose?: DisposalHandler<T>
}

export type ClassBinding<T> = {
  kind: "class"
  implementation: InjectableClass<T>
  dependencies?: readonly ServiceIdentifier<unknown>[]
  lifetime: ServiceLifetime
  order: number
  source?: string
  onDispose?: DisposalHandler<T>
}

export type ValueBinding<T> = {
  kind: "value"
  value: T
  order: number
  source?: string
  onDispose?: DisposalHandler<T>
}

export type AliasBinding<T> = {
  kind: "alias"
  target: ServiceIdentifier<T>
  order: number
  source?: string
  onDispose?: undefined
}

export type ServiceBinding<T> =
  | FactoryBinding<T>
  | ClassBinding<T>
  | ValueBinding<T>
  | AliasBinding<T>

export type ContainerModule = {
  moduleId: string
  register: (registry: DependencyRegistry) => void
}

export type RegistrationInfo = {
  registrationId: string
  tokenDescription: string
  bindingKind: ServiceBinding<unknown>["kind"]
  lifetime: ServiceLifetime
  order: number
  source?: string
}

export type DependencyResolver = {
  resolve: <T>(identifier: ServiceIdentifier<T>) => T
  tryResolve: <T>(identifier: ServiceIdentifier<T>) => T | undefined
  resolveAll: <T>(identifier: ServiceIdentifier<T>) => T[]
  has: (identifier: ServiceIdentifier<unknown>) => boolean
}

export type DependencyRegistry = {
  register: <T>(
    identifier: ServiceIdentifier<T>,
    binding: ServiceBinding<T>,
  ) => DependencyRegistry
  registerMany: <T>(
    identifier: ServiceIdentifier<T>,
    bindings: readonly ServiceBinding<T>[],
  ) => DependencyRegistry
  addSingleton: <T>(
    identifier: ServiceIdentifier<T>,
    descriptor: SingletonServiceDescriptor<T>,
  ) => DependencyRegistry
  addScoped: <T>(
    identifier: ServiceIdentifier<T>,
    descriptor: ScopedServiceDescriptor<T>,
  ) => DependencyRegistry
  addTransient: <T>(
    identifier: ServiceIdentifier<T>,
    descriptor: TransientServiceDescriptor<T>,
  ) => DependencyRegistry
  addAlias: <T>(
    identifier: ServiceIdentifier<T>,
    target: ServiceIdentifier<T>,
    options?: AliasBindingOptions,
  ) => DependencyRegistry
  load: (module: ContainerModule) => DependencyRegistry
}

export type DependencyScope = DependencyResolver & {
  readonly id: string
  readonly label?: string
  dispose: () => Promise<void>
}

export type DependencyContainer = DependencyRegistry &
  DependencyResolver & {
    createScope: (label?: string) => DependencyScope
    listRegistrations: (
      identifier?: ServiceIdentifier<unknown>,
    ) => RegistrationInfo[]
    dispose: () => Promise<void>
  }

export type ResolutionContext = DependencyResolver & {
  readonly container: DependencyContainer
  readonly scope: DependencyScope
  readonly token: ServiceIdentifier<unknown>
}

type InternalBindingBase<T> = {
  disposeValue?: (value: unknown) => void | Promise<void>
  registrationId: string
  token: ServiceIdentifier<T>
  tokenDescription: string
  sequence: number
}

type InternalFactoryBinding<T> = {
  kind: "factory"
  factory: (context: ResolutionContext) => T
  lifetime: ServiceLifetime
  order: number
  source?: string
} & InternalBindingBase<T>

type InternalClassBinding<T> = {
  kind: "class"
  implementation: InjectableClass<T>
  dependencies?: readonly ServiceIdentifier<unknown>[]
  lifetime: ServiceLifetime
  order: number
  source?: string
} & InternalBindingBase<T>

type InternalValueBinding<T> = {
  kind: "value"
  value: T
  order: number
  source?: string
} & InternalBindingBase<T>

type InternalAliasBinding<T> = {
  kind: "alias"
  target: ServiceIdentifier<T>
  order: number
  source?: string
} & InternalBindingBase<T>

type InternalBinding<T> =
  | InternalFactoryBinding<T>
  | InternalClassBinding<T>
  | InternalValueBinding<T>
  | InternalAliasBinding<T>

type ResolutionFrame = {
  registrationId: string
  tokenDescription: string
  lifetime: ServiceLifetime
}

type TrackedDisposable = {
  key: string
  description: string
  dispose: () => Promise<void>
}

type BindingLookupKey = symbol | InjectableClass<unknown>

const DEFAULT_BINDING_ORDER = 100

const symbolWithDispose = Symbol as typeof Symbol & {
  dispose?: symbol
  asyncDispose?: symbol
}

function normalizeOrder(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BINDING_ORDER
  }
  return Math.trunc(value)
}

function normalizeModuleId(value: string): string {
  const trimmed = value.trim()
  return trimmed || "anonymous-module"
}

function bindingLifetime(binding: {
  kind: ServiceBinding<unknown>["kind"]
  lifetime?: ServiceLifetime
}): ServiceLifetime {
  // Value bindings are prebuilt instances, and aliases forward at resolution time,
  // so only class/factory bindings need an explicit configured lifetime.
  if (binding.kind === "value") {
    return "singleton"
  }
  if (binding.kind === "alias") {
    return "transient"
  }
  return binding.lifetime ?? "transient"
}

function compareBindings(
  left: InternalBinding<unknown>,
  right: InternalBinding<unknown>,
): number {
  const orderDiff = left.order - right.order
  if (orderDiff !== 0) {
    return orderDiff
  }
  return left.sequence - right.sequence
}

function createResolutionPath(frames: ResolutionFrame[]): string {
  return frames.map((item) => item.tokenDescription).join(" -> ")
}

function createDisposalHandler<T>(
  binding: InternalBinding<T>,
  value: T,
): (() => Promise<void>) | undefined {
  // Disposal prefers an explicit onDispose hook and then falls back to common JS conventions
  // so modules can register ordinary classes without extra wrapper code.
  if (binding.disposeValue) {
    return async () => {
      await binding.disposeValue?.(value)
    }
  }

  if (binding.kind === "value") {
    return undefined
  }

  const candidate = value as Record<PropertyKey, unknown> | null | undefined
  if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) {
    return undefined
  }

  const asyncDisposeSymbol = symbolWithDispose.asyncDispose
  if (
    asyncDisposeSymbol
    && typeof candidate[asyncDisposeSymbol] === "function"
  ) {
    return async () => {
      const fn = candidate[asyncDisposeSymbol] as () => Promise<void>
      await fn.call(value)
    }
  }

  const disposeSymbol = symbolWithDispose.dispose
  if (
    disposeSymbol
    && typeof candidate[disposeSymbol] === "function"
  ) {
    return async () => {
      const fn = candidate[disposeSymbol] as () => void
      fn.call(value)
    }
  }

  if (typeof candidate.dispose === "function") {
    return async () => {
      const fn = candidate.dispose as () => void | Promise<void>
      await fn.call(value)
    }
  }

  if (typeof candidate.close === "function") {
    return async () => {
      const fn = candidate.close as () => void | Promise<void>
      await fn.call(value)
    }
  }

  return undefined
}

function isClassServiceDescriptor<T>(
  descriptor: SingletonServiceDescriptor<T> | ScopedServiceDescriptor<T> | TransientServiceDescriptor<T>,
): descriptor is ClassServiceDescriptor<T> {
  return "useClass" in descriptor
}

function isValueServiceDescriptor<T>(
  descriptor: SingletonServiceDescriptor<T>,
): descriptor is ValueServiceDescriptor<T> {
  return "useValue" in descriptor
}

function toClassBindingOptions<T>(
  descriptor: ClassServiceDescriptor<T>,
  lifetime: ServiceLifetime,
): BindingOptions<T> & {
  dependencies?: readonly ServiceIdentifier<unknown>[]
} {
  return {
    lifetime,
    dependencies: descriptor.dependencies,
    order: descriptor.order,
    source: descriptor.source,
    onDispose: descriptor.onDispose,
  }
}

function toFactoryBindingOptions<T>(
  descriptor: FactoryServiceDescriptor<T>,
  lifetime: ServiceLifetime,
): BindingOptions<T> {
  return {
    lifetime,
    order: descriptor.order,
    source: descriptor.source,
    onDispose: descriptor.onDispose,
  }
}

export function createSingletonBinding<T>(
  descriptor: SingletonServiceDescriptor<T>,
): ServiceBinding<T> {
  // The Add* helpers are only sugar; they always compile back into the container's
  // primitive value/class/factory/alias binding model.
  if (isValueServiceDescriptor(descriptor)) {
    return asValue(descriptor.useValue, descriptor)
  }

  if (isClassServiceDescriptor(descriptor)) {
    return asClass(descriptor.useClass, toClassBindingOptions(descriptor, "singleton"))
  }

  return asFactory(descriptor.useFactory, toFactoryBindingOptions(descriptor, "singleton"))
}

export function createScopedBinding<T>(
  descriptor: ScopedServiceDescriptor<T>,
): ServiceBinding<T> {
  if (isClassServiceDescriptor(descriptor)) {
    return asClass(descriptor.useClass, toClassBindingOptions(descriptor, "scoped"))
  }

  return asFactory(descriptor.useFactory, toFactoryBindingOptions(descriptor, "scoped"))
}

export function createTransientBinding<T>(
  descriptor: TransientServiceDescriptor<T>,
): ServiceBinding<T> {
  if (isClassServiceDescriptor(descriptor)) {
    return asClass(descriptor.useClass, toClassBindingOptions(descriptor, "transient"))
  }

  return asFactory(descriptor.useFactory, toFactoryBindingOptions(descriptor, "transient"))
}

class DependencyScopeImpl implements DependencyScope {
  readonly id: string
  readonly label?: string
  readonly isRoot: boolean

  private disposed = false
  private readonly scopedCache = new Map<string, unknown>()
  private readonly disposables: TrackedDisposable[] = []
  private readonly trackedDisposableKeys = new Set<string>()
  private readonly resolutionStack: ResolutionFrame[] = []

  constructor(
    private readonly owner: DependencyContainerImpl,
    input: {
      id: string
      label?: string
      isRoot: boolean
    },
  ) {
    this.id = input.id
    this.label = input.label
    this.isRoot = input.isRoot
  }

  ensureActive() {
    if (this.disposed) {
      throw new ContainerDisposedError("Dependency scope has already been disposed", {
        scopeId: this.id,
        label: this.label,
      })
    }
    this.owner.ensureActive()
  }

  hasScopedValue(bindingId: string): boolean {
    return this.scopedCache.has(bindingId)
  }

  getScopedValue(bindingId: string): unknown {
    return this.scopedCache.get(bindingId)
  }

  setScopedValue(bindingId: string, value: unknown) {
    this.scopedCache.set(bindingId, value)
  }

  pushResolution(frame: ResolutionFrame) {
    this.resolutionStack.push(frame)
  }

  popResolution() {
    this.resolutionStack.pop()
  }

  hasActiveResolution(registrationId: string): boolean {
    return this.resolutionStack.some((item) => item.registrationId === registrationId)
  }

  getResolutionFrames(): ResolutionFrame[] {
    return [...this.resolutionStack]
  }

  hasSingletonParent(): boolean {
    // If the active resolution chain already contains a singleton, resolving a scoped dependency
    // here would accidentally capture scoped state inside a longer-lived object.
    return this.resolutionStack.some((item) => item.lifetime === "singleton")
  }

  trackDisposable<T>(
    binding: InternalBinding<T>,
    value: T,
    key: string,
  ) {
    const dispose = createDisposalHandler(binding, value)
    if (!dispose || this.trackedDisposableKeys.has(key)) {
      return
    }
    this.trackedDisposableKeys.add(key)
    this.disposables.push({
      key,
      description: binding.tokenDescription,
      dispose,
    })
  }

  resolve<T>(identifier: ServiceIdentifier<T>): T {
    this.ensureActive()
    return this.owner.resolveInScope(this, identifier)
  }

  tryResolve<T>(identifier: ServiceIdentifier<T>): T | undefined {
    this.ensureActive()
    if (!this.owner.has(identifier)) {
      return undefined
    }
    return this.owner.resolveInScope(this, identifier)
  }

  resolveAll<T>(identifier: ServiceIdentifier<T>): T[] {
    this.ensureActive()
    return this.owner.resolveAllInScope(this, identifier)
  }

  has(identifier: ServiceIdentifier<unknown>): boolean {
    this.ensureActive()
    return this.owner.has(identifier)
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.owner.unregisterScope(this)
    const failures: string[] = []
    while (this.disposables.length > 0) {
      const current = this.disposables.pop()
      if (!current) {
        continue
      }
      try {
        await current.dispose()
      } catch (error) {
        failures.push(
          `${current.description}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    this.scopedCache.clear()
    this.trackedDisposableKeys.clear()
    if (failures.length > 0) {
      throw new ContainerDisposedError(
        `Dependency scope disposal failed: ${failures.join("; ")}`,
        {
          scopeId: this.id,
          failures,
        },
      )
    }
  }
}

class DependencyContainerImpl implements DependencyContainer {
  private disposed = false
  private bindingSequence = 0
  private registrationSequence = 0
  private scopeSequence = 0
  private transientSequence = 0
  private readonly bindings = new Map<BindingLookupKey, InternalBinding<unknown>[]>()
  private readonly singletonCache = new Map<string, unknown>()
  private readonly loadedModules = new Set<string>()
  private readonly activeScopes = new Map<string, DependencyScopeImpl>()
  private readonly rootScope: DependencyScopeImpl

  constructor() {
    this.rootScope = new DependencyScopeImpl(this, {
      id: "root",
      isRoot: true,
    })
  }

  ensureActive() {
    if (this.disposed) {
      throw new ContainerDisposedError("Dependency container has been disposed")
    }
  }

  unregisterScope(scope: DependencyScopeImpl) {
    if (!scope.isRoot) {
      this.activeScopes.delete(scope.id)
    }
  }

  register<T>(
    identifier: ServiceIdentifier<T>,
    binding: ServiceBinding<T>,
  ): DependencyContainer {
    this.ensureActive()
    const normalized = this.normalizeBinding(identifier, binding)
    const lookupKey = this.toBindingLookupKey(identifier)
    const bucket = this.bindings.get(lookupKey) ?? []
    bucket.push(normalized)
    bucket.sort(compareBindings)
    this.bindings.set(lookupKey, bucket)
    return this
  }

  registerMany<T>(
    identifier: ServiceIdentifier<T>,
    bindings: readonly ServiceBinding<T>[],
  ): DependencyContainer {
    for (const binding of bindings) {
      this.register(identifier, binding)
    }
    return this
  }

  addSingleton<T>(
    identifier: ServiceIdentifier<T>,
    descriptor: SingletonServiceDescriptor<T>,
  ): DependencyContainer {
    return this.register(identifier, createSingletonBinding(descriptor))
  }

  addScoped<T>(
    identifier: ServiceIdentifier<T>,
    descriptor: ScopedServiceDescriptor<T>,
  ): DependencyContainer {
    return this.register(identifier, createScopedBinding(descriptor))
  }

  addTransient<T>(
    identifier: ServiceIdentifier<T>,
    descriptor: TransientServiceDescriptor<T>,
  ): DependencyContainer {
    return this.register(identifier, createTransientBinding(descriptor))
  }

  addAlias<T>(
    identifier: ServiceIdentifier<T>,
    target: ServiceIdentifier<T>,
    options?: AliasBindingOptions,
  ): DependencyContainer {
    return this.register(identifier, asAlias(target, options))
  }

  load(module: ContainerModule): DependencyContainer {
    this.ensureActive()
    const moduleId = normalizeModuleId(module.moduleId)
    if (this.loadedModules.has(moduleId)) {
      throw new ModuleAlreadyLoadedError(
        `Dependency module "${moduleId}" has already been loaded`,
        {
          moduleId,
        },
      )
    }
    module.register(this)
    this.loadedModules.add(moduleId)
    return this
  }

  has(identifier: ServiceIdentifier<unknown>): boolean {
    return (this.bindings.get(this.toBindingLookupKey(identifier))?.length ?? 0) > 0
  }

  createScope(label?: string): DependencyScope {
    this.ensureActive()
    this.scopeSequence += 1
    const scope = new DependencyScopeImpl(this, {
      id: `scope_${String(this.scopeSequence).padStart(4, "0")}`,
      label: label?.trim() || undefined,
      isRoot: false,
    })
    this.activeScopes.set(scope.id, scope)
    return scope
  }

  resolve<T>(identifier: ServiceIdentifier<T>): T {
    this.ensureActive()
    return this.resolveInScope(this.rootScope, identifier)
  }

  tryResolve<T>(identifier: ServiceIdentifier<T>): T | undefined {
    this.ensureActive()
    if (!this.has(identifier)) {
      return undefined
    }
    return this.resolveInScope(this.rootScope, identifier)
  }

  resolveAll<T>(identifier: ServiceIdentifier<T>): T[] {
    this.ensureActive()
    return this.resolveAllInScope(this.rootScope, identifier)
  }

  listRegistrations(identifier?: ServiceIdentifier<unknown>): RegistrationInfo[] {
    const rows = identifier
      ? this.bindings.get(this.toBindingLookupKey(identifier)) ?? []
      : [...this.bindings.values()].flat()
    return rows
      .slice()
      .sort(compareBindings)
      .map((binding) => ({
        registrationId: binding.registrationId,
        tokenDescription: binding.tokenDescription,
        bindingKind: binding.kind,
        lifetime: bindingLifetime(binding),
        order: binding.order,
        source: binding.source,
      }))
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    const failures: string[] = []

    const scopes = [...this.activeScopes.values()]
    this.activeScopes.clear()
    for (const scope of scopes.reverse()) {
      try {
        await scope.dispose()
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }

    try {
      await this.rootScope.dispose()
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }

    this.singletonCache.clear()
    this.bindings.clear()
    this.loadedModules.clear()

    if (failures.length > 0) {
      throw new ContainerDisposedError(
        `Dependency container disposal failed: ${failures.join("; ")}`,
        {
          failures,
        },
      )
    }
  }

  resolveInScope<T>(
    scope: DependencyScopeImpl,
    identifier: ServiceIdentifier<T>,
  ): T {
    const bindings = this.getBindings(identifier)
    if (bindings.length === 0) {
      throw new ServiceNotFoundError(
        `Service "${describeServiceIdentifier(identifier)}" is not registered`,
        {
          token: describeServiceIdentifier(identifier),
        },
      )
    }
    if (bindings.length > 1) {
      throw new MultipleServiceBindingsError(
        `Service "${describeServiceIdentifier(identifier)}" has multiple bindings. Use resolveAll() instead.`,
        {
          token: describeServiceIdentifier(identifier),
          count: bindings.length,
        },
      )
    }
    return this.resolveBinding(scope, bindings[0] as InternalBinding<T>)
  }

  resolveAllInScope<T>(
    scope: DependencyScopeImpl,
    identifier: ServiceIdentifier<T>,
  ): T[] {
    const bindings = this.getBindings(identifier) as InternalBinding<T>[]
    if (bindings.length === 0) {
      return []
    }
    return bindings.map((binding) => this.resolveBinding(scope, binding))
  }

  private getBindings<T>(
    identifier: ServiceIdentifier<T>,
  ): InternalBinding<T>[] {
    return (this.bindings.get(this.toBindingLookupKey(identifier)) ?? []) as InternalBinding<T>[]
  }

  private toBindingLookupKey(identifier: ServiceIdentifier<unknown>): BindingLookupKey {
    return isServiceToken(identifier) ? identifier.key : identifier
  }

  private normalizeBinding<T>(
    identifier: ServiceIdentifier<T>,
    binding: ServiceBinding<T>,
  ): InternalBinding<T> {
    this.registrationSequence += 1
    this.bindingSequence += 1
    const registrationId = `binding_${String(this.registrationSequence).padStart(5, "0")}`
    const tokenDescription = describeServiceIdentifier(identifier)
    const sequence = this.bindingSequence
    const disposeValue =
      "onDispose" in binding && typeof binding.onDispose === "function"
        ? async (value: unknown) => {
            await binding.onDispose?.(value as T)
          }
        : undefined

    if (binding.kind === "value") {
      return {
        kind: "value",
        value: binding.value,
        order: binding.order,
        source: binding.source,
        disposeValue,
        registrationId,
        token: identifier,
        tokenDescription,
        sequence,
      }
    }

    if (binding.kind === "alias") {
      return {
        kind: "alias",
        target: binding.target,
        order: binding.order,
        source: binding.source,
        disposeValue,
        registrationId,
        token: identifier,
        tokenDescription,
        sequence,
      }
    }

    if (binding.kind === "factory") {
      return {
        kind: "factory",
        factory: binding.factory,
        lifetime: binding.lifetime,
        order: binding.order,
        source: binding.source,
        disposeValue,
        registrationId,
        token: identifier,
        tokenDescription,
        sequence,
      }
    }

    return {
      kind: "class",
      implementation: binding.implementation,
      dependencies: binding.dependencies,
      lifetime: binding.lifetime,
      order: binding.order,
      source: binding.source,
      disposeValue,
      registrationId,
      token: identifier,
      tokenDescription,
      sequence,
    }
  }

  private resolveBinding<T>(
    scope: DependencyScopeImpl,
    binding: InternalBinding<T>,
  ): T {
    if (scope.hasActiveResolution(binding.registrationId)) {
      const path = [
        ...scope.getResolutionFrames(),
        {
          registrationId: binding.registrationId,
          tokenDescription: binding.tokenDescription,
          lifetime: bindingLifetime(binding),
        },
      ]
      throw new CircularDependencyError(
        `Circular dependency detected: ${createResolutionPath(path)}`,
        {
          path: path.map((item) => item.tokenDescription),
        },
      )
    }

    const lifetime = bindingLifetime(binding)
    if (lifetime === "singleton") {
      if (this.singletonCache.has(binding.registrationId)) {
        return this.singletonCache.get(binding.registrationId) as T
      }
      const created = this.instantiateBinding(scope, binding)
      this.singletonCache.set(binding.registrationId, created)
      this.rootScope.trackDisposable(binding, created, `singleton:${binding.registrationId}`)
      return created
    }

    if (lifetime === "scoped") {
      if (scope.isRoot) {
        throw new ScopedServiceResolutionError(
          `Scoped service "${binding.tokenDescription}" cannot be resolved from the root container`,
          {
            token: binding.tokenDescription,
          },
        )
      }
      // Reject singleton -> scoped capture even when the resolve started from a child scope.
      if (scope.hasSingletonParent()) {
        throw new ScopedServiceResolutionError(
          `Scoped service "${binding.tokenDescription}" cannot be captured by a singleton dependency chain`,
          {
            token: binding.tokenDescription,
            path: scope.getResolutionFrames().map((item) => item.tokenDescription),
          },
        )
      }
      if (scope.hasScopedValue(binding.registrationId)) {
        return scope.getScopedValue(binding.registrationId) as T
      }
      const created = this.instantiateBinding(scope, binding)
      scope.setScopedValue(binding.registrationId, created)
      scope.trackDisposable(binding, created, `scoped:${binding.registrationId}`)
      return created
    }

    const created = this.instantiateBinding(scope, binding)
    this.transientSequence += 1
    scope.trackDisposable(
      binding,
      created,
      `transient:${binding.registrationId}:${this.transientSequence}`,
    )
    return created
  }

  private instantiateBinding<T>(
    scope: DependencyScopeImpl,
    binding: InternalBinding<T>,
  ): T {
    scope.pushResolution({
      registrationId: binding.registrationId,
      tokenDescription: binding.tokenDescription,
      lifetime: bindingLifetime(binding),
    })
    try {
      const context = this.createResolutionContext(scope, binding.token)
      if (binding.kind === "value") {
        return binding.value
      }
      if (binding.kind === "alias") {
        return context.resolve(binding.target)
      }
      if (binding.kind === "factory") {
        return binding.factory(context)
      }
      const dependencies = binding.dependencies ?? binding.implementation.inject ?? []
      const args = dependencies.map((item) => context.resolve(item))
      return new binding.implementation(...args)
    } finally {
      scope.popResolution()
    }
  }

  private createResolutionContext(
    scope: DependencyScopeImpl,
    token: ServiceIdentifier<unknown>,
  ): ResolutionContext {
    return {
      container: this,
      scope,
      token,
      resolve: <T>(identifier: ServiceIdentifier<T>) =>
        this.resolveInScope(scope, identifier),
      tryResolve: <T>(identifier: ServiceIdentifier<T>) => {
        if (!this.has(identifier)) {
          return undefined
        }
        return this.resolveInScope(scope, identifier)
      },
      resolveAll: <T>(identifier: ServiceIdentifier<T>) =>
        this.resolveAllInScope(scope, identifier),
      has: (identifier: ServiceIdentifier<unknown>) => this.has(identifier),
    }
  }
}

export function asClass<T>(
  implementation: InjectableClass<T>,
  options?: BindingOptions<T> & {
    dependencies?: readonly ServiceIdentifier<unknown>[]
  },
): ClassBinding<T> {
  return {
    kind: "class",
    implementation,
    dependencies: options?.dependencies,
    lifetime: options?.lifetime ?? "transient",
    order: normalizeOrder(options?.order),
    source: options?.source?.trim() || undefined,
    onDispose: options?.onDispose,
  }
}

export function asFactory<T>(
  factory: (context: ResolutionContext) => T,
  options?: BindingOptions<T>,
): FactoryBinding<T> {
  return {
    kind: "factory",
    factory,
    lifetime: options?.lifetime ?? "transient",
    order: normalizeOrder(options?.order),
    source: options?.source?.trim() || undefined,
    onDispose: options?.onDispose,
  }
}

export function asValue<T>(
  value: T,
  options?: ValueBindingOptions<T>,
): ValueBinding<T> {
  return {
    kind: "value",
    value,
    order: normalizeOrder(options?.order),
    source: options?.source?.trim() || undefined,
    onDispose: options?.onDispose,
  }
}

export function asAlias<T>(
  target: ServiceIdentifier<T>,
  options?: AliasBindingOptions,
): AliasBinding<T> {
  return {
    kind: "alias",
    target,
    order: normalizeOrder(options?.order),
    source: options?.source?.trim() || undefined,
  }
}

export function defineContainerModule(input: ContainerModule): ContainerModule {
  return {
    moduleId: normalizeModuleId(input.moduleId),
    register: input.register,
  }
}

export function createContainer(): DependencyContainer {
  return new DependencyContainerImpl()
}

export type {
  InjectableClass,
  ServiceIdentifier,
  ServiceToken,
}
