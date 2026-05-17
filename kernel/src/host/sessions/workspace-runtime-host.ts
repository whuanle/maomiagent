import type { TimestampMs } from "../../core"
import type { SessionId } from "../../core"
import {
  formatWorkspaceRuntimeIdentityKey,
  resolveWorkspaceRuntimeIdentity,
  type WorkspaceBinding,
  type WorkspaceRuntimeIdentity,
} from "../workspace"

export const WORKSPACE_RUNTIME_HOST_STATE_VALUES = [
  "new",
  "ready",
  "suspect",
  "broken",
] as const

export type WorkspaceRuntimeHostState = (typeof WORKSPACE_RUNTIME_HOST_STATE_VALUES)[number]

export type WorkspaceRuntimeLeaseInput = {
  sessionId?: SessionId
  binding?: WorkspaceBinding
}

export type WorkspaceRuntimeLease<TResource> = {
  leaseId: string
  hostId: string
  sessionId?: SessionId
  host: TResource
  identity: WorkspaceRuntimeIdentity
  state: WorkspaceRuntimeHostState
  reason?: string
  activeLeaseCount: number
}

export type WorkspaceRuntimeHostSnapshot = {
  hostId: string
  identity: WorkspaceRuntimeIdentity
  state: WorkspaceRuntimeHostState
  reason?: string
  activeLeaseCount: number
  activeSessionIds: readonly SessionId[]
  createdAt: TimestampMs
  updatedAt: TimestampMs
}

export type WorkspaceRuntimeInvalidateInput = {
  hostId?: string
  workspaceId?: string
  executionWorkspaceId?: string
  worktreeId?: string
  runtimeProfileSignature?: string
  reason?: string
}

export interface WorkspaceRuntimeHostPort<TResource> {
  acquire(input: WorkspaceRuntimeLeaseInput): Promise<WorkspaceRuntimeLease<TResource> | undefined>
  release(input: {
    leaseId?: string
  }): Promise<void>
  markReady(input: {
    hostId: string
  }): void
  markSuspect(input: {
    hostId: string
    reason?: string
  }): void
  markBroken(input: {
    hostId: string
    reason?: string
  }): void
  invalidate(input?: WorkspaceRuntimeInvalidateInput): Promise<void>
  listSnapshots(input?: Omit<WorkspaceRuntimeInvalidateInput, "reason">): WorkspaceRuntimeHostSnapshot[]
}

type WorkspaceRuntimeHostFactoryInput = {
  hostId: string
  identity: WorkspaceRuntimeIdentity
}

type WorkspaceRuntimeHostDisposeInput<TResource> = {
  hostId: string
  identity: WorkspaceRuntimeIdentity
  host: TResource
  reason?: string
}

type WorkspaceRuntimeLeaseRecord = {
  leaseId: string
  hostId: string
  sessionId?: SessionId
  acquiredAt: TimestampMs
}

type WorkspaceRuntimeHostEntry<TResource> = {
  hostId: string
  identity: WorkspaceRuntimeIdentity
  state: WorkspaceRuntimeHostState
  reason?: string
  activeLeaseIds: Set<string>
  host?: TResource
  hostPromise: Promise<TResource>
  createdAt: TimestampMs
  updatedAt: TimestampMs
}

type WorkspaceRuntimeHostManagerOptions<TResource> = {
  createHost: (input: WorkspaceRuntimeHostFactoryInput) => Promise<TResource> | TResource
  disposeHost?: (input: WorkspaceRuntimeHostDisposeInput<TResource>) => Promise<void> | void
  now?: () => TimestampMs
  createLeaseId?: () => string
  reuseSuspectHosts?: boolean
}

function defaultNow(): TimestampMs {
  return Date.now()
}

