import {
  asEventId,
  type ClockPort,
  type EventSinkPort,
  type IdGeneratorPort,
  type KernelEvent,
  type KernelEventPayloadMap,
  type KernelEventType,
} from "../../core"

export type PendingKernelEvent = {
  [TType in KernelEventType]: {
    type: TType
    payload: KernelEventPayloadMap[TType]
  }
}[KernelEventType]

export function buildKernelEvent<TType extends KernelEventType>(input: {
  type: TType
  payload: KernelEventPayloadMap[TType]
  clock: ClockPort
  idGenerator: IdGeneratorPort
}): KernelEvent<TType> {
  return {
    id: asEventId(input.idGenerator.next("event")),
    type: input.type,
    occurredAt: input.clock.now(),
    payload: input.payload,
  }
}

export async function publishKernelEvents(input: {
  events: readonly PendingKernelEvent[]
  eventSink?: EventSinkPort
  clock: ClockPort
  idGenerator: IdGeneratorPort
}): Promise<readonly KernelEvent[]> {
  if (!input.eventSink || input.events.length === 0) {
    return []
  }

  const events = input.events.map((event) => buildKernelEvent({
    ...event,
    clock: input.clock,
    idGenerator: input.idGenerator,
  }))

  await input.eventSink.publish(events)
  return events
}
