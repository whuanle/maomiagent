import type { WorkspaceRestoreState } from "../../lib/workspace"
import type { FeishuDocSummary } from "../../../shared/desktop-feishu"
import type { FeishuDocsTreeSnapshotNode, FeishuDocsWorkbenchUiState } from "./components/docs-workbench"

export type FeishuPageView =
  | "bot"
  | "docs-workspace"
  | "smart-assistant"

export type FeishuPagePersistentState = {
  pageView: FeishuPageView
  docs: FeishuDocsWorkbenchUiState
}

export const FEISHU_DOCS_WORKSPACE_UI_KEY = "feishuDocsWorkspace"

const FEISHU_PAGE_STATE_STORAGE_PREFIX = "maomi.feishu.page-state"
const FEISHU_DOCS_ROOT_TOKEN_STORAGE_KEY = "maomi.feishu.docs.root-token"
const FEISHU_ACTIVE_WORKSPACE_STORAGE_KEY = "maomi.feishu.active-workspace"

export const DEFAULT_FEISHU_DOCS_UI_STATE: FeishuDocsWorkbenchUiState = {
  treeQuery: "",
  treeRootDocId: "",
  workspaceMode: "workspace",
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const items: string[] = []
  const knownItems = new Set<string>()

  for (const entry of value) {
    const normalized = normalizeText(entry)
    if (!normalized || knownItems.has(normalized)) {
      continue
    }

    knownItems.add(normalized)
    items.push(normalized)
  }

  return items
}

function normalizeTreeNodeKind(value: unknown): FeishuDocSummary["kind"] | undefined {
  return value === "wiki_node" || value === "document"
    ? value
    : undefined
}

function normalizeTreeObjectType(value: unknown): FeishuDocSummary["objType"] | undefined {
  return value === "doc"
    || value === "docx"
    || value === "sheet"
    || value === "mindnote"
    || value === "bitable"
    || value === "file"
    || value === "slides"
    ? value
    : undefined
}