function cloneIdentity(identity: WorkspaceRuntimeIdentity): WorkspaceRuntimeIdentity {
  return {
    workspaceId: identity.workspaceId,
    executionWorkspaceId: identity.executionWorkspaceId,
    ...(identity.workspaceRoot ? { workspaceRoot: identity.workspaceRoot } : {}),
    ...(identity.executionWorkspaceRoot
      ? { executionWorkspaceRoot: identity.executionWorkspaceRoot }
      : {}),
    ...(identity.worktreeId ? { worktreeId: identity.worktreeId } : {}),
    ...(identity.worktreeRoot ? { worktreeRoot: identity.worktreeRoot } : {}),
    ...(identity.sandboxMode ? { sandboxMode: identity.sandboxMode } : {}),
    ...(identity.runtimeProfileSignature
      ? { runtimeProfileSignature: identity.runtimeProfileSignature }
      : {}),
  }
}

function matchesIdentity(
  identity: WorkspaceRuntimeIdentity,
  input?: Omit<WorkspaceRuntimeInvalidateInput, "reason">,
): boolean {
  if (!input) {
    return true
  }

  if (input.hostId) {
    return false
  }

  return (!input.workspaceId || identity.workspaceId === input.workspaceId)
    && (!input.executionWorkspaceId || identity.executionWorkspaceId === input.executionWorkspaceId)
    && (!input.worktreeId || identity.worktreeId === input.worktreeId)
    && (!input.runtimeProfileSignature || identity.runtimeProfileSignature === input.runtimeProfileSignature)
}

