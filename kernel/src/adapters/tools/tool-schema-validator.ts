import type { KernelError } from "../../core"

type ValidationState = {
  path: string
  errors: string[]
}

function readSchemaTypes(schema: Record<string, unknown>): string[] {
  return Array.isArray(schema.type)
    ? schema.type.filter((item): item is string => typeof item === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}

function readNormalizedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  const normalized = readNormalizedString(value)
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseBooleanString(value: unknown): boolean | undefined {
  const normalized = readNormalizedString(value)?.toLowerCase()
  if (normalized === "true") {
    return true
  }
  if (normalized === "false") {
    return false
  }
  return undefined
}

function schemaAllowsNull(schema: unknown): boolean {
  if (!isRecord(schema)) {
    return false
  }

  if (schema.const === null) {
    return true
  }

  if (Array.isArray(schema.enum) && schema.enum.some((item) => item === null)) {
    return true
  }

  if (readSchemaTypes(schema).includes("null")) {
    return true
  }

  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : []
  if (oneOf.some((item) => schemaAllowsNull(item))) {
    return true
  }

  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : []
  return anyOf.some((item) => schemaAllowsNull(item))
}

function normalizeAgainstSchema(
  value: unknown,
  schema: unknown,
): unknown {
  if (!isRecord(schema)) {
    return value
  }

  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : undefined
  if (oneOf && oneOf.length > 0) {
    for (const branch of oneOf) {
      const normalized = normalizeAgainstSchema(value, branch)
      const state: ValidationState = {
        path: "$",
        errors: [],
      }
      validateAgainstSchema(normalized, branch, state)
      if (state.errors.length === 0) {
        return normalized
      }
    }
    return value
  }

  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : undefined
  if (anyOf && anyOf.length > 0) {
    for (const branch of anyOf) {
      const normalized = normalizeAgainstSchema(value, branch)
      const state: ValidationState = {
        path: "$",
        errors: [],
      }
      validateAgainstSchema(normalized, branch, state)
      if (state.errors.length === 0) {
        return normalized
      }
    }
    return value
  }

  const expectedTypes = readSchemaTypes(schema)

  if (value === null) {
    return value
  }

  if (expectedTypes.includes("integer")) {
    const parsed = parseFiniteNumber(value)
    if (parsed !== undefined && Number.isInteger(parsed)) {
      return parsed
    }
  }

  if (expectedTypes.includes("number")) {
    const parsed = parseFiniteNumber(value)
    if (parsed !== undefined) {
      return parsed
    }
  }

  if (expectedTypes.includes("boolean")) {
    const parsed = parseBooleanString(value)
    if (parsed !== undefined) {
      return parsed
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAgainstSchema(item, schema.items))
  }

  if (!isPlainObject(value)) {
    return value
  }

  const properties = isRecord(schema.properties) ? schema.properties : {}
  const additionalPropertiesSchema =
    schema.additionalProperties && isRecord(schema.additionalProperties)
      ? schema.additionalProperties
      : undefined
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [],
  )

  const normalizedEntries: Array<[string, unknown]> = []
  for (const [key, item] of Object.entries(value)) {
    const propertySchema = key in properties
      ? properties[key]
      : additionalPropertiesSchema

    if (
      key in properties
      && item === null
      && !required.has(key)
      && !schemaAllowsNull(propertySchema)
    ) {
      continue
    }

    normalizedEntries.push([
      key,
      propertySchema === undefined
        ? item
        : normalizeAgainstSchema(item, propertySchema),
    ])
  }

  return Object.fromEntries(normalizedEntries)
}

function isTypeMatch(value: unknown, type: string): boolean {
  switch (type) {
    case "null":
      return value === null
    case "boolean":
      return typeof value === "boolean"
    case "string":
      return typeof value === "string"
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
    case "array":
      return Array.isArray(value)
    case "object":
      return isPlainObject(value)
    default:
      return true
  }
}