function readTreeNodeDocSummary(
  value: unknown,
  fallbackKey: string,
  fallbackTitle: string,
): FeishuDocSummary | undefined {
  const record = asRecord(value)
  const id = normalizeText(record.id) || fallbackKey
  const title = normalizeText(record.title) || fallbackTitle

  if (!id || !title) {
    return undefined
  }

  const token = normalizeText(record.token)
  const docId = normalizeText(record.docId) || id
  const url = normalizeText(record.url)
  const ownerName = normalizeText(record.ownerName)
  const docType = normalizeText(record.docType)
  const parentToken = normalizeText(record.parentToken)
  const createTime = normalizeText(record.createTime)
  const updateTime = normalizeText(record.updateTime)
  const updatedAt = normalizeText(record.updatedAt)
  const lastOpenTime = normalizeText(record.lastOpenTime)
  const kind = normalizeTreeNodeKind(record.kind)
  const objType = normalizeTreeObjectType(record.objType)
  const hasChild = typeof record.hasChild === "boolean"
    ? record.hasChild
    : undefined

  return {
    id,
    ...(token ? { token } : {}),
    ...(kind ? { kind } : {}),
    ...(docId ? { docId } : {}),
    title,
    ...(url ? { url } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(docType ? { docType } : {}),
    ...(objType ? { objType } : {}),
    ...(parentToken ? { parentToken } : {}),
    ...(createTime ? { createTime } : {}),
    ...(updateTime ? { updateTime } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(lastOpenTime ? { lastOpenTime } : {}),
    ...(typeof hasChild === "boolean" ? { hasChild } : {}),
  }
}

function readTreeNodeSnapshot(value: unknown): FeishuDocsTreeSnapshotNode | null {
  const record = asRecord(value)
  const key = normalizeText(record.key)
  const title = normalizeText(record.title)

  if (!key || !title) {
    return null
  }

  const doc = readTreeNodeDocSummary(record.doc, key, title)
  const children = readTreeNodeSnapshots(record.children)

  return {
    key,
    title,
    ...(typeof record.isLeaf === "boolean" ? { isLeaf: record.isLeaf } : {}),
    ...(typeof record.loaded === "boolean" ? { loaded: record.loaded } : {}),
    ...(doc ? { doc } : {}),
    ...(children.length ? { children } : {}),
  }
}

function readTreeNodeSnapshots(value: unknown): FeishuDocsTreeSnapshotNode[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => readTreeNodeSnapshot(entry))
    .filter((entry): entry is FeishuDocsTreeSnapshotNode => Boolean(entry))
}

function areTextListsEqual(previous: string[] | undefined, next: string[] | undefined): boolean {
  const previousList = previous ?? []
  const nextList = next ?? []
  if (previousList.length !== nextList.length) {
    return false
  }

  return previousList.every((item, index) => item === nextList[index])
}

function areTreeSnapshotsEqual(
  previous: FeishuDocsTreeSnapshotNode[] | undefined,
  next: FeishuDocsTreeSnapshotNode[] | undefined,
): boolean {
  return JSON.stringify(previous ?? []) === JSON.stringify(next ?? [])
}

function readWorkspaceDocsUiState(
  restoreState: WorkspaceRestoreState | null | undefined,
): Partial<FeishuDocsWorkbenchUiState> {
  const ui = asRecord(restoreState?.ui)
  const docsUi = asRecord(ui[FEISHU_DOCS_WORKSPACE_UI_KEY])
  const activeDocId = normalizeText(docsUi.activeDocId)
  const treeQuery = normalizeText(docsUi.treeQuery)
  const treeRootDocId = normalizeText(docsUi.treeRootDocId)
  const workspaceMode = docsUi.workspaceMode === "workspace" ? "workspace" : undefined
  const checkedTreeKeys = normalizeTextList(docsUi.checkedTreeKeys)

  return {
    ...(activeDocId ? { activeDocId } : {}),
    ...(treeQuery ? { treeQuery } : {}),
    ...(treeRootDocId ? { treeRootDocId } : {}),
    ...(workspaceMode ? { workspaceMode } : {}),
    ...(checkedTreeKeys.length ? { checkedTreeKeys } : {}),
  }
}

export function isSameDocsUiState(
  previous: FeishuDocsWorkbenchUiState,
  next: FeishuDocsWorkbenchUiState,
): boolean {
  return (
    (previous.activeDocId ?? "") === (next.activeDocId ?? "")
    && previous.treeQuery === next.treeQuery
    && previous.treeRootDocId === next.treeRootDocId
    && previous.workspaceMode === next.workspaceMode
    && areTreeSnapshotsEqual(previous.treeNodes, next.treeNodes)
    && areTextListsEqual(previous.expandedKeys, next.expandedKeys)
    && areTextListsEqual(previous.checkedTreeKeys, next.checkedTreeKeys)
  )
}

export function getFeishuPageStorageKey(workspaceId?: string): string {
  return `${FEISHU_PAGE_STATE_STORAGE_PREFIX}:${workspaceId?.trim() || "global"}`
}

function readSavedDocsRootToken(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return normalizeText(window.localStorage.getItem(FEISHU_DOCS_ROOT_TOKEN_STORAGE_KEY))
}

export function readSavedFeishuActiveWorkspaceId(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return normalizeText(window.localStorage.getItem(FEISHU_ACTIVE_WORKSPACE_STORAGE_KEY))
}

function writeSavedDocsRootToken(token: string): void {
  if (typeof window === "undefined") {
    return
  }

  const normalized = normalizeText(token)
  if (!normalized) {
    return
  }

  window.localStorage.setItem(FEISHU_DOCS_ROOT_TOKEN_STORAGE_KEY, normalized)
}

export function writeSavedFeishuActiveWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") {
    return
  }

  const normalized = normalizeText(workspaceId)
  if (!normalized) {
    return
  }

  window.localStorage.setItem(FEISHU_ACTIVE_WORKSPACE_STORAGE_KEY, normalized)
}

