import type { EventSinkPort, KernelEvent } from "../../core"
import {
  projectKernelEventToConversationRuntimeEvent,
  type ConversationRuntimeEvent,
} from "./conversation-message-protocol"

export interface ConversationRuntimeEventProjectionPort {
  apply(events: readonly ConversationRuntimeEvent[]): Promise<void>
}

export interface ConversationRuntimeEventDeliveryPort {
  publish(events: readonly ConversationRuntimeEvent[]): Promise<void>
}

export function projectKernelEventsToConversationRuntimeEvents(
  events: readonly KernelEvent[],
): readonly ConversationRuntimeEvent[] {
  const projected: ConversationRuntimeEvent[] = []

  for (const event of events) {
    const runtimeEvent = projectKernelEventToConversationRuntimeEvent(event)
    if (!runtimeEvent) {
      continue
    }

    projected.push(runtimeEvent)
  }

  return projected
}

type ConversationRuntimeEventProjectorOptions = {
  kernelEventSink?: EventSinkPort
  projection?: ConversationRuntimeEventProjectionPort
  delivery?: ConversationRuntimeEventDeliveryPort
}

export class ConversationRuntimeEventProjector implements EventSinkPort {
  constructor(private readonly options: ConversationRuntimeEventProjectorOptions = {}) {}

  async publish(events: readonly KernelEvent[]): Promise<void> {
    if (this.options.kernelEventSink) {
      await this.options.kernelEventSink.publish(events)
    }

    const runtimeEvents = projectKernelEventsToConversationRuntimeEvents(events)
    if (runtimeEvents.length === 0) {
      return
    }

    if (this.options.projection) {
      await this.options.projection.apply(runtimeEvents)
    }

    if (this.options.delivery) {
      await this.options.delivery.publish(runtimeEvents)
    }
  }
}