import type { InteractionRecord, RunRecord, SessionRecord } from "../../core"
import {
  toRuntimePendingInteractionView,
  type RuntimePendingInteractionView,
} from "./runtime-interaction-view"

export interface PendingInteractionHostPort {
  syncRun(input: {
    session: SessionRecord
    run: RunRecord
    interactions: readonly InteractionRecord[]
  }): void

  settle(input: {
    interaction: InteractionRecord
    workspaceId?: string
  }): void

  listPendingByRun(runId: InteractionRecord["runId"]): readonly RuntimePendingInteractionView[]
  listPendingBySession(
    sessionId: InteractionRecord["sessionId"],
  ): readonly RuntimePendingInteractionView[]
  listPendingByWorkspace(workspaceId: string): readonly RuntimePendingInteractionView[]
}

type EntryRecord = RuntimePendingInteractionView

function cloneEntry(entry: EntryRecord): EntryRecord {
  return {
    ...entry,
  }
}

function sortEntries<T extends EntryRecord>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    return left.id.localeCompare(right.id)
  })
}

export class PendingInteractionHost implements PendingInteractionHostPort {
  private readonly entriesByInteractionId = new Map<InteractionRecord["id"], EntryRecord>()
  private readonly runIndex = new Map<InteractionRecord["runId"], Set<InteractionRecord["id"]>>()
  private readonly sessionIndex = new Map<InteractionRecord["sessionId"], Set<InteractionRecord["id"]>>()
  private readonly workspaceIndex = new Map<string, Set<InteractionRecord["id"]>>()

  syncRun(input: {
    session: SessionRecord
    run: RunRecord
    interactions: readonly InteractionRecord[]
  }): void {
    const existingIds = Array.from(this.runIndex.get(input.run.id) ?? [])
    for (const interactionId of existingIds) {
      this.remove(interactionId)
    }

    for (const interaction of input.interactions) {
      if (interaction.status !== "pending") {
        continue
      }

      this.upsert(toRuntimePendingInteractionView({
        interaction,
        session: input.session,
      }))
    }
  }

  settle(input: {
    interaction: InteractionRecord
    workspaceId?: string
  }): void {
    if (input.interaction.status !== "pending") {
      this.remove(input.interaction.id)
      return
    }

    this.upsert(toRuntimePendingInteractionView({
      interaction: input.interaction,
      workspaceId: input.workspaceId,
    }))
  }

  listPendingByRun(runId: InteractionRecord["runId"]): readonly RuntimePendingInteractionView[] {
    return this.collect(this.runIndex.get(runId))
  }

  listPendingBySession(
    sessionId: InteractionRecord["sessionId"],
  ): readonly RuntimePendingInteractionView[] {
    return this.collect(this.sessionIndex.get(sessionId))
  }

  listPendingByWorkspace(workspaceId: string): readonly RuntimePendingInteractionView[] {
    return this.collect(this.workspaceIndex.get(workspaceId.trim()))
  }

  private collect(ids: ReadonlySet<InteractionRecord["id"]> | undefined): RuntimePendingInteractionView[] {
    if (!ids || ids.size === 0) {
      return []
    }

    return sortEntries(
      Array.from(ids)
        .map((interactionId) => this.entriesByInteractionId.get(interactionId))
        .filter((entry): entry is EntryRecord => Boolean(entry))
        .map((entry) => cloneEntry(entry)),
    )
  }

  private upsert(entry: EntryRecord): void {
    this.remove(entry.id)

    this.entriesByInteractionId.set(entry.id, entry)
    this.addToIndex(this.runIndex, entry.runId, entry.id)
    this.addToIndex(this.sessionIndex, entry.sessionId, entry.id)
    if (entry.workspaceId) {
      this.addToIndex(this.workspaceIndex, entry.workspaceId, entry.id)
    }
  }

  private remove(interactionId: InteractionRecord["id"]): void {
    const current = this.entriesByInteractionId.get(interactionId)
    if (!current) {
      return
    }

    this.entriesByInteractionId.delete(interactionId)
    this.removeFromIndex(this.runIndex, current.runId, interactionId)
    this.removeFromIndex(this.sessionIndex, current.sessionId, interactionId)
    if (current.workspaceId) {
      this.removeFromIndex(this.workspaceIndex, current.workspaceId, interactionId)
    }
  }

  private addToIndex<TKey>(
    index: Map<TKey, Set<InteractionRecord["id"]>>,
    key: TKey,
    interactionId: InteractionRecord["id"],
  ): void {
    const current = index.get(key)
    if (current) {
      current.add(interactionId)
      return
    }

    index.set(key, new Set([interactionId]))
  }

  private removeFromIndex<TKey>(
    index: Map<TKey, Set<InteractionRecord["id"]>>,
    key: TKey,
    interactionId: InteractionRecord["id"],
  ): void {
    const current = index.get(key)
    if (!current) {
      return
    }

    current.delete(interactionId)
    if (current.size === 0) {
      index.delete(key)
    }
  }
}