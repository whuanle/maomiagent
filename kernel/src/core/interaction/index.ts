import type { KernelMetadata, TimestampMs } from "../common"
import type { InteractionId, RunId, SessionId, ToolCallId } from "../ids"

export const INTERACTION_KIND_VALUES = [
  "permission",
  "question",
  "form",
] as const

export type InteractionKind = (typeof INTERACTION_KIND_VALUES)[number]

export const INTERACTION_STATUS_VALUES = [
  "pending",
  "answered",
  "rejected",
  "expired",
] as const

export type InteractionStatus = (typeof INTERACTION_STATUS_VALUES)[number]

export const INTERACTION_PERMISSION_DECISION_VALUES = [
  "approve_once",
  "approve_always",
  "reject",
] as const

export type InteractionPermissionDecision =
  (typeof INTERACTION_PERMISSION_DECISION_VALUES)[number]

export const INTERACTION_PERMISSION_OPERATION_KIND_VALUES = [
  "tool_execution",
  "file_read",
  "file_write",
  "command_execution",
  "search",
  "workspace_access",
  "network_access",
  "custom",
] as const

export type InteractionPermissionOperationKind =
  (typeof INTERACTION_PERMISSION_OPERATION_KIND_VALUES)[number]

export const INTERACTION_RESOURCE_KIND_VALUES = [
  "tool",
  "file",
  "directory",
  "command",
  "url",
  "workspace",
  "custom",
] as const

export type InteractionResourceKind = (typeof INTERACTION_RESOURCE_KIND_VALUES)[number]

export const INTERACTION_QUESTION_PRESENTATION_VALUES = [
  "questionnaire",
  "confirm",
] as const

export type InteractionQuestionPresentation =
  (typeof INTERACTION_QUESTION_PRESENTATION_VALUES)[number]

export const INTERACTION_FORM_FIELD_KIND_VALUES = [
  "text",
  "textarea",
  "select",
  "multiselect",
  "boolean",
] as const

export type InteractionFormFieldKind = (typeof INTERACTION_FORM_FIELD_KIND_VALUES)[number]

export const INTERACTION_FORM_LAYOUT_VALUES = [
  "form",
  "confirm",
  "inline_actions",
] as const

export type InteractionFormLayout = (typeof INTERACTION_FORM_LAYOUT_VALUES)[number]

export const INTERACTION_FORM_ACTION_KIND_VALUES = [
  "submit",
  "secondary",
  "danger",
  "link",
] as const

export type InteractionFormActionKind = (typeof INTERACTION_FORM_ACTION_KIND_VALUES)[number]

export type InteractionResourceDescriptor = {
  kind: InteractionResourceKind
  label?: string
  path?: string
  uri?: string
  command?: string
  workspaceId?: string
  worktreeId?: string
  toolName?: string
  metadata?: KernelMetadata
}

export type PermissionInteractionRequest = {
  kind: "permission"
  permission: string
  title?: string
  description?: string
  operation?: {
    kind: InteractionPermissionOperationKind
    label?: string
  }
  resources?: readonly InteractionResourceDescriptor[]
  allowAlways?: boolean
  defaultDecision?: Exclude<InteractionPermissionDecision, "reject">
  confirmLabel?: string
  rejectLabel?: string
  metadata?: KernelMetadata
}

export type PermissionInteractionResponse = {
  kind: "permission"
  decision: InteractionPermissionDecision
  note?: string
  metadata?: KernelMetadata
}

export type InteractionOption = {
  value: string
  label: string
  description?: string
}

export type QuestionInteractionItem = {
  id: string
  header: string
  question: string
  description?: string
  multiple?: boolean
  allowCustom?: boolean
  placeholder?: string
  options?: readonly InteractionOption[]
}

export type QuestionInteractionRequest = {
  kind: "question"
  title?: string
  description?: string
  presentation?: InteractionQuestionPresentation
  items: readonly QuestionInteractionItem[]
  confirmLabel?: string
  rejectLabel?: string
  metadata?: KernelMetadata
}

export type QuestionInteractionAnswer = {
  questionId: string
  values: readonly string[]
}

export type QuestionInteractionResponse = {
  kind: "question"
  answers: readonly QuestionInteractionAnswer[]
  note?: string
  metadata?: KernelMetadata
}

export type InteractionFormValue = string | readonly string[] | boolean

export type InteractionFormField = {
  key: string
  label: string
  kind: InteractionFormFieldKind
  description?: string
  required?: boolean
  placeholder?: string
  allowCustom?: boolean
  options?: readonly InteractionOption[]
  value?: InteractionFormValue
  trueLabel?: string
  falseLabel?: string
}

export type InteractionFormAction = {
  id: string
  label: string
  kind: InteractionFormActionKind
  description?: string
}

export type FormInteractionRequest = {
  kind: "form"
  title: string
  description?: string
  layout?: InteractionFormLayout
  fields: readonly InteractionFormField[]
  submitLabel?: string
  rejectLabel?: string
  actions?: readonly InteractionFormAction[]
  metadata?: KernelMetadata
}

