import type { Database } from "bun:sqlite"
import {
  asMessageId,
  asMessagePartId,
  asRunId,
  asSessionId,
  asToolCallId,
  asTurnId,
  type KernelMetadata,
  type MessagePart,
  type MessageRecord,
  type MessageRecordWithParts,
  type MessageRole,
  type MessageStorePort,
} from "../../../core"
import { parseKernelErrorValue } from "./kernel-error-json"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"
import { runInSqliteTransaction } from "./sqlite-transaction"

type SqliteMessageRow = {
  message_id: string
  session_id: string
  run_id: string | null
  turn_id: string | null
  role: MessageRole
  created_at: number
  metadata_json: string | null
}

type SqliteMessagePartRow = {
  part_id: string
  message_id: string
  part_order: number
  part_type: MessagePart["type"]
  payload_json: string
}

function parseJsonObject(value: string, recordLabel: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Kernel JSON payload must be an object: ${recordLabel}`)
  }

  return parsed as Record<string, unknown>
}

function parseKernelMetadataValue(value: unknown, recordLabel: string): KernelMetadata {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Kernel metadata must be a JSON object: ${recordLabel}`)
  }

  return value as KernelMetadata
}

function getRequiredStringField(
  payload: Record<string, unknown>,
  key: string,
  recordLabel: string,
): string {
  const value = payload[key]
  if (typeof value !== "string") {
    throw new Error(`Kernel JSON field must be a string: ${recordLabel}.${key}`)
  }

  return value
}

function getOptionalStringField(
  payload: Record<string, unknown>,
  key: string,
  recordLabel: string,
): string | undefined {
  const value = payload[key]
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new Error(`Kernel JSON field must be a string when present: ${recordLabel}.${key}`)
  }

  return value
}

function serializeMessagePartPayload(part: MessagePart): string {
  switch (part.type) {
    case "text":
    case "reasoning":
      return JSON.stringify({
        text: part.text,
      })
    case "attachment":
      return JSON.stringify({
        attachmentId: part.attachmentId,
        mimeType: part.mimeType,
        name: part.name,
        kind: part.kind,
        path: part.path,
        assetId: part.assetId,
        assetMonth: part.assetMonth,
        fileName: part.fileName,
        sizeBytes: part.sizeBytes,
      })
    case "tool_call_ref":
      return JSON.stringify({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      })
    case "tool_result_ref":
      return JSON.stringify({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      })
    case "error":
      return JSON.stringify({
        error: part.error,
      })
    case "meta":
      return JSON.stringify({
        data: part.data,
      })
  }
}

function mapMessagePartRow(row: SqliteMessagePartRow): MessagePart {
  const payload = parseJsonObject(row.payload_json, row.part_id)

  switch (row.part_type) {
    case "text":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        text: getRequiredStringField(payload, "text", row.part_id),
      }
    case "reasoning":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        text: getRequiredStringField(payload, "text", row.part_id),
      }
    case "attachment":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        attachmentId: getRequiredStringField(payload, "attachmentId", row.part_id),
        mimeType: getRequiredStringField(payload, "mimeType", row.part_id),
        name: getOptionalStringField(payload, "name", row.part_id),
        kind: getOptionalStringField(payload, "kind", row.part_id) as Extract<MessagePart, { type: "attachment" }> ["kind"],
        path: getOptionalStringField(payload, "path", row.part_id),
        assetId: getOptionalStringField(payload, "assetId", row.part_id),
        assetMonth: getOptionalStringField(payload, "assetMonth", row.part_id),
        fileName: getOptionalStringField(payload, "fileName", row.part_id),
        sizeBytes: typeof payload.sizeBytes === "number" && Number.isFinite(payload.sizeBytes)
          ? payload.sizeBytes
          : undefined,
      }
    case "tool_call_ref":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        toolCallId: asToolCallId(getRequiredStringField(payload, "toolCallId", row.part_id)),
        toolName: getRequiredStringField(payload, "toolName", row.part_id),
        input: Object.prototype.hasOwnProperty.call(payload, "input")
          ? payload.input
          : undefined,
      }
    case "tool_result_ref":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        toolCallId: asToolCallId(getRequiredStringField(payload, "toolCallId", row.part_id)),
        toolName: getRequiredStringField(payload, "toolName", row.part_id),
      }
    case "error":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        error: parseKernelErrorValue(payload.error, `${row.part_id}.error`),
      }
    case "meta":
      return {
        id: asMessagePartId(row.part_id),
        type: row.part_type,
        data: parseKernelMetadataValue(payload.data, row.part_id),
      }
  }
}

function mapMessageRow(row: SqliteMessageRow): MessageRecord {
  return {
    id: asMessageId(row.message_id),
    sessionId: asSessionId(row.session_id),
    runId: row.run_id ? asRunId(row.run_id) : undefined,
    turnId: row.turn_id ? asTurnId(row.turn_id) : undefined,
    role: row.role,
    createdAt: row.created_at,
    metadata: parseKernelMetadataJson(row.metadata_json, row.message_id),
  }
}

function insertMessagePartRows(
  db: Database,
  messageId: MessageRecord["id"],
  parts: readonly MessagePart[],
  startOrder: number,
): void {
  if (parts.length === 0) {
    return
  }

  const statement = db.query(
    `
      INSERT INTO kernel_message_parts (
        part_id,
        message_id,
        part_order,
        part_type,
        payload_json
      ) VALUES (?, ?, ?, ?, ?)
    `,
  )

  for (const [index, part] of parts.entries()) {
    statement.run(
      part.id,
      messageId,
      startOrder + index,
      part.type,
      serializeMessagePartPayload(part),
    )
  }
}

