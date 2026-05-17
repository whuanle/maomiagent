import type { AiExecutionProfileRef } from "../contracts"
import type { KernelMetadata } from "../../src/core"

export type RuntimeExecutionProfileDefinition = {
  ref: AiExecutionProfileRef
  enabled?: boolean
  metadata?: KernelMetadata
}

export type RuntimeExecutionProfileCatalogEntry = {
  id: string
  enabled?: boolean
  executionProfiles: readonly RuntimeExecutionProfileDefinition[]
  metadata?: KernelMetadata
}

function matchesExecutionProfileRef(left: AiExecutionProfileRef, right: AiExecutionProfileRef): boolean {
  return left.id === right.id
}

function cloneExecutionProfileRef(profile: AiExecutionProfileRef): AiExecutionProfileRef {
  return {
    id: profile.id,
    metadata: profile.metadata ? { ...profile.metadata } : undefined,
  }
}

function cloneExecutionProfileDefinition(
  executionProfile: RuntimeExecutionProfileDefinition,
): RuntimeExecutionProfileDefinition {
  return {
    ...executionProfile,
    ref: cloneExecutionProfileRef(executionProfile.ref),
    metadata: executionProfile.metadata ? { ...executionProfile.metadata } : undefined,
  }
}

function cloneCatalogEntry(
  catalogEntry: RuntimeExecutionProfileCatalogEntry,
): RuntimeExecutionProfileCatalogEntry {
  return {
    ...catalogEntry,
    executionProfiles: catalogEntry.executionProfiles.map(cloneExecutionProfileDefinition),
    metadata: catalogEntry.metadata ? { ...catalogEntry.metadata } : undefined,
  }
}

function normalizeCatalogEntries(
  catalogEntries: readonly RuntimeExecutionProfileCatalogEntry[],
): RuntimeExecutionProfileCatalogEntry[] {
  const knownCatalogEntryIds = new Set<string>()
  const knownProfiles = new Set<string>()
  const normalized: RuntimeExecutionProfileCatalogEntry[] = []

  for (const catalogEntry of catalogEntries) {
    if (catalogEntry.enabled === false) {
      continue
    }

    if (knownCatalogEntryIds.has(catalogEntry.id)) {
      throw new Error(`Runtime execution profile registry received duplicate catalog entry id: ${catalogEntry.id}`)
    }

    knownCatalogEntryIds.add(catalogEntry.id)
    const executionProfiles: RuntimeExecutionProfileDefinition[] = []
    for (const executionProfile of catalogEntry.executionProfiles) {
      if (executionProfile.enabled === false) {
        continue
      }

      const key = executionProfile.ref.id
      if (knownProfiles.has(key)) {
        throw new Error(`Runtime execution profile registry received duplicate execution profile ref: ${key}`)
      }

      knownProfiles.add(key)
      executionProfiles.push(cloneExecutionProfileDefinition(executionProfile))
    }

    normalized.push({
      ...catalogEntry,
      executionProfiles,
      metadata: catalogEntry.metadata ? { ...catalogEntry.metadata } : undefined,
    })
  }

  return normalized
}

export class ExecutionProfileRegistry {
  private readonly catalogEntries: readonly RuntimeExecutionProfileCatalogEntry[]

  constructor(catalogEntries: readonly RuntimeExecutionProfileCatalogEntry[] = []) {
    this.catalogEntries = normalizeCatalogEntries(catalogEntries)
  }

  listCatalogEntries(): readonly RuntimeExecutionProfileCatalogEntry[] {
    return this.catalogEntries.map(cloneCatalogEntry)
  }

  listExecutionProfiles(): readonly AiExecutionProfileRef[] {
    return this.catalogEntries.flatMap((catalogEntry) =>
      catalogEntry.executionProfiles.map((executionProfile) => cloneExecutionProfileRef(executionProfile.ref)))
  }

  getCatalogEntry(id: string): RuntimeExecutionProfileCatalogEntry | undefined {
    const catalogEntry = this.catalogEntries.find((candidate) => candidate.id === id)
    return catalogEntry ? cloneCatalogEntry(catalogEntry) : undefined
  }

  getExecutionProfile(ref: AiExecutionProfileRef): RuntimeExecutionProfileDefinition | undefined {
    const executionProfile = this.catalogEntries
      .flatMap((catalogEntry) => catalogEntry.executionProfiles)
      .find((candidate) => matchesExecutionProfileRef(candidate.ref, ref))
    return executionProfile ? cloneExecutionProfileDefinition(executionProfile) : undefined
  }
}
