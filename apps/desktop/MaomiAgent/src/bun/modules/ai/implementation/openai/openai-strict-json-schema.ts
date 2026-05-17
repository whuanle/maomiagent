function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSchemaEntry(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSchemaEntry(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return normalizeSchema(value);
}

function isNullSchema(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "null") {
    return true;
  }

  if (Array.isArray(value.type) && value.type.length === 1 && value.type[0] === "null") {
    return true;
  }

  if ("const" in value && value.const === null) {
    return true;
  }

  return Array.isArray(value.enum) && value.enum.length === 1 && value.enum[0] === null;
}

function schemaAllowsNull(schema: Record<string, unknown>): boolean {
  if (schema.type === "null") {
    return true;
  }

  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    return true;
  }

  if ("const" in schema && schema.const === null) {
    return true;
  }

  if (Array.isArray(schema.enum) && schema.enum.some((item) => item === null)) {
    return true;
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.some((item) => isNullSchema(item))) {
    return true;
  }

  return Array.isArray(schema.oneOf) && schema.oneOf.some((item) => isNullSchema(item));
}

function makeSchemaNullable(value: unknown): unknown {
  if (!isRecord(value)) {
    return {
      anyOf: [value, { type: "null" }],
    };
  }

  if (schemaAllowsNull(value)) {
    return value;
  }

  if (Array.isArray(value.anyOf)) {
    return {
      ...value,
      anyOf: [...value.anyOf, { type: "null" }],
    };
  }

  if (Array.isArray(value.oneOf)) {
    return {
      ...value,
      oneOf: [...value.oneOf, { type: "null" }],
    };
  }

  return {
    anyOf: [value, { type: "null" }],
  };
}

function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...schema,
  };

  if (isRecord(schema.properties)) {
    const propertyNames = Object.keys(schema.properties);
    const required = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((item): item is string => typeof item === "string")
        : [],
    );
    const normalizedProperties: Record<string, unknown> = {};

    for (const propertyName of propertyNames) {
      const propertySchema = normalizeSchemaEntry(schema.properties[propertyName]);
      normalizedProperties[propertyName] = required.has(propertyName)
        ? propertySchema
        : makeSchemaNullable(propertySchema);
    }

    normalized.properties = normalizedProperties;
    normalized.required = propertyNames;
  }

  if (isRecord(schema.items)) {
    normalized.items = normalizeSchema(schema.items);
  } else if (Array.isArray(schema.items)) {
    normalized.items = schema.items.map((item) => normalizeSchemaEntry(item));
  }

  if (isRecord(schema.additionalProperties)) {
    normalized.additionalProperties = normalizeSchema(schema.additionalProperties);
  }

  if (Array.isArray(schema.allOf)) {
    normalized.allOf = schema.allOf.map((item) => normalizeSchemaEntry(item));
  }

  if (Array.isArray(schema.anyOf)) {
    normalized.anyOf = schema.anyOf.map((item) => normalizeSchemaEntry(item));
  }

  if (Array.isArray(schema.oneOf)) {
    normalized.oneOf = schema.oneOf.map((item) => normalizeSchemaEntry(item));
  }

  if (Array.isArray(schema.prefixItems)) {
    normalized.prefixItems = schema.prefixItems.map((item) => normalizeSchemaEntry(item));
  }

  if (isRecord(schema.not)) {
    normalized.not = normalizeSchema(schema.not);
  }

  if (isRecord(schema.contains)) {
    normalized.contains = normalizeSchema(schema.contains);
  }

  if (isRecord(schema.if)) {
    normalized.if = normalizeSchema(schema.if);
  }

  if (isRecord(schema.then)) {
    normalized.then = normalizeSchema(schema.then);
  }

  if (isRecord(schema.else)) {
    normalized.else = normalizeSchema(schema.else);
  }

  if (isRecord(schema.propertyNames)) {
    normalized.propertyNames = normalizeSchema(schema.propertyNames);
  }

  if (isRecord(schema.$defs)) {
    const normalizedDefs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.$defs)) {
      normalizedDefs[key] = normalizeSchemaEntry(value);
    }
    normalized.$defs = normalizedDefs;
  }

  if (isRecord(schema.definitions)) {
    const normalizedDefinitions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.definitions)) {
      normalizedDefinitions[key] = normalizeSchemaEntry(value);
    }
    normalized.definitions = normalizedDefinitions;
  }

  if (isRecord(schema.patternProperties)) {
    const normalizedPatternProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.patternProperties)) {
      normalizedPatternProperties[key] = normalizeSchemaEntry(value);
    }
    normalized.patternProperties = normalizedPatternProperties;
  }

  if (isRecord(schema.dependentSchemas)) {
    const normalizedDependentSchemas: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.dependentSchemas)) {
      normalizedDependentSchemas[key] = normalizeSchemaEntry(value);
    }
    normalized.dependentSchemas = normalizedDependentSchemas;
  }

  return normalized;
}

export function normalizeOpenAIStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return normalizeSchema(schema);
}