function pushError(state: ValidationState, message: string) {
  state.errors.push(`${state.path}: ${message}`)
}

function validateAgainstSchema(
  value: unknown,
  schema: unknown,
  state: ValidationState,
): void {
  if (!isRecord(schema)) {
    return
  }

  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : undefined
  if (oneOf && oneOf.length > 0) {
    const matched = oneOf.some((item) => {
      const branchState: ValidationState = {
        path: state.path,
        errors: [],
      }
      validateAgainstSchema(value, item, branchState)
      return branchState.errors.length === 0
    })
    if (!matched) {
      pushError(state, "must match one of the allowed schemas")
    }
    return
  }

  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : undefined
  if (anyOf && anyOf.length > 0) {
    const matched = anyOf.some((item) => {
      const branchState: ValidationState = {
        path: state.path,
        errors: [],
      }
      validateAgainstSchema(value, item, branchState)
      return branchState.errors.length === 0
    })
    if (!matched) {
      pushError(state, "must match at least one allowed schema")
    }
    return
  }

  if ("const" in schema && value !== schema.const) {
    pushError(state, `must equal ${JSON.stringify(schema.const)}`)
    return
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0 && !schema.enum.some((item) => item === value)) {
    pushError(state, `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`)
    return
  }

  const expectedTypes = Array.isArray(schema.type)
    ? schema.type.filter((item): item is string => typeof item === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : []

  if (expectedTypes.length > 0 && !expectedTypes.some((type) => isTypeMatch(value, type))) {
    pushError(state, `must be of type ${expectedTypes.join(" | ")}`)
    return
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      pushError(state, `must have minLength ${schema.minLength}`)
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      pushError(state, `must have maxLength ${schema.maxLength}`)
    }
    return
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      pushError(state, `must be >= ${schema.minimum}`)
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      pushError(state, `must be <= ${schema.maximum}`)
    }
    return
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      pushError(state, `must have at least ${schema.minItems} items`)
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      pushError(state, `must have at most ${schema.maxItems} items`)
    }
    for (const [index, item] of value.entries()) {
      validateAgainstSchema(item, schema.items, {
        path: `${state.path}[${index}]`,
        errors: state.errors,
      })
    }
    return
  }

  if (!isPlainObject(value)) {
    return
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : []
  for (const key of required) {
    if (!(key in value)) {
      state.errors.push(`${state.path}.${key}: is required`)
    }
  }

  const properties = isRecord(schema.properties) ? schema.properties : {}
  for (const [key, item] of Object.entries(value)) {
    if (key in properties) {
      validateAgainstSchema(item, properties[key], {
        path: `${state.path}.${key}`,
        errors: state.errors,
      })
      continue
    }

    if (schema.additionalProperties === false) {
      state.errors.push(`${state.path}.${key}: is not allowed`)
      continue
    }

    if (schema.additionalProperties && isRecord(schema.additionalProperties)) {
      validateAgainstSchema(item, schema.additionalProperties, {
        path: `${state.path}.${key}`,
        errors: state.errors,
      })
    }
  }
}

export function validateToolInputSchema(input: {
  toolName: string
  schema: Record<string, unknown>
  value: unknown
}): {
  ok: true
} | {
  ok: false
  error: KernelError
} {
  const state: ValidationState = {
    path: `$${input.toolName}`,
    errors: [],
  }

  validateAgainstSchema(input.value, input.schema, state)

  if (state.errors.length === 0) {
    return {
      ok: true,
    }
  }

  return {
    ok: false,
    error: {
      code: "tool_input_invalid",
      message: `Tool input validation failed for ${input.toolName}`,
      retryable: false,
      metadata: {
        toolName: input.toolName,
        errors: state.errors,
      },
    },
  }
}

export function normalizeToolInputForSchema(input: {
  schema: Record<string, unknown>
  value: unknown
}): unknown {
  return normalizeAgainstSchema(input.value, input.schema)
}