export class WorkspaceRuntimeHostManager<TResource>
  implements WorkspaceRuntimeHostPort<TResource> {
  private readonly entriesByHostId = new Map<string, WorkspaceRuntimeHostEntry<TResource>>()
  private readonly leaseRecordsById = new Map<string, WorkspaceRuntimeLeaseRecord>()
  private leaseSequence = 0

  constructor(private readonly options: WorkspaceRuntimeHostManagerOptions<TResource>) {}

  async acquire(
    input: WorkspaceRuntimeLeaseInput,
  ): Promise<WorkspaceRuntimeLease<TResource> | undefined> {
    const identity = resolveWorkspaceRuntimeIdentity(input.binding)
    if (!identity) {
      return undefined
    }

    const hostId = formatWorkspaceRuntimeIdentityKey(identity)
    let entry = this.entriesByHostId.get(hostId)

    if (entry && !this.isReusable(entry.state)) {
      await this.evictEntry(entry, entry.reason)
      entry = undefined
    }

    if (!entry) {
      entry = this.createEntry(hostId, identity)
      this.entriesByHostId.set(hostId, entry)
    }

    const host = await entry.hostPromise
    const leaseId = this.createLeaseId()
    const acquiredAt = this.now()

    entry.activeLeaseIds.add(leaseId)
    entry.updatedAt = acquiredAt
    this.leaseRecordsById.set(leaseId, {
      leaseId,
      hostId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      acquiredAt,
    })

    return {
      leaseId,
      hostId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      host,
      identity: cloneIdentity(entry.identity),
      state: entry.state,
      ...(entry.reason ? { reason: entry.reason } : {}),
      activeLeaseCount: entry.activeLeaseIds.size,
    }
  }

  async release(input: {
    leaseId?: string
  }): Promise<void> {
    const leaseId = input.leaseId?.trim()
    if (!leaseId) {
      return
    }

    const lease = this.leaseRecordsById.get(leaseId)
    this.leaseRecordsById.delete(leaseId)
    if (!lease) {
      return
    }

    const entry = this.entriesByHostId.get(lease.hostId)
    if (!entry) {
      return
    }

    entry.activeLeaseIds.delete(leaseId)
    entry.updatedAt = this.now()

    if (entry.activeLeaseIds.size === 0 && !this.isReusable(entry.state)) {
      await this.evictEntry(entry, entry.reason)
    }
  }

  markReady(input: {
    hostId: string
  }): void {
    const entry = this.entriesByHostId.get(input.hostId)
    if (!entry) {
      return
    }

    entry.state = "ready"
    entry.reason = undefined
    entry.updatedAt = this.now()
  }

  markSuspect(input: {
    hostId: string
    reason?: string
  }): void {
    const entry = this.entriesByHostId.get(input.hostId)
    if (!entry) {
      return
    }

    entry.state = "suspect"
    entry.reason = input.reason?.trim() || undefined
    entry.updatedAt = this.now()
  }

  markBroken(input: {
    hostId: string
    reason?: string
  }): void {
    const entry = this.entriesByHostId.get(input.hostId)
    if (!entry) {
      return
    }

    entry.state = "broken"
    entry.reason = input.reason?.trim() || undefined
    entry.updatedAt = this.now()
  }

  async invalidate(input?: WorkspaceRuntimeInvalidateInput): Promise<void> {
    const reason = input?.reason?.trim() || undefined
    const matches = Array.from(this.entriesByHostId.values()).filter((entry) => {
      if (input?.hostId) {
        return entry.hostId === input.hostId
      }

      return matchesIdentity(entry.identity, input)
    })

    for (const entry of matches) {
      await this.evictEntry(entry, reason ?? entry.reason)
    }
  }

  listSnapshots(input?: Omit<WorkspaceRuntimeInvalidateInput, "reason">): WorkspaceRuntimeHostSnapshot[] {
    return Array.from(this.entriesByHostId.values())
      .filter((entry) => {
        if (input?.hostId) {
          return entry.hostId === input.hostId
        }

        return matchesIdentity(entry.identity, input)
      })
      .map((entry) => {
        const activeSessionIds = new Set<SessionId>()
        for (const leaseId of entry.activeLeaseIds) {
          const lease = this.leaseRecordsById.get(leaseId)
          if (lease?.sessionId) {
            activeSessionIds.add(lease.sessionId)
          }
        }

        return {
          hostId: entry.hostId,
          identity: cloneIdentity(entry.identity),
          state: entry.state,
          ...(entry.reason ? { reason: entry.reason } : {}),
          activeLeaseCount: entry.activeLeaseIds.size,
          activeSessionIds: Array.from(activeSessionIds),
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        }
      })
  }

  private createEntry(
    hostId: string,
    identity: WorkspaceRuntimeIdentity,
  ): WorkspaceRuntimeHostEntry<TResource> {
    const now = this.now()
    const entry: WorkspaceRuntimeHostEntry<TResource> = {
      hostId,
      identity: cloneIdentity(identity),
      state: "new",
      activeLeaseIds: new Set<string>(),
      hostPromise: Promise.resolve(undefined as TResource),
      createdAt: now,
      updatedAt: now,
    }

    entry.hostPromise = Promise.resolve(this.options.createHost({
      hostId,
      identity: cloneIdentity(identity),
    })).then((host) => {
      entry.host = host
      return host
    }).catch((error) => {
      this.entriesByHostId.delete(hostId)
      throw error
    })

    return entry
  }

  private async evictEntry(
    entry: WorkspaceRuntimeHostEntry<TResource>,
    reason?: string,
  ): Promise<void> {
    this.entriesByHostId.delete(entry.hostId)

    for (const leaseId of entry.activeLeaseIds) {
      this.leaseRecordsById.delete(leaseId)
    }
    entry.activeLeaseIds.clear()

    const host = entry.host ?? await entry.hostPromise.catch(() => undefined)
    if (!host || !this.options.disposeHost) {
      return
    }

    await this.options.disposeHost({
      hostId: entry.hostId,
      identity: cloneIdentity(entry.identity),
      host,
      ...(reason ? { reason } : {}),
    })
  }

  private createLeaseId(): string {
    if (this.options.createLeaseId) {
      return this.options.createLeaseId()
    }

    this.leaseSequence += 1
    return `lease_${this.leaseSequence.toString(36)}`
  }

  private isReusable(state: WorkspaceRuntimeHostState): boolean {
    if (state === "new" || state === "ready") {
      return true
    }

    return state === "suspect" && this.options.reuseSuspectHosts === true
  }

  private now(): TimestampMs {
    return this.options.now ? this.options.now() : defaultNow()
  }
}