export function readFeishuPagePersistentState(workspaceId?: string): FeishuPagePersistentState {
  if (typeof window === "undefined") {
    return {
      pageView: "bot",
      docs: DEFAULT_FEISHU_DOCS_UI_STATE,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(getFeishuPageStorageKey(workspaceId))
    const savedDocsRootToken = readSavedDocsRootToken()
    if (!rawValue) {
      return {
        pageView: "bot",
        docs: {
          ...DEFAULT_FEISHU_DOCS_UI_STATE,
          treeQuery: savedDocsRootToken,
          treeRootDocId: savedDocsRootToken,
        },
      }
    }

    const parsed = JSON.parse(rawValue) as {
      pageView?: string
      docs?: Partial<FeishuDocsWorkbenchUiState>
    }
    const treeQuery = typeof parsed.docs?.treeQuery === "string" && parsed.docs.treeQuery.trim()
      ? parsed.docs.treeQuery
      : typeof parsed.docs?.treeRootDocId === "string" && parsed.docs.treeRootDocId.trim()
        ? parsed.docs.treeRootDocId
        : savedDocsRootToken
    const treeRootDocId = typeof parsed.docs?.treeRootDocId === "string" && parsed.docs.treeRootDocId.trim()
      ? parsed.docs.treeRootDocId
      : treeQuery
    const treeNodes = readTreeNodeSnapshots(parsed.docs?.treeNodes)
    const expandedKeys = normalizeTextList(parsed.docs?.expandedKeys)
    const checkedTreeKeys = normalizeTextList(parsed.docs?.checkedTreeKeys)

    return {
      pageView:
        parsed.pageView === "smart-assistant"
          ? "smart-assistant"
          : parsed.pageView === "docs-workspace" || parsed.pageView === "personal-docs-workspace"
          ? "docs-workspace"
          : parsed.pageView === "bot"
            ? "bot"
            : "bot",
      docs: {
        activeDocId: typeof parsed.docs?.activeDocId === "string" ? parsed.docs.activeDocId : undefined,
        treeQuery,
        treeRootDocId,
        workspaceMode: "workspace",
        ...(treeNodes.length ? { treeNodes } : {}),
        ...(expandedKeys.length ? { expandedKeys } : {}),
        ...(checkedTreeKeys.length ? { checkedTreeKeys } : {}),
      },
    }
  } catch {
    return {
      pageView: "bot",
      docs: DEFAULT_FEISHU_DOCS_UI_STATE,
    }
  }
}

export function writeFeishuPagePersistentState(
  workspaceId: string | undefined,
  state: FeishuPagePersistentState,
) {
  if (typeof window === "undefined") {
    return
  }

  const previousState = readFeishuPagePersistentState(workspaceId)
  const treeQuery = normalizeText(state.docs.treeQuery)
  const treeRootDocId = normalizeText(state.docs.treeRootDocId)
  const previousTreeQuery = normalizeText(previousState.docs.treeQuery)
  const previousTreeRootDocId = normalizeText(previousState.docs.treeRootDocId)
  const nextState: FeishuPagePersistentState = {
    ...state,
    docs: {
      ...state.docs,
      treeQuery: treeQuery || (treeRootDocId ? state.docs.treeQuery : previousTreeQuery),
      treeRootDocId: treeRootDocId || previousTreeRootDocId,
    },
  }
  writeSavedDocsRootToken(nextState.docs.treeRootDocId || nextState.docs.treeQuery)

  window.localStorage.setItem(
    getFeishuPageStorageKey(workspaceId),
    JSON.stringify(nextState),
  )
}

export function mergeFeishuDocsUiStateWithWorkspaceRestore(
  localState: FeishuDocsWorkbenchUiState,
  restoreState: WorkspaceRestoreState | null | undefined,
): FeishuDocsWorkbenchUiState {
  const workspaceState = readWorkspaceDocsUiState(restoreState)
  const localActiveDocId = normalizeText(localState.activeDocId)
  const localTreeQuery = normalizeText(localState.treeQuery)
  const localTreeRootDocId = normalizeText(localState.treeRootDocId)
  const workspaceTreeQuery = normalizeText(workspaceState.treeQuery)
  const workspaceTreeRootDocId = normalizeText(workspaceState.treeRootDocId)
  const treeRootDocId = localTreeRootDocId || workspaceTreeRootDocId || localTreeQuery || workspaceTreeQuery || ""

  return {
    ...(localActiveDocId || workspaceState.activeDocId
      ? { activeDocId: localActiveDocId || workspaceState.activeDocId }
      : {}),
    treeQuery: localTreeQuery || workspaceTreeQuery || treeRootDocId,
    treeRootDocId,
    workspaceMode: "workspace",
    ...(localState.treeNodes ? { treeNodes: localState.treeNodes } : {}),
    ...(localState.expandedKeys ? { expandedKeys: localState.expandedKeys } : {}),
    ...(localState.checkedTreeKeys?.length
      ? { checkedTreeKeys: localState.checkedTreeKeys }
      : workspaceState.checkedTreeKeys?.length
        ? { checkedTreeKeys: workspaceState.checkedTreeKeys }
        : {}),
  }
}
