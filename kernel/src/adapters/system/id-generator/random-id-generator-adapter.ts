import { randomUUID } from "node:crypto"
import type { IdGeneratorPort } from "../../../core"

type RandomIdGeneratorAdapterOptions = {
  randomSource?: () => string
  segmentLength?: number
}

function normalizeIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
}

export class RandomIdGeneratorAdapter implements IdGeneratorPort {
  private readonly randomSource: () => string
  private readonly segmentLength: number

  constructor(options: RandomIdGeneratorAdapterOptions = {}) {
    this.randomSource = options.randomSource ?? (() => randomUUID())
    this.segmentLength = Math.max(8, Math.floor(options.segmentLength ?? 12))
  }

  next(prefix: string): string {
    const normalized = normalizeIdSegment(this.randomSource())
    const segment = normalized.slice(0, this.segmentLength) || normalizeIdSegment(randomUUID()).slice(0, this.segmentLength)
    return `${prefix}_${segment}`
  }
}