export type FormInteractionResponse = {
  kind: "form"
  values: Readonly<Record<string, InteractionFormValue>>
  actionId?: string
  note?: string
  metadata?: KernelMetadata
}

export type RejectedInteractionResponse = {
  kind: "rejected"
  reason?: string
  code?: string
  metadata?: KernelMetadata
}

export type InteractionRequestPayload =
  | PermissionInteractionRequest
  | QuestionInteractionRequest
  | FormInteractionRequest

export type InteractionResolvedResponsePayload =
  | PermissionInteractionResponse
  | QuestionInteractionResponse
  | FormInteractionResponse

export type InteractionResponsePayload =
  | InteractionResolvedResponsePayload
  | RejectedInteractionResponse

export type InteractionRecord = {
  id: InteractionId
  sessionId: SessionId
  runId: RunId
  toolCallId?: ToolCallId
  kind: InteractionKind
  status: InteractionStatus
  request: InteractionRequestPayload | unknown
  response?: InteractionResponsePayload | unknown
  createdAt: TimestampMs
  updatedAt: TimestampMs
  metadata?: KernelMetadata
}

export type TypedInteractionRecord<K extends InteractionKind = InteractionKind> = Omit<
  InteractionRecord,
  "kind" | "request" | "response"
> & {
  kind: K
  request: Extract<InteractionRequestPayload, { kind: K }>
  response?: Extract<InteractionResolvedResponsePayload, { kind: K }> | RejectedInteractionResponse
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isInteractionOption(value: unknown): value is InteractionOption {
  return isRecord(value)
    && typeof value.value === "string"
    && typeof value.label === "string"
    && (value.description === undefined || typeof value.description === "string")
}

function isInteractionResourceDescriptor(value: unknown): value is InteractionResourceDescriptor {
  return isRecord(value)
    && typeof value.kind === "string"
    && (INTERACTION_RESOURCE_KIND_VALUES as readonly string[]).includes(value.kind)
    && (value.label === undefined || typeof value.label === "string")
    && (value.path === undefined || typeof value.path === "string")
    && (value.uri === undefined || typeof value.uri === "string")
    && (value.command === undefined || typeof value.command === "string")
    && (value.workspaceId === undefined || typeof value.workspaceId === "string")
    && (value.worktreeId === undefined || typeof value.worktreeId === "string")
    && (value.toolName === undefined || typeof value.toolName === "string")
}

function isQuestionInteractionItem(value: unknown): value is QuestionInteractionItem {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.header === "string"
    && typeof value.question === "string"
    && (value.description === undefined || typeof value.description === "string")
    && (value.multiple === undefined || typeof value.multiple === "boolean")
    && (value.allowCustom === undefined || typeof value.allowCustom === "boolean")
    && (value.placeholder === undefined || typeof value.placeholder === "string")
    && (value.options === undefined || (Array.isArray(value.options) && value.options.every(isInteractionOption)))
}

function isInteractionFormValue(value: unknown): value is InteractionFormValue {
  return typeof value === "string" || typeof value === "boolean" || isStringArray(value)
}

function isInteractionFormField(value: unknown): value is InteractionFormField {
  return isRecord(value)
    && typeof value.key === "string"
    && typeof value.label === "string"
    && typeof value.kind === "string"
    && (INTERACTION_FORM_FIELD_KIND_VALUES as readonly string[]).includes(value.kind)
    && (value.description === undefined || typeof value.description === "string")
    && (value.required === undefined || typeof value.required === "boolean")
    && (value.placeholder === undefined || typeof value.placeholder === "string")
    && (value.allowCustom === undefined || typeof value.allowCustom === "boolean")
    && (value.options === undefined || (Array.isArray(value.options) && value.options.every(isInteractionOption)))
    && (value.value === undefined || isInteractionFormValue(value.value))
    && (value.trueLabel === undefined || typeof value.trueLabel === "string")
    && (value.falseLabel === undefined || typeof value.falseLabel === "string")
}

function isInteractionFormAction(value: unknown): value is InteractionFormAction {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.kind === "string"
    && (INTERACTION_FORM_ACTION_KIND_VALUES as readonly string[]).includes(value.kind)
    && (value.description === undefined || typeof value.description === "string")
}

function isRejectedInteractionResponseLike(value: unknown): value is {
  reason?: string
  code?: string
  metadata?: KernelMetadata
} {
  return isRecord(value)
    && (value.reason === undefined || typeof value.reason === "string")
    && (value.code === undefined || typeof value.code === "string")
}

export function isPermissionInteractionRequest(value: unknown): value is PermissionInteractionRequest {
  return isRecord(value)
    && value.kind === "permission"
    && typeof value.permission === "string"
    && (value.title === undefined || typeof value.title === "string")
    && (value.description === undefined || typeof value.description === "string")
    && (value.operation === undefined
      || (isRecord(value.operation)
        && typeof value.operation.kind === "string"
        && (INTERACTION_PERMISSION_OPERATION_KIND_VALUES as readonly string[]).includes(value.operation.kind)
        && (value.operation.label === undefined || typeof value.operation.label === "string")))
    && (value.resources === undefined
      || (Array.isArray(value.resources) && value.resources.every(isInteractionResourceDescriptor)))
    && (value.allowAlways === undefined || typeof value.allowAlways === "boolean")
    && (value.defaultDecision === undefined
      || value.defaultDecision === "approve_once"
      || value.defaultDecision === "approve_always")
    && (value.confirmLabel === undefined || typeof value.confirmLabel === "string")
    && (value.rejectLabel === undefined || typeof value.rejectLabel === "string")
}

export function isPermissionInteractionResponse(value: unknown): value is PermissionInteractionResponse {
  return isRecord(value)
    && value.kind === "permission"
    && typeof value.decision === "string"
    && (INTERACTION_PERMISSION_DECISION_VALUES as readonly string[]).includes(value.decision)
    && (value.note === undefined || typeof value.note === "string")
}

export function isQuestionInteractionRequest(value: unknown): value is QuestionInteractionRequest {
  return isRecord(value)
    && value.kind === "question"
    && (value.title === undefined || typeof value.title === "string")
    && (value.description === undefined || typeof value.description === "string")
    && (value.presentation === undefined
      || (typeof value.presentation === "string"
        && (INTERACTION_QUESTION_PRESENTATION_VALUES as readonly string[]).includes(value.presentation)))
    && Array.isArray(value.items)
    && value.items.every(isQuestionInteractionItem)
    && (value.confirmLabel === undefined || typeof value.confirmLabel === "string")
    && (value.rejectLabel === undefined || typeof value.rejectLabel === "string")
}

export function isQuestionInteractionResponse(value: unknown): value is QuestionInteractionResponse {
  return isRecord(value)
    && value.kind === "question"
    && Array.isArray(value.answers)
    && value.answers.every((item) => isRecord(item)
      && typeof item.questionId === "string"
      && isStringArray(item.values))
    && (value.note === undefined || typeof value.note === "string")
}

export function isFormInteractionRequest(value: unknown): value is FormInteractionRequest {
  return isRecord(value)
    && value.kind === "form"
    && typeof value.title === "string"
    && (value.description === undefined || typeof value.description === "string")
    && (value.layout === undefined
      || (typeof value.layout === "string"
        && (INTERACTION_FORM_LAYOUT_VALUES as readonly string[]).includes(value.layout)))
    && Array.isArray(value.fields)
    && value.fields.every(isInteractionFormField)
    && (value.submitLabel === undefined || typeof value.submitLabel === "string")
    && (value.rejectLabel === undefined || typeof value.rejectLabel === "string")
    && (value.actions === undefined
      || (Array.isArray(value.actions) && value.actions.every(isInteractionFormAction)))
}

export function isFormInteractionResponse(value: unknown): value is FormInteractionResponse {
  return isRecord(value)
    && value.kind === "form"
    && isRecord(value.values)
    && Object.values(value.values).every((item) => isInteractionFormValue(item))
    && (value.actionId === undefined || typeof value.actionId === "string")
    && (value.note === undefined || typeof value.note === "string")
}

export function isRejectedInteractionResponse(value: unknown): value is RejectedInteractionResponse {
  return isRecord(value)
    && value.kind === "rejected"
    && isRejectedInteractionResponseLike(value)
}

export function createRejectedInteractionResponse(
  reason?: string,
  code?: string,
): RejectedInteractionResponse {
  return {
    kind: "rejected",
    ...(reason ? { reason } : {}),
    ...(code ? { code } : {}),
  }
}

export function asInteractionRequestPayload(input: {
  kind: InteractionKind
  value: unknown
}): InteractionRequestPayload | undefined {
  switch (input.kind) {
    case "permission":
      return isPermissionInteractionRequest(input.value) ? input.value : undefined
    case "question":
      return isQuestionInteractionRequest(input.value) ? input.value : undefined
    case "form":
      return isFormInteractionRequest(input.value) ? input.value : undefined
  }
}

export function asInteractionResponsePayload(input: {
  kind: InteractionKind
  status?: InteractionStatus
  value: unknown
}): InteractionResponsePayload | undefined {
  if (isRejectedInteractionResponse(input.value)) {
    return input.value
  }

  if (input.status === "rejected" && isRejectedInteractionResponseLike(input.value)) {
    return createRejectedInteractionResponse(input.value.reason, input.value.code)
  }

  switch (input.kind) {
    case "permission":
      return isPermissionInteractionResponse(input.value) ? input.value : undefined
    case "question":
      return isQuestionInteractionResponse(input.value) ? input.value : undefined
    case "form":
      return isFormInteractionResponse(input.value) ? input.value : undefined
  }
}

export * from "./interaction-coordinator"
