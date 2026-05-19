import type { WorkspaceRestoreState } from "../../lib/workspace"
import type { FeishuDocsWorkbenchUiState } from "./components/docs-workbench"

export type FeishuPageView =
  | "personal-docs"
  | "personal-docs-workspace"
  | "bot"
  | "smart-assistant"

export type FeishuPagePersistentState = {
  pageView: FeishuPageView
  docs: FeishuDocsWorkbenchUiState
}

export const FEISHU_DOCS_WORKSPACE_UI_KEY = "feishuDocsWorkspace"

const FEISHU_PAGE_STATE_STORAGE_PREFIX = "maomi.feishu.page-state"

export const DEFAULT_FEISHU_DOCS_UI_STATE: FeishuDocsWorkbenchUiState = {
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

function readWorkspaceDocsUiState(
  restoreState: WorkspaceRestoreState | null | undefined,
): Partial<FeishuDocsWorkbenchUiState> {
  const ui = asRecord(restoreState?.ui)
  const docsUi = asRecord(ui[FEISHU_DOCS_WORKSPACE_UI_KEY])
  const activeDocId = normalizeText(docsUi.activeDocId)
  const treeRootDocId = normalizeText(docsUi.treeRootDocId)
  const workspaceMode = docsUi.workspaceMode === "workspace" ? "workspace" : undefined

  return {
    ...(activeDocId ? { activeDocId } : {}),
    ...(treeRootDocId ? { treeRootDocId } : {}),
    ...(workspaceMode ? { workspaceMode } : {}),
  }
}

export function isSameDocsUiState(
  previous: FeishuDocsWorkbenchUiState,
  next: FeishuDocsWorkbenchUiState,
): boolean {
  return (
    (previous.activeDocId ?? "") === (next.activeDocId ?? "")
    && previous.treeRootDocId === next.treeRootDocId
    && previous.workspaceMode === next.workspaceMode
  )
}

export function getFeishuPageStorageKey(workspaceId?: string): string {
  return `${FEISHU_PAGE_STATE_STORAGE_PREFIX}:${workspaceId?.trim() || "global"}`
}

export function readFeishuPagePersistentState(workspaceId?: string): FeishuPagePersistentState {
  if (typeof window === "undefined") {
    return {
      pageView: "personal-docs",
      docs: DEFAULT_FEISHU_DOCS_UI_STATE,
    }
  }

  try {
    const rawValue = window.localStorage.getItem(getFeishuPageStorageKey(workspaceId))
    if (!rawValue) {
      return {
        pageView: "personal-docs",
        docs: DEFAULT_FEISHU_DOCS_UI_STATE,
      }
    }

    const parsed = JSON.parse(rawValue) as {
      pageView?: string
      docs?: Partial<FeishuDocsWorkbenchUiState>
    }

    return {
      pageView:
        parsed.pageView === "smart-assistant"
          ? "smart-assistant"
          : parsed.pageView === "personal-docs-workspace"
          ? "personal-docs-workspace"
          : parsed.pageView === "bot"
            ? "bot"
            : "personal-docs",
      docs: {
        activeDocId: typeof parsed.docs?.activeDocId === "string" ? parsed.docs.activeDocId : undefined,
        treeRootDocId: typeof parsed.docs?.treeRootDocId === "string" ? parsed.docs.treeRootDocId : "",
        workspaceMode: "workspace",
      },
    }
  } catch {
    return {
      pageView: "personal-docs",
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

  window.localStorage.setItem(
    getFeishuPageStorageKey(workspaceId),
    JSON.stringify(state),
  )
}

export function mergeFeishuDocsUiStateWithWorkspaceRestore(
  localState: FeishuDocsWorkbenchUiState,
  restoreState: WorkspaceRestoreState | null | undefined,
): FeishuDocsWorkbenchUiState {
  const workspaceState = readWorkspaceDocsUiState(restoreState)
  const localActiveDocId = normalizeText(localState.activeDocId)
  const localTreeRootDocId = normalizeText(localState.treeRootDocId)

  return {
    ...(localActiveDocId || workspaceState.activeDocId
      ? { activeDocId: localActiveDocId || workspaceState.activeDocId }
      : {}),
    treeRootDocId: localTreeRootDocId || workspaceState.treeRootDocId || "",
    workspaceMode: "workspace",
  }
}
