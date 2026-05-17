import type { EventSinkPort, KernelEvent } from "../../core"

export class RecordingEventSink implements EventSinkPort {
  readonly events: KernelEvent[] = []

  async publish(events: readonly KernelEvent[]): Promise<void> {
    this.events.push(...events)
  }

  clear(): void {
    this.events.length = 0
  }
}
