export class DiContainerError extends Error {
  code: string
  data?: Record<string, unknown>

  constructor(code: string, message: string, data?: Record<string, unknown>) {
    super(message)
    this.name = "DiContainerError"
    this.code = code
    this.data = data
  }
}

export class ServiceNotFoundError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("SERVICE_NOT_FOUND", message, data)
    this.name = "ServiceNotFoundError"
  }
}

export class MultipleServiceBindingsError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("MULTIPLE_SERVICE_BINDINGS", message, data)
    this.name = "MultipleServiceBindingsError"
  }
}

export class CircularDependencyError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("CIRCULAR_DEPENDENCY", message, data)
    this.name = "CircularDependencyError"
  }
}

export class ScopedServiceResolutionError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("SCOPED_SERVICE_RESOLUTION", message, data)
    this.name = "ScopedServiceResolutionError"
  }
}

export class ContainerDisposedError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("CONTAINER_DISPOSED", message, data)
    this.name = "ContainerDisposedError"
  }
}

export class ModuleAlreadyLoadedError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("MODULE_ALREADY_LOADED", message, data)
    this.name = "ModuleAlreadyLoadedError"
  }
}

export class InvalidDependencyModuleError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("INVALID_DEPENDENCY_MODULE", message, data)
    this.name = "InvalidDependencyModuleError"
  }
}

export class ModuleDependencyCycleError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("MODULE_DEPENDENCY_CYCLE", message, data)
    this.name = "ModuleDependencyCycleError"
  }
}

export class ModuleExportNotFoundError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("MODULE_EXPORT_NOT_FOUND", message, data)
    this.name = "ModuleExportNotFoundError"
  }
}

export class DuplicateModuleIdentifierError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("DUPLICATE_MODULE_IDENTIFIER", message, data)
    this.name = "DuplicateModuleIdentifierError"
  }
}

export class ModuleLifecycleError extends DiContainerError {
  constructor(message: string, data?: Record<string, unknown>) {
    super("MODULE_LIFECYCLE_ERROR", message, data)
    this.name = "ModuleLifecycleError"
  }
}
