import type { TimestampMs, KernelMetadata } from "../common"
import type { SessionId } from "../ids"

export const SESSION_STATUS_VALUES = [
  "idle",
  "active",
  "archived",
  "failed",
] as const

export type SessionStatus = (typeof SESSION_STATUS_VALUES)[number]

export type SessionRecord = {
  id: SessionId
  title: string
  parentSessionId?: SessionId
  status: SessionStatus
  createdAt: TimestampMs
  updatedAt: TimestampMs
  archivedAt?: TimestampMs
  metadata?: KernelMetadata
}
