import type { EventSinkPort, KernelEvent } from "../../core"

export class NoOpEventSink implements EventSinkPort {
  async publish(_events: readonly KernelEvent[]): Promise<void> {}
}
