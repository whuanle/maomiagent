export type OpaqueId<TBrand extends string> = string & { readonly __brand: TBrand }

function asOpaqueId<TBrand extends string>(value: string): OpaqueId<TBrand> {
  return value as OpaqueId<TBrand>
}

export type SessionId = OpaqueId<"maomi.kernel.session.id">
export type RunId = OpaqueId<"maomi.kernel.run.id">
export type TurnId = OpaqueId<"maomi.kernel.turn.id">
export type MessageId = OpaqueId<"maomi.kernel.message.id">
export type MessagePartId = OpaqueId<"maomi.kernel.message.part.id">
export type ToolCallId = OpaqueId<"maomi.kernel.tool-call.id">
export type InteractionId = OpaqueId<"maomi.kernel.interaction.id">
export type ContextCheckpointId = OpaqueId<"maomi.kernel.context-checkpoint.id">
export type EventId = OpaqueId<"maomi.kernel.event.id">

export function asSessionId(value: string): SessionId {
  return asOpaqueId<"maomi.kernel.session.id">(value)
}

export function asRunId(value: string): RunId {
  return asOpaqueId<"maomi.kernel.run.id">(value)
}

export function asTurnId(value: string): TurnId {
  return asOpaqueId<"maomi.kernel.turn.id">(value)
}

export function asMessageId(value: string): MessageId {
  return asOpaqueId<"maomi.kernel.message.id">(value)
}

export function asMessagePartId(value: string): MessagePartId {
  return asOpaqueId<"maomi.kernel.message.part.id">(value)
}

export function asToolCallId(value: string): ToolCallId {
  return asOpaqueId<"maomi.kernel.tool-call.id">(value)
}

export function asInteractionId(value: string): InteractionId {
  return asOpaqueId<"maomi.kernel.interaction.id">(value)
}

export function asContextCheckpointId(value: string): ContextCheckpointId {
  return asOpaqueId<"maomi.kernel.context-checkpoint.id">(value)
}

export function asEventId(value: string): EventId {
  return asOpaqueId<"maomi.kernel.event.id">(value)
}