function canMergeAdjacentMessageParts(
  persisted: MessagePart,
  incoming: MessagePart,
): persisted is Extract<MessagePart, { type: "text" | "reasoning" }> {
  return (persisted.type === "text" || persisted.type === "reasoning")
    && persisted.type === incoming.type;
}

function mergeAdjacentMessageParts(
  persisted: Extract<MessagePart, { type: "text" | "reasoning" }>,
  incoming: MessagePart,
): Extract<MessagePart, { type: "text" | "reasoning" }> {
  if (incoming.type !== persisted.type) {
    return persisted
  }

  return {
    ...persisted,
    text: `${persisted.text}${incoming.text}`,
  };
}

function isPersistableMessagePart(part: MessagePart) {
  if (part.type === "text" || part.type === "reasoning") {
    return part.text.length > 0
  }

  return true
}

function normalizePersistedMessageParts(parts: readonly MessagePart[]): MessagePart[] {
  const normalized: MessagePart[] = []

  for (const part of parts) {
    if (!isPersistableMessagePart(part)) {
      continue
    }

    const previous = normalized.at(-1)
    if (previous && canMergeAdjacentMessageParts(previous, part)) {
      normalized[normalized.length - 1] = mergeAdjacentMessageParts(previous, part)
      continue
    }

    normalized.push(part)
  }

  return normalized
}

export class SqliteMessageStoreAdapter implements MessageStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async append(message: MessageRecord, parts: readonly MessagePart[]): Promise<void> {
    const persistedParts = normalizePersistedMessageParts(parts)

    await runInSqliteTransaction(this.db, () => {
      this.db.query(
        `
          INSERT INTO kernel_messages (
            message_id,
            session_id,
            run_id,
            turn_id,
            role,
            created_at,
            metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        message.id,
        message.sessionId,
        message.runId ?? null,
        message.turnId ?? null,
        message.role,
        message.createdAt,
        serializeKernelMetadataJson(message.metadata),
      )

      insertMessagePartRows(this.db, message.id, persistedParts, 0)
    })
  }

  async appendParts(messageId: MessageRecord["id"], parts: readonly MessagePart[]): Promise<void> {
    const persistedParts = normalizePersistedMessageParts(parts)
    if (persistedParts.length === 0) {
      return
    }

    await runInSqliteTransaction(this.db, () => {
      const messageRow = this.db.query(
        `
          SELECT message_id
          FROM kernel_messages
          WHERE message_id = ?
          LIMIT 1
        `,
      ).get(messageId) as { message_id: string } | null

      if (!messageRow) {
        throw new Error(`Kernel message not found: ${messageId}`)
      }

      const lastPartRow = this.db.query(
        `
          SELECT
            part_id,
            message_id,
            part_order,
            part_type,
            payload_json
          FROM kernel_message_parts
          WHERE message_id = ?
          ORDER BY part_order DESC
          LIMIT 1
        `,
      ).get(messageId) as SqliteMessagePartRow | null

      const maxPartOrderRow = this.db.query(
        `
          SELECT COALESCE(MAX(part_order), -1) AS max_part_order
          FROM kernel_message_parts
          WHERE message_id = ?
        `,
      ).get(messageId) as { max_part_order: number }

      let nextPartOrder = maxPartOrderRow.max_part_order + 1
      let lastPersistedPart = lastPartRow ? mapMessagePartRow(lastPartRow) : undefined

      for (const part of persistedParts) {
        if (lastPersistedPart && canMergeAdjacentMessageParts(lastPersistedPart, part)) {
          const merged = mergeAdjacentMessageParts(lastPersistedPart, part)
          this.db.query(
            `
              UPDATE kernel_message_parts
              SET payload_json = ?
              WHERE part_id = ?
            `,
          ).run(
            serializeMessagePartPayload(merged),
            merged.id,
          )
          lastPersistedPart = merged
          continue
        }

        insertMessagePartRows(this.db, messageId, [part], nextPartOrder)
        nextPartOrder += 1
        lastPersistedPart = part
      }
    })
  }

  async listBySession(sessionId: MessageRecord["sessionId"]): Promise<readonly MessageRecordWithParts[]> {
    const messageRows = this.db.query(
      `
        SELECT
          message_id,
          session_id,
          run_id,
          turn_id,
          role,
          created_at,
          metadata_json
        FROM kernel_messages
        WHERE session_id = ?
        ORDER BY created_at ASC, message_id ASC
      `,
    ).all(sessionId) as SqliteMessageRow[]

    if (messageRows.length === 0) {
      return []
    }

    const partRows = this.db.query(
      `
        SELECT
          mp.part_id,
          mp.message_id,
          mp.part_order,
          mp.part_type,
          mp.payload_json
        FROM kernel_message_parts mp
        INNER JOIN kernel_messages m
          ON m.message_id = mp.message_id
        WHERE m.session_id = ?
        ORDER BY m.created_at ASC, mp.message_id ASC, mp.part_order ASC
      `,
    ).all(sessionId) as SqliteMessagePartRow[]

    const partsByMessageId = new Map<string, MessagePart[]>()

    for (const row of partRows) {
      const existing = partsByMessageId.get(row.message_id)
      const part = mapMessagePartRow(row)
      if (existing) {
        existing.push(part)
      } else {
        partsByMessageId.set(row.message_id, [part])
      }
    }

    return messageRows.map((row) => ({
      message: mapMessageRow(row),
      parts: partsByMessageId.get(row.message_id) ?? [],
    }))
  }
}
