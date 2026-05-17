export type InjectableClass<T> = {
  new (...args: unknown[]): T
  inject?: readonly ServiceIdentifier<unknown>[]
}

export type ServiceToken<T> = {
  readonly kind: "service-token"
  readonly key: symbol
  readonly description: string
}

export type ServiceIdentifier<T> = ServiceToken<T> | InjectableClass<T>

const GLOBAL_SERVICE_TOKEN_PREFIX = "maomi.di.service"

function normalizeDescription(value: string): string {
  const trimmed = value.trim()
  return trimmed || "anonymous"
}

function normalizeNamespace(value: string): string {
  return value
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(".")
}

function qualifyDescription(namespace: string, description: string): string {
  const normalizedDescription = normalizeDescription(description)
  const normalizedNamespace = normalizeNamespace(namespace)
  return normalizedNamespace
    ? `${normalizedNamespace}.${normalizedDescription}`
    : normalizedDescription
}

export type ServiceNamespace = {
  readonly namespace: string
  readonly qualify: (description: string) => string
  readonly token: <T>(description: string) => ServiceToken<T>
  readonly child: (segment: string) => ServiceNamespace
}

export function createServiceToken<T>(description: string): ServiceToken<T> {
  const normalized = normalizeDescription(description)
  return {
    kind: "service-token",
    key: Symbol.for(`${GLOBAL_SERVICE_TOKEN_PREFIX}:${normalized}`),
    description: normalized,
  }
}

export function isServiceToken(value: unknown): value is ServiceToken<unknown> {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as Partial<ServiceToken<unknown>>
  return candidate.kind === "service-token"
    && typeof candidate.key === "symbol"
    && typeof candidate.description === "string"
}

export function describeServiceIdentifier(
  identifier: ServiceIdentifier<unknown>,
): string {
  if (isServiceToken(identifier)) {
    return identifier.description
  }
  return typeof identifier.name === "string" && identifier.name.trim()
    ? identifier.name.trim()
    : "AnonymousClass"
}

export function createServiceNamespace(namespace: string): ServiceNamespace {
  const normalized = normalizeNamespace(namespace)
  return {
    namespace: normalized,
    qualify(description) {
      return qualifyDescription(normalized, description)
    },
    token<T>(description: string) {
      return createServiceToken<T>(qualifyDescription(normalized, description))
    },
    child(segment: string) {
      return createServiceNamespace(qualifyDescription(normalized, segment))
    },
  }
}
