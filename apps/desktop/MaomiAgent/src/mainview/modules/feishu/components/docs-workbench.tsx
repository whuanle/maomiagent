import {
  BorderOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  ApartmentOutlined,
  ArrowLeftOutlined,
  CaretRightFilled,
  DownloadOutlined,
  FileTextOutlined,
  MessageOutlined,
  MinusSquareOutlined,
  NodeExpandOutlined,
  PartitionOutlined,
  PlusSquareOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons"
import {
  Alert,
  Modal,
  Button,
  Empty,
  Input,
  Popconfirm,
  Radio,
  Spin,
  Tag,
  Tooltip,
  Tree,
  Typography,
  type TreeDataNode,
  type TreeProps,
} from "antd"
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  FeishuDocContentView,
  FeishuDocMediaPreviewErrorItem,
  FeishuDocPermissionInspectView,
  FeishuDocPullDiagnosticsView,
  FeishuDocSummary,
  FeishuDocTreeNode,
  FeishuDocTreeSnapshotNode,
  FeishuStateView,
} from "../../../../shared/desktop-feishu"
import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir"
import { FEISHU_DOC_WRITER_AGENT_ID } from "../../../../shared/conversation/managed-execution"
import type { FeishuTranslate as Translate } from "../types"
import {
  fetchFeishuDocContent,
  fetchFeishuDocMediaPreviewUrls,
  fetchFeishuDocsCapabilities,
  fetchFeishuWorkspaceDocLocalDraft,
  inspectFeishuWorkspaceDocPermissions,
  loadFeishuDocTreeBranch,
  loadFeishuDocTreeRoot,
  openFeishuWorkspaceDoc,
  pullFeishuWorkspaceDoc,
  pushFeishuWorkspaceDoc,
  saveFeishuWorkspaceDocLocalDraft,
  subscribeFeishuDocMutations,
} from "../../../lib/feishu"
import { notificationCenter, notifier } from "../../../lib/notifications"
import { useAppService } from "../../../services/app-service-container"
import { FRONTEND_CONVERSATION_LAUNCHER_PORT } from "../../../services/conversation/feature-contracts"
import { FeishuDocSourceEditor } from "./feishu-doc-source-editor"
import { FeishuDocVisualEditor } from "./feishu-doc-visual-editor"
import {
  createFeishuDocPreviewIR,
  extractFeishuMediaTokens,
} from "./feishu-doc-preview-support"
import {
  buildFeishuDocChatDraftBatchText,
  buildFeishuDocChatDraftText,
} from "./feishu-doc-chat-draft"
import {
  collectNodeAndDescendantKeys,
  mergeCheckedKeys,
  removeDescendantKeys,
} from "./feishu-doc-tree-selection"
import { FeishuDocPermissionInspectModal } from "./feishu-doc-permission-inspect-modal"

const { Text, Title } = Typography

type FeishuDocWorkspaceViewMode = "preview" | "edit"

export type FeishuDocWorkspaceMode = "workspace"

export type FeishuDocsTreeSnapshotNode = {
  key: string
  title: string
  isLeaf?: boolean
  loaded?: boolean
  doc?: FeishuDocSummary
  children?: FeishuDocsTreeSnapshotNode[]
}

export type FeishuDocsWorkbenchUiState = {
  activeDocId?: string
  treeQuery: string
  treeRootDocId: string
  workspaceMode: FeishuDocWorkspaceMode
  treeNodes?: FeishuDocsTreeSnapshotNode[]
  expandedKeys?: string[]
  checkedTreeKeys?: string[]
}

type DocsTreeNode = TreeDataNode & FeishuDocsTreeSnapshotNode

type CheckedConversationTarget = {
  key: string
  title: string
  docId: string
  resolvedDocId?: string
  url?: string
  updateTime?: string
}

type TreeSelectionMode = "include_subtree" | "current_only"

type Props = {
  active: boolean
  baseUrl: string
  workspaceId: string
  state: FeishuStateView | null
  loading: boolean
  loadError: string
  t: Translate
  initialDocId?: string
  initialTreeQuery?: string
  initialTreeRootDocId?: string
  initialTreeNodes?: FeishuDocsTreeSnapshotNode[]
  initialExpandedKeys?: string[]
  initialCheckedTreeKeys?: string[]
  onReloadState?: () => void
  onBackToSettings?: () => void
  onUiStateChange?: (state: FeishuDocsWorkbenchUiState) => void
}

function formatRelativeDocUpdateTime(value: string | undefined, t: Translate): string {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diff = Math.max(0, Date.now() - date.getTime())
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 30) {
    return date.toLocaleDateString("zh-CN")
  }
  if (days > 0) {
    return t("飞书页.文档.时间.天前", { 数量: days })
  }
  if (hours > 0) {
    return t("飞书页.文档.时间.小时前", { 数量: hours })
  }
  if (minutes > 0) {
    return t("飞书页.文档.时间.分钟前", { 数量: minutes })
  }
  return t("飞书页.文档.时间.刚刚")
}

function resolveStatusTagColor(status: "blocked" | "limited" | "ready" | "probing"): string {
  return status === "ready"
    ? "green"
    : status === "limited"
      ? "orange"
      : status === "probing"
        ? "blue"
        : "default"
}

function resolveStatusTagText(status: "blocked" | "limited" | "ready" | "probing", t: Translate): string {
  return status === "ready"
    ? t("飞书页.文档.状态标签.已接通")
    : status === "limited"
      ? t("飞书页.文档.状态标签.部分受限")
      : status === "probing"
        ? t("飞书页.文档.状态标签.探测中")
        : t("飞书页.文档.状态标签.当前阻断")
}

function mapTreeNodes(items: FeishuDocTreeNode[]): DocsTreeNode[] {
  return items.map(mapTreeNode)
}

function mapTreeSnapshotNodes(items: FeishuDocTreeSnapshotNode[]): DocsTreeNode[] {
  return items.map((item) => ({
    ...mapTreeNode(item),
    loaded: item.hasChild !== true || Boolean(item.children?.length),
    ...(item.children?.length ? { children: mapTreeSnapshotNodes(item.children) } : {}),
  }))
}

function mapTreeNode(item: FeishuDocTreeNode): DocsTreeNode {
  return {
    key: item.token,
    title: item.title,
    isLeaf: item.hasChild !== true,
    loaded: item.hasChild !== true,
    doc: {
      id: item.token,
      token: item.token,
      kind: item.kind,
      docId: item.token,
      resolvedDocId: item.resolvedDocId ?? item.docId ?? item.token,
      title: item.title,
      objType: item.objType,
      updateTime: item.updatedAt ?? item.updateTime,
      hasChild: item.hasChild,
    },
  }
}

function replaceChildren(nodes: DocsTreeNode[], key: string, children: DocsTreeNode[]): DocsTreeNode[] {
  return nodes.map((node) => {
    if (node.key === key) {
      return {
        ...node,
        loaded: true,
        isLeaf: children.length === 0,
        ...(children.length > 0 ? { children } : {}),
      }
    }
    if (!node.children?.length) {
      return node
    }
    return {
      ...node,
      children: replaceChildren(node.children, key, children),
    }
  })
}

function findTreeNodeByKey(nodes: DocsTreeNode[], key: string): DocsTreeNode | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    if (node.children?.length) {
      const nested = findTreeNodeByKey(node.children, key)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function collectExpandableKeys(nodes: DocsTreeNode[]): string[] {
  const keys: string[] = []

  for (const node of nodes) {
    if (!node.children?.length) {
      continue
    }
    keys.push(node.key)
    keys.push(...collectExpandableKeys(node.children))
  }

  return keys
}

function collectTreeKeys(nodes: DocsTreeNode[]): string[] {
  const keys: string[] = []

  for (const node of nodes) {
    keys.push(String(node.key))
    if (node.children?.length) {
      keys.push(...collectTreeKeys(node.children))
    }
  }

  return keys
}

function mergeExpandedKeyLists(currentKeys: string[], nextKeys: string[]): string[] {
  const merged = [...currentKeys]
  const knownKeys = new Set(currentKeys)

  for (const key of nextKeys) {
    if (knownKeys.has(key)) {
      continue
    }
    knownKeys.add(key)
    merged.push(key)
  }

  return merged
}

function normalizeExpandedKeys(keys: string[] | undefined): string[] {
  if (!keys?.length) {
    return []
  }

  const normalizedKeys: string[] = []
  const knownKeys = new Set<string>()

  for (const key of keys) {
    const normalizedKey = key.trim()
    if (!normalizedKey || knownKeys.has(normalizedKey)) {
      continue
    }

    knownKeys.add(normalizedKey)
    normalizedKeys.push(normalizedKey)
  }

  return normalizedKeys
}

function snapshotTreeNodes(nodes: DocsTreeNode[]): FeishuDocsTreeSnapshotNode[] {
  return nodes.map((node) => ({
    key: node.key,
    title: node.title,
    ...(typeof node.isLeaf === "boolean" ? { isLeaf: node.isLeaf } : {}),
    ...(typeof node.loaded === "boolean" ? { loaded: node.loaded } : {}),
    ...(node.doc ? { doc: node.doc } : {}),
    ...(node.children?.length ? { children: snapshotTreeNodes(node.children) } : {}),
  }))
}

function restoreTreeNodesSnapshot(nodes: FeishuDocsTreeSnapshotNode[] | undefined): DocsTreeNode[] {
  if (!nodes?.length) {
    return []
  }

  return nodes.map((node) => ({
    key: node.key,
    title: node.title,
    ...(typeof node.isLeaf === "boolean" ? { isLeaf: node.isLeaf } : {}),
    ...(typeof node.loaded === "boolean" ? { loaded: node.loaded } : {}),
    ...(node.doc ? { doc: node.doc } : {}),
    ...(node.children?.length ? { children: restoreTreeNodesSnapshot(node.children) } : {}),
  }))
}

function resolveInitialExpandedKeys(nodes: DocsTreeNode[], keys: string[] | undefined): string[] {
  const normalizedKeys = normalizeExpandedKeys(keys)
  return normalizedKeys.length > 0 ? normalizedKeys : collectExpandableKeys(nodes)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function resolveRemoteDocId(doc: {
  docId?: string
  resolvedDocId?: string
  cache?: { resolvedDocId?: string }
} | null | undefined): string {
  return doc?.resolvedDocId ?? doc?.cache?.resolvedDocId ?? doc?.docId ?? ""
}

function findTreeNodeKeyByDocId(nodes: DocsTreeNode[], docId: string): string | null {
  for (const node of nodes) {
    if (node.doc?.docId === docId) {
      return node.key
    }
    if (node.children?.length) {
      const nested = findTreeNodeKeyByDocId(node.children, docId)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function getDocsMcp(state: FeishuStateView | null) {
  return state?.smartAssistant.docsMcp
    ?? state?.managedMcp
    ?? null
}

function isRemoteDocsReady(state: FeishuStateView | null): boolean {
  return Boolean(getDocsMcp(state)?.mcpId?.trim())
}

function resolveRemoteDocsBlockedMessage(input: {
  state: FeishuStateView | null
}): string {
  const smartAssistantAuthorized =
    input.state?.smartAssistant.authStatus === "authorized"
    || input.state?.developer?.authStatus === "authorized"

  if (!smartAssistantAuthorized) {
    return "请先完成飞书智能助手授权。"
  }

  if (!getDocsMcp(input.state)?.mcpId?.trim()) {
    return "飞书文档工作区未就绪，请先完成飞书智能助手配置。"
  }

  return ""
}

export function FeishuDocsWorkbench(props: Props) {
  const conversationLauncher = useAppService(FRONTEND_CONVERSATION_LAUNCHER_PORT)
  const hasWorkspaceContext = Boolean(props.workspaceId.trim())
  const remoteDocsReady = isRemoteDocsReady(props.state)
  const remoteDocsBlockedMessage = resolveRemoteDocsBlockedMessage({
    state: props.state,
  })
  const statePending = Boolean(props.baseUrl.trim()) && !props.state && !props.loadError.trim()
  const restoredInitialTreeNodesRef = useRef<DocsTreeNode[] | null>(null)
  if (restoredInitialTreeNodesRef.current === null) {
    restoredInitialTreeNodesRef.current = restoreTreeNodesSnapshot(props.initialTreeNodes)
  }
  const initialTreeNodes = restoredInitialTreeNodesRef.current
  const restoredTreeQuery = props.initialTreeQuery ?? props.initialTreeRootDocId ?? ""
  const restoredTreeRootDocId = props.initialTreeRootDocId?.trim() ? props.initialTreeRootDocId : restoredTreeQuery
  const [treeQuery, setTreeQuery] = useState(restoredTreeQuery)
  const [treeRootDocId, setTreeRootDocId] = useState(restoredTreeRootDocId)
  const appliedInitialTreeStateRef = useRef({
    treeQuery: restoredTreeQuery,
    treeRootDocId: restoredTreeRootDocId,
  })
  const [capabilityLoading, setCapabilityLoading] = useState(false)
  const [capabilityError, setCapabilityError] = useState("")
  const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof fetchFeishuDocsCapabilities>> | null>(null)
  const [treeNodes, setTreeNodes] = useState<DocsTreeNode[]>(initialTreeNodes)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeStatus, setTreeStatus] = useState<"idle" | "loading" | "cached" | "refreshing" | "ready" | "error">(
    initialTreeNodes.length > 0 ? "cached" : "idle",
  )
  const [treeError, setTreeError] = useState("")
  const [expandedKeys, setExpandedKeys] = useState<string[]>(
    () => resolveInitialExpandedKeys(initialTreeNodes, props.initialExpandedKeys),
  )
  const [checkedTreeKeys, setCheckedTreeKeys] = useState<string[]>(() => props.initialCheckedTreeKeys ?? [])
  const [treeSelectionMode, setTreeSelectionMode] = useState<TreeSelectionMode>("include_subtree")
  const [treeSelectionBusy, setTreeSelectionBusy] = useState(false)
  const [activeDoc, setActiveDoc] = useState<FeishuDocSummary | null>(null)
  const [currentDoc, setCurrentDoc] = useState<FeishuDocContentView | null>(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState("")
  const [draft, setDraft] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "caching" | "pulling" | "pushing" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState("")
  const [workspaceViewMode, setWorkspaceViewMode] = useState<FeishuDocWorkspaceViewMode>("preview")
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({})
  const [mediaPreviewErrors, setMediaPreviewErrors] = useState<FeishuDocMediaPreviewErrorItem[]>([])
  const [permissionInspectOpen, setPermissionInspectOpen] = useState(false)
  const [permissionInspectLoading, setPermissionInspectLoading] = useState(false)
  const [permissionInspectError, setPermissionInspectError] = useState("")
  const [permissionInspectResult, setPermissionInspectResult] = useState<FeishuDocPermissionInspectView | null>(null)
  const lastSavedDraftRef = useRef("")
  const initialDocLoadedRef = useRef(false)
  const draftRef = useRef("")
  const saveStateRef = useRef(saveState)
  const editSessionBaselineRef = useRef("")
  const hasPendingEditChangesRef = useRef(false)
  const activeDocIdRef = useRef("")
  const mediaPreviewRequestIdRef = useRef(0)
  const lastLoadErrorNoticeRef = useRef("")
  const lastAccessNoticeRef = useRef("")
  const lastPullDiagnosticNoticeRef = useRef("")
  const loadingTreeNodeKeysRef = useRef<Set<string>>(new Set())
  const treeHydrationRunIdRef = useRef(0)
  const treeNodesLengthRef = useRef(initialTreeNodes.length)
  const treeNodesRef = useRef(initialTreeNodes)
  const [hasPendingEditChanges, setHasPendingEditChanges] = useState(false)
  const [modal, modalContextHolder] = Modal.useModal()
  const wasPageActiveRef = useRef(props.active)

  const syncPendingEditChanges = useCallback((nextValue: boolean) => {
    hasPendingEditChangesRef.current = nextValue
    setHasPendingEditChanges((previous) => previous === nextValue ? previous : nextValue)
  }, [])

  const commitEditSessionBaseline = useCallback((markdown: string) => {
    editSessionBaselineRef.current = markdown
    syncPendingEditChanges(false)
  }, [syncPendingEditChanges])

  const persistDraftIfDirty = useCallback(async () => {
    if (!hasWorkspaceContext) {
      return currentDoc
    }
    if (!currentDoc?.docId || draft === lastSavedDraftRef.current) {
      return currentDoc
    }

    setSaveState("caching")
    const item = await saveFeishuWorkspaceDocLocalDraft(
      props.baseUrl,
      props.workspaceId,
      currentDoc.docId,
      {
        title: currentDoc.title,
        markdown: draft,
      },
    )
    lastSavedDraftRef.current = item.markdown
    startTransition(() => {
      setCurrentDoc(item)
      setSaveError("")
      setSaveState("saved")
    })
    return item
  }, [currentDoc, draft, hasWorkspaceContext, props.baseUrl, props.workspaceId])

  const handleSaveEditSession = useCallback(async () => {
    if (!currentDoc?.docId || !hasWorkspaceContext) {
      return false
    }

    try {
      const item = await persistDraftIfDirty()
      const nextDoc = item ?? currentDoc
      const nextMarkdown = item?.markdown ?? draft

      lastSavedDraftRef.current = nextMarkdown
      commitEditSessionBaseline(nextMarkdown)
      startTransition(() => {
        setCurrentDoc(nextDoc)
        setDraft(nextMarkdown)
        setSaveError("")
        setSaveState("saved")
      })
      notifier.success(props.t("飞书页.文档.反馈.草稿已保存"))
      return true
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      setSaveState("error")
      return false
    }
  }, [commitEditSessionBaseline, currentDoc, draft, hasWorkspaceContext, persistDraftIfDirty, props.t])

  const handleCancelEditSession = useCallback(async () => {
    if (!currentDoc) {
      return false
    }

    const baselineMarkdown = editSessionBaselineRef.current
    if (baselineMarkdown === draft) {
      commitEditSessionBaseline(baselineMarkdown)
      setWorkspaceViewMode("preview")
      return true
    }

    try {
      setSaveError("")
      if (hasWorkspaceContext && currentDoc.docId) {
        setSaveState("caching")
        const item = await saveFeishuWorkspaceDocLocalDraft(
          props.baseUrl,
          props.workspaceId,
          currentDoc.docId,
          {
            title: currentDoc.title,
            markdown: baselineMarkdown,
            force: true,
          },
        )

        lastSavedDraftRef.current = item.markdown
        commitEditSessionBaseline(item.markdown)
        startTransition(() => {
          setCurrentDoc(item)
          setDraft(item.markdown)
          setSaveState("saved")
          setWorkspaceViewMode("preview")
        })
      } else {
        commitEditSessionBaseline(baselineMarkdown)
        startTransition(() => {
          setCurrentDoc((previous) => previous ? { ...previous, markdown: baselineMarkdown } : previous)
          setDraft(baselineMarkdown)
          setSaveState("saved")
          setWorkspaceViewMode("preview")
        })
      }

      notifier.success(props.t("飞书页.文档.反馈.已取消编辑"))
      return true
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      setSaveState("error")
      return false
    }
  }, [commitEditSessionBaseline, currentDoc, draft, hasWorkspaceContext, props.baseUrl, props.t, props.workspaceId])

  const confirmSaveBeforeLeave = useCallback(async () => {
    if (!hasPendingEditChangesRef.current) {
      return true
    }

    const confirmed = await modal.confirm({
      title: props.t("飞书页.文档.提示.离开前保存"),
      content: props.t("飞书页.文档.提示.离开前保存说明"),
      okText: props.t("飞书页.文档.按钮.保存并继续"),
      cancelText: props.t("飞书页.文档.按钮.继续编辑"),
      okButtonProps: { type: "primary" },
    })

    if (!confirmed) {
      return false
    }

    return handleSaveEditSession()
  }, [handleSaveEditSession, modal, props.t])

  const loadCapabilities = useCallback(async () => {
    if (!props.baseUrl || !remoteDocsReady) {
      setCapabilities(null)
      setCapabilityError("")
      setCapabilityLoading(false)
      return
    }

    try {
      setCapabilityLoading(true)
      const item = await fetchFeishuDocsCapabilities(props.baseUrl)
      setCapabilities(item)
      setCapabilityError("")
    } catch (error) {
      setCapabilityError(error instanceof Error ? error.message : String(error))
    } finally {
      setCapabilityLoading(false)
    }
  }, [props.baseUrl, remoteDocsReady])

  const hydrateTreeBranches = useCallback(async (
    rootToken: string,
    nodes: DocsTreeNode[],
    options?: { forceRefresh?: boolean; runId?: number },
  ): Promise<DocsTreeNode[]> => {
    const runId = options?.runId ?? ++treeHydrationRunIdRef.current
    const visitedKeys = new Set<string>()
    let nextNodesSnapshot = nodes

    const visitNode = async (node: DocsTreeNode, lineage: Set<string>): Promise<void> => {
      if (treeHydrationRunIdRef.current !== runId || node.isLeaf || !node.key || lineage.has(node.key)) {
        return
      }

      const parentKey = node.key
      if (visitedKeys.has(parentKey) || loadingTreeNodeKeysRef.current.has(parentKey)) {
        return
      }

      visitedKeys.add(parentKey)
      loadingTreeNodeKeysRef.current.add(parentKey)

      try {
        const result = await loadFeishuDocTreeBranch(props.baseUrl, {
          rootToken,
          parentToken: parentKey,
          forceRefresh: options?.forceRefresh,
        })

        if (treeHydrationRunIdRef.current !== runId) {
          return
        }

        const childNodes = mapTreeNodes(result.nodes)
        nextNodesSnapshot = replaceChildren(nextNodesSnapshot, parentKey, childNodes)
        setTreeNodes((previous) => replaceChildren(previous, parentKey, childNodes))
        setExpandedKeys((previous) => mergeExpandedKeyLists(previous, [parentKey]))
        if (result.error) {
          return
        }

        const nextLineage = new Set(lineage)
        nextLineage.add(parentKey)
        for (const childNode of childNodes) {
          await visitNode(childNode, nextLineage)
        }
      } catch (error) {
        void error
      } finally {
        loadingTreeNodeKeysRef.current.delete(parentKey)
      }
    }

    for (const node of nodes) {
      await visitNode(node, new Set())
    }

    return nextNodesSnapshot
  }, [props.baseUrl])

  const loadTree = useCallback(async (
    rootDocId: string,
    options?: { forceRefresh?: boolean; preloadSubtree?: boolean },
  ) => {
    const normalizedRootDocId = rootDocId.trim()
    if (!normalizedRootDocId) {
      treeHydrationRunIdRef.current += 1
      loadingTreeNodeKeysRef.current.clear()
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError("")
      setTreeLoading(false)
      setTreeStatus("idle")
      return
    }

    if (!props.baseUrl || !remoteDocsReady) {
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError(remoteDocsBlockedMessage)
      setTreeLoading(false)
      setTreeStatus("error")
      return
    }
    if (capabilities && !capabilities.canBrowseTree) {
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError(props.t("飞书页.文档.接入状态.未暴露工具.描述"))
      setTreeLoading(false)
      setTreeStatus("error")
      return
    }

    try {
      setTreeLoading(true)
      setTreeStatus("loading")
      setTreeError("")
      const hydrationRunId = treeHydrationRunIdRef.current + 1
      treeHydrationRunIdRef.current = hydrationRunId
      loadingTreeNodeKeysRef.current.clear()
      const result = await loadFeishuDocTreeRoot(props.baseUrl, {
        token: normalizedRootDocId,
        forceRefresh: options?.forceRefresh,
        preloadSubtree: options?.preloadSubtree,
      })
      const nextNodes = result.subtree?.length
        ? mapTreeSnapshotNodes(result.subtree)
        : mapTreeNodes(result.nodes)
      setTreeNodes(nextNodes)
      setExpandedKeys((previous) => result.source === "cache" ? previous : collectExpandableKeys(nextNodes))
      setTreeError(result.error ?? "")
      const shouldPreloadSubtree = options?.preloadSubtree === true
      const hasHydratedSubtree = Boolean(result.subtree?.length)
      setTreeStatus(
        shouldPreloadSubtree
          ? hasHydratedSubtree ? "ready" : "refreshing"
          : result.source === "cache"
            ? "cached"
            : result.refreshing
              ? "refreshing"
              : "ready",
      )
      if (!result.error) {
        if (hasHydratedSubtree) {
          return
        }
        if (shouldPreloadSubtree) {
          await hydrateTreeBranches(normalizedRootDocId, nextNodes, {
            forceRefresh: options?.forceRefresh,
            runId: hydrationRunId,
          })
          if (treeHydrationRunIdRef.current === hydrationRunId) {
            setTreeStatus("ready")
          }
        } else {
          void hydrateTreeBranches(normalizedRootDocId, nextNodes, { forceRefresh: options?.forceRefresh })
        }
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error))
      setTreeStatus("error")
      if (treeNodesLengthRef.current === 0) {
        setExpandedKeys([])
      }
    } finally {
      setTreeLoading(false)
    }
  }, [
    capabilities,
    hydrateTreeBranches,
    props.baseUrl,
    props.t,
    remoteDocsBlockedMessage,
    remoteDocsReady,
  ])

  const handleOpenDoc = useCallback(async (doc: FeishuDocSummary) => {
    const docId = doc.docId ?? doc.id
    const remoteDocId = resolveRemoteDocId(doc) || docId
    if (!docId) {
      return
    }
    if (capabilities && !capabilities.canReadDocs) {
      setDocError(props.t("飞书页.文档.接入状态.目录浏览模式.描述"))
      return
    }

    try {
      if (currentDoc?.docId && currentDoc.docId !== docId && hasPendingEditChangesRef.current) {
        const canLeaveCurrentDoc = await confirmSaveBeforeLeave()
        if (!canLeaveCurrentDoc) {
          return
        }
      }

      if (currentDoc?.docId && currentDoc.docId !== docId && draft !== lastSavedDraftRef.current) {
        await persistDraftIfDirty()
      }

      setDocLoading(true)
      let item = props.workspaceId
        ? await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)
        : await fetchFeishuDocContent(props.baseUrl, remoteDocId)

      setActiveDoc((previous) => ({
        ...previous,
        ...doc,
        id: doc.id ?? docId,
        docId,
        resolvedDocId: item.resolvedDocId ?? doc.resolvedDocId ?? remoteDocId ?? undefined,
        url: doc.url ?? (previous?.docId === docId ? previous.url : undefined),
      }))
      commitEditSessionBaseline(item.markdown)
      setCurrentDoc(item)
      setDraft(item.markdown)
      lastSavedDraftRef.current = item.markdown
      setDocError("")
      setSaveError("")
      setSaveState("saved")
      setWorkspaceViewMode("preview")
    } catch (error) {
      setDocError(error instanceof Error ? error.message : String(error))
    } finally {
      setDocLoading(false)
    }
  }, [
    capabilities,
    commitEditSessionBaseline,
    confirmSaveBeforeLeave,
    currentDoc?.docId,
    draft,
    persistDraftIfDirty,
    props.baseUrl,
    props.t,
    props.workspaceId,
  ])

  const handleReloadAll = useCallback(() => {
    void (async () => {
      try {
        await persistDraftIfDirty()
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error))
        setSaveState("error")
        return
      }

      void loadCapabilities()
      void loadTree(treeRootDocId, { forceRefresh: true, preloadSubtree: true })
      if (currentDoc?.docId) {
        void handleOpenDoc({
          id: currentDoc.docId,
          docId: currentDoc.docId,
          resolvedDocId: currentDoc.resolvedDocId ?? currentDoc.cache?.resolvedDocId,
          title: currentDoc.title,
          updateTime: activeDoc?.updateTime,
        })
      }
      props.onReloadState?.()
    })()
  }, [
    activeDoc?.updateTime,
    currentDoc?.docId,
    currentDoc?.title,
    handleOpenDoc,
    loadCapabilities,
    loadTree,
    persistDraftIfDirty,
    props,
    treeRootDocId,
  ])

  const loadPermissionInspect = useCallback(async () => {
    if (!currentDoc?.docId || !hasWorkspaceContext) {
      return
    }

    setPermissionInspectLoading(true)
    setPermissionInspectError("")
    setPermissionInspectResult(null)
    try {
      const result = await inspectFeishuWorkspaceDocPermissions(props.baseUrl, props.workspaceId, currentDoc.docId)
      setPermissionInspectResult(result)
    } catch (error) {
      setPermissionInspectError(error instanceof Error ? error.message : String(error))
    } finally {
      setPermissionInspectLoading(false)
    }
  }, [currentDoc?.docId, hasWorkspaceContext, props.baseUrl, props.workspaceId])

  const noticePullDiagnostics = useCallback((docId: string, diagnostics?: FeishuDocPullDiagnosticsView) => {
    const whiteboardRecovery = diagnostics?.whiteboardRecovery
    if (!whiteboardRecovery || whiteboardRecovery.fallbackCount === 0) {
      return
    }

    const hasAuth = whiteboardRecovery.entries.some((entry) => entry.category === "auth")
    const hasPermission = whiteboardRecovery.permissionDeniedCount > 0
    const noticeKey = [
      docId,
      whiteboardRecovery.status,
      whiteboardRecovery.fallbackCount,
      whiteboardRecovery.permissionDeniedCount,
      hasAuth,
    ].join(":")
    if (lastPullDiagnosticNoticeRef.current === noticeKey) {
      return
    }

    lastPullDiagnosticNoticeRef.current = noticeKey
    notificationCenter.warning({
      title: hasAuth
        ? props.t("飞书页.文档.反馈.拉取降级.授权.标题")
        : hasPermission
          ? props.t("飞书页.文档.反馈.拉取降级.权限.标题")
          : props.t("飞书页.文档.反馈.拉取降级.通用.标题"),
      description: hasAuth
        ? props.t("飞书页.文档.反馈.拉取降级.授权.描述")
        : hasPermission
          ? props.t("飞书页.文档.反馈.拉取降级.权限.描述", { 数量: whiteboardRecovery.permissionDeniedCount })
          : props.t("飞书页.文档.反馈.拉取降级.通用.描述"),
      duration: 5.5,
    })
  }, [props.t])

  const handlePullDoc = useCallback(async () => {
    if (!currentDoc?.docId) {
      return
    }

    try {
      setSaveError("")
      setSaveState("pulling")
      if (hasWorkspaceContext) {
        const result = await pullFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId)
        commitEditSessionBaseline(result.item.markdown)
        setCurrentDoc(result.item)
        setDraft(result.item.markdown)
        lastSavedDraftRef.current = result.item.markdown
        noticePullDiagnostics(result.item.docId, result.diagnostics ?? result.item.diagnostics?.latestPull)
      } else {
        const item = await fetchFeishuDocContent(
          props.baseUrl,
          resolveRemoteDocId(currentDoc) || resolveRemoteDocId(activeDoc) || currentDoc.docId,
        )
        commitEditSessionBaseline(item.markdown)
        setCurrentDoc(item)
        setDraft(item.markdown)
        lastSavedDraftRef.current = item.markdown
      }
      setSaveError("")
      setSaveState("saved")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      setSaveState("error")
    }
  }, [
    activeDoc,
    commitEditSessionBaseline,
    currentDoc,
    hasWorkspaceContext,
    noticePullDiagnostics,
    props.baseUrl,
    props.workspaceId,
  ])

  const handlePushDoc = useCallback(async () => {
    if (!currentDoc?.docId || !hasWorkspaceContext) {
      return
    }

    try {
      await persistDraftIfDirty()
      setSaveError("")
      setSaveState("pushing")
      const result = await pushFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId, {
        force: true,
      })
      commitEditSessionBaseline(result.item.markdown)
      setCurrentDoc(result.item)
      setDraft(result.item.markdown)
      lastSavedDraftRef.current = result.item.markdown
      setSaveError(result.pushStatus === "blocked" ? (result.message ?? "文档未推送") : "")
      setSaveState(result.pushStatus === "blocked" ? "error" : "saved")
      if (result.pushStatus !== "blocked") {
        notifier.success(props.t("飞书页.文档.反馈.推送已完成"))
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      setSaveState("error")
    }
  }, [
    commitEditSessionBaseline,
    currentDoc?.docId,
    currentDoc?.title,
    hasWorkspaceContext,
    persistDraftIfDirty,
    props.baseUrl,
    props.t,
    props.workspaceId,
  ])

  const handleTreeSubmit = useCallback(() => {
    const nextRoot = treeQuery.trim()
    if (nextRoot !== treeRootDocId.trim()) {
      setCheckedTreeKeys([])
    }
    setTreeRootDocId(nextRoot)
    void loadTree(nextRoot, { forceRefresh: true, preloadSubtree: true })
  }, [loadTree, treeQuery, treeRootDocId])

  const handleTreeQueryChange = useCallback((value: string) => {
    setTreeQuery(value)
  }, [])

  useEffect(() => {
    const nextTreeQuery = props.initialTreeQuery ?? props.initialTreeRootDocId ?? ""
    const nextTreeRootDocId = props.initialTreeRootDocId?.trim() ? props.initialTreeRootDocId : nextTreeQuery
    const previousInitial = appliedInitialTreeStateRef.current

    if (
      !nextTreeRootDocId.trim()
      || (previousInitial.treeQuery === nextTreeQuery && previousInitial.treeRootDocId === nextTreeRootDocId)
    ) {
      return
    }

    appliedInitialTreeStateRef.current = {
      treeQuery: nextTreeQuery,
      treeRootDocId: nextTreeRootDocId,
    }
    setTreeQuery((previous) => previous.trim() ? previous : nextTreeQuery)
    setTreeRootDocId((previous) => previous.trim() ? previous : nextTreeRootDocId)
  }, [props.initialTreeQuery, props.initialTreeRootDocId])

  useEffect(() => {
    if (!props.initialCheckedTreeKeys?.length) {
      return
    }

    setCheckedTreeKeys((previous) => previous.length > 0 ? previous : props.initialCheckedTreeKeys ?? [])
  }, [props.initialCheckedTreeKeys])

  const handleLoadTreeData = useCallback<NonNullable<TreeProps["loadData"]>>(async (node) => {
    if (!remoteDocsReady || (capabilities && !capabilities.canBrowseTree)) {
      return
    }

    const current = node as DocsTreeNode
    if (!current.key || current.loaded || current.isLeaf) {
      return
    }

    if (loadingTreeNodeKeysRef.current.has(current.key)) {
      return
    }

    loadingTreeNodeKeysRef.current.add(current.key)
    try {
      const result = await loadFeishuDocTreeBranch(props.baseUrl, {
        rootToken: treeRootDocId || current.key,
        parentToken: current.key,
      })
      const childNodes = mapTreeNodes(result.nodes)
      setTreeNodes((previous) => replaceChildren(previous, current.key, childNodes))
      setExpandedKeys((previous) => mergeExpandedKeyLists(previous, [current.key]))
      hydrateTreeBranches(treeRootDocId || current.key, childNodes)
      if (result.error) {
        setTreeError(result.error)
        setTreeStatus("error")
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error))
      setTreeStatus("error")
    } finally {
      loadingTreeNodeKeysRef.current.delete(current.key)
    }
  }, [capabilities, props.baseUrl, remoteDocsReady, treeRootDocId])

  useEffect(() => {
    if (!remoteDocsReady) {
      setCapabilities(null)
      setCapabilityError("")
      setCapabilityLoading(false)
      return
    }

    void loadCapabilities()
  }, [loadCapabilities, remoteDocsReady])

  useEffect(() => {
    if (statePending) {
      setTreeError("")
      if (treeNodesLengthRef.current === 0) {
        setTreeLoading(true)
        setTreeStatus("loading")
      }
      return
    }

    if (!remoteDocsReady) {
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError(remoteDocsBlockedMessage)
      setTreeLoading(false)
      setTreeStatus("error")
      return
    }

    void loadTree(treeRootDocId.trim(), { preloadSubtree: true })
  }, [loadTree, remoteDocsBlockedMessage, remoteDocsReady, statePending, treeRootDocId])

  useEffect(() => {
    treeNodesRef.current = treeNodes
    treeNodesLengthRef.current = treeNodes.length
  }, [treeNodes])

  useEffect(() => {
    if (treeNodes.length === 0) {
      return
    }

    const availableKeys = new Set(collectTreeKeys(treeNodes))
    setCheckedTreeKeys((previous) => {
      const nextKeys = previous.filter((key) => availableKeys.has(key))
      return nextKeys.length === previous.length ? previous : nextKeys
    })
  }, [treeNodes])

  useEffect(() => {
    if (initialDocLoadedRef.current || !props.initialDocId) {
      return
    }

    initialDocLoadedRef.current = true
    void handleOpenDoc({
      id: props.initialDocId,
      docId: props.initialDocId,
      title: props.initialDocId,
    })
  }, [handleOpenDoc, props.initialDocId])

  useEffect(() => {
    props.onUiStateChange?.({
      activeDocId: currentDoc?.docId ?? activeDoc?.docId ?? activeDoc?.id,
      treeQuery,
      treeRootDocId,
      workspaceMode: "workspace",
      treeNodes: snapshotTreeNodes(treeNodes),
      expandedKeys: normalizeExpandedKeys(expandedKeys),
      checkedTreeKeys,
    })
  }, [activeDoc?.docId, activeDoc?.id, checkedTreeKeys, currentDoc?.docId, expandedKeys, props, treeNodes, treeQuery, treeRootDocId])

  useEffect(() => {
    if (!currentDoc) {
      commitEditSessionBaseline("")
      return
    }

    syncPendingEditChanges(draft !== editSessionBaselineRef.current)

    if (draft !== lastSavedDraftRef.current) {
      setSaveState((previous) => previous === "pushing" || previous === "pulling" ? previous : "dirty")
    }
  }, [commitEditSessionBaseline, currentDoc, draft, syncPendingEditChanges])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

  useEffect(() => {
    if (!hasWorkspaceContext || !hasPendingEditChanges) {
      return undefined
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [hasPendingEditChanges, hasWorkspaceContext])

  useEffect(() => {
    const becameInactive = !props.active && wasPageActiveRef.current
    wasPageActiveRef.current = props.active

    if (!becameInactive || !hasPendingEditChangesRef.current) {
      return
    }

    void confirmSaveBeforeLeave()
  }, [confirmSaveBeforeLeave, props.active])

  useEffect(() => {
    if (!hasWorkspaceContext) {
      return
    }
    if (!currentDoc?.docId || draft === lastSavedDraftRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setSaveState("caching")
          const item = await saveFeishuWorkspaceDocLocalDraft(
            props.baseUrl,
            props.workspaceId,
            currentDoc.docId,
            {
              title: currentDoc.title,
              markdown: draft,
            },
          )
          lastSavedDraftRef.current = item.markdown
          startTransition(() => {
            setCurrentDoc(item)
            setSaveError("")
            setSaveState("saved")
          })
        } catch (error) {
          setSaveError(error instanceof Error ? error.message : String(error))
          setSaveState("error")
        }
      })()
    }, 420)

    return () => {
      window.clearTimeout(timer)
    }
  }, [currentDoc?.docId, currentDoc?.title, draft, hasWorkspaceContext, props.baseUrl, props.workspaceId])

  const activeDocId = currentDoc?.docId ?? activeDoc?.docId ?? activeDoc?.id ?? ""
  const mediaTokens = useMemo(() => extractFeishuMediaTokens(draft), [draft])
  const mediaTokenKey = useMemo(() => mediaTokens.join("|"), [mediaTokens])
  const mediaPreviewErrorMap = useMemo(
    () => Object.fromEntries(mediaPreviewErrors.map((item) => [item.fileToken, item.message])),
    [mediaPreviewErrors],
  )
  const draftDocIR = useMemo(
    () => currentDoc ? createFeishuDocPreviewIR({
      docId: currentDoc.docId,
      title: currentDoc.title,
      markdown: draft,
    }) : null,
    [currentDoc, draft],
  )

  useEffect(() => {
    activeDocIdRef.current = activeDocId
  }, [activeDocId])

  useEffect(() => {
    const activeTokens = new Set(mediaTokens)
    setMediaPreviewUrls((previous) => {
      const nextEntries = Object.entries(previous).filter(([token]) => activeTokens.has(token))
      if (nextEntries.length === Object.keys(previous).length) {
        return previous
      }
      return Object.fromEntries(nextEntries)
    })
    setMediaPreviewErrors((previous) => previous.filter((item) => activeTokens.has(item.fileToken)))

    if (!props.baseUrl || mediaTokens.length === 0) {
      mediaPreviewRequestIdRef.current += 1
      setMediaPreviewUrls((previous) => (Object.keys(previous).length === 0 ? previous : {}))
      setMediaPreviewErrors([])
      return
    }

    const requestId = mediaPreviewRequestIdRef.current + 1
    mediaPreviewRequestIdRef.current = requestId

    void fetchFeishuDocMediaPreviewUrls(props.baseUrl, {
      fileTokens: mediaTokens,
    }).then((result) => {
      if (mediaPreviewRequestIdRef.current !== requestId) {
        return
      }
      setMediaPreviewUrls((previous) => ({
        ...previous,
        ...Object.fromEntries(result.items.map((item) => [item.fileToken, item.tmpDownloadUrl])),
      }))
      setMediaPreviewErrors(result.errors)
    }).catch(() => {
      if (mediaPreviewRequestIdRef.current !== requestId) {
        return
      }
      setMediaPreviewErrors([])
    })
  }, [mediaTokenKey, mediaTokens, props.baseUrl])

  useEffect(() => {
    if (!props.baseUrl || !props.workspaceId) {
      return
    }

    return subscribeFeishuDocMutations(props.baseUrl, (event) => {
      if (
        saveStateRef.current === "pulling"
        || saveStateRef.current === "pushing"
        || draftRef.current !== lastSavedDraftRef.current
      ) {
        return
      }

      const eventRecord = isRecord(event) ? event : {}
      const payload = isRecord(eventRecord.payload) ? eventRecord.payload : {}
      const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId.trim() : ""
      const docId = typeof payload.docId === "string" ? payload.docId.trim() : ""
      if (!workspaceId || !docId || workspaceId !== props.workspaceId || docId !== activeDocIdRef.current) {
        return
      }

      void (async () => {
        try {
          const item = await fetchFeishuWorkspaceDocLocalDraft(props.baseUrl, props.workspaceId, docId)
          lastSavedDraftRef.current = item.markdown
          commitEditSessionBaseline(item.markdown)
          startTransition(() => {
            setCurrentDoc(item)
            setDraft(item.markdown)
            setSaveError("")
            setSaveState("saved")
          })
        } catch {
          // Ignore background refresh failures and keep the current editor state.
        }
      })()
    })
  }, [commitEditSessionBaseline, props.baseUrl, props.workspaceId])

  const access = useMemo(() => {
    if (statePending) {
      return {
        status: "probing" as const,
        title: props.t("飞书页.文档.接入状态.探测中.标题"),
        message: props.t("飞书页.文档.接入状态.探测中.描述"),
      }
    }
    if (!getDocsMcp(props.state)?.mcpId) {
      return {
        status: "blocked" as const,
        title: props.t("飞书页.文档.接入状态.未启用.标题"),
        message: remoteDocsBlockedMessage || props.t("飞书页.文档.接入状态.未启用.描述"),
      }
    }
    if (capabilityError) {
      return {
        status: "blocked" as const,
        title: props.t("飞书页.文档.接入状态.能力探测失败.标题"),
        message: capabilityError,
      }
    }
    if (!capabilities || capabilityLoading) {
      return {
        status: "probing" as const,
        title: props.t("飞书页.文档.接入状态.探测中.标题"),
        message: props.t("飞书页.文档.接入状态.探测中.描述"),
      }
    }
    if (!capabilities?.canBrowseTree && !capabilities?.canReadDocs) {
      return {
        status: "blocked" as const,
        title: props.t("飞书页.文档.接入状态.未暴露工具.标题"),
        message: props.t("飞书页.文档.接入状态.未暴露工具.描述"),
      }
    }
    if (capabilities.canBrowseTree && !capabilities.canReadDocs) {
      return {
        status: "limited" as const,
        title: props.t("飞书页.文档.接入状态.目录浏览模式.标题"),
        message: props.t("飞书页.文档.接入状态.目录浏览模式.描述"),
      }
    }
    if (!capabilities.canWriteDocs) {
      return {
        status: "limited" as const,
        title: props.t("飞书页.文档.接入状态.只读模式.标题"),
        message: props.t("飞书页.文档.接入状态.只读模式.描述"),
      }
    }
    return {
      status: "ready" as const,
      title: props.t("飞书页.文档.接入状态.已接通.标题"),
      message: props.t("飞书页.文档.接入状态.已接通.描述"),
    }
  }, [capabilities, capabilityError, capabilityLoading, props.state, props.t, remoteDocsBlockedMessage, statePending])

  const pushDisabledReason = useMemo(() => {
    if (!currentDoc?.docId) {
      return props.t("飞书页.文档.推送限制.未打开文档")
    }
    if (saveState === "pulling" || saveState === "pushing") {
      return props.t("飞书页.文档.推送限制.处理中")
    }
    if (!hasWorkspaceContext) {
      return props.t("飞书页.文档.接入状态.未绑定工作区.描述")
    }
    if (access.status === "probing") {
      return props.t("飞书页.文档.接入状态.探测中.描述")
    }
    if (access.status === "blocked") {
      return access.message
    }
    if (!capabilities?.canWriteDocs) {
      return props.t("飞书页.文档.接入状态.只读模式.描述")
    }
    return ""
  }, [
    access.message,
    access.status,
    capabilities?.canWriteDocs,
    currentDoc,
    hasWorkspaceContext,
    props.t,
    saveState,
  ])
  const pushDisabled = Boolean(pushDisabledReason)
  const sourceEditorPath = useMemo(
    () => currentDoc?.docId ? `feishu-doc://${currentDoc.docId}.md` : "feishu-doc://draft.md",
    [currentDoc?.docId],
  )
  const pushConfirmDescription = useMemo(() => {
    const details = [
      currentDoc?.cache?.hasRevisionConflict ? "远端基线已变化，本次推送会先阻止覆盖。" : "",
      currentDoc?.cache?.hasBlockedChanges ? "当前改动包含暂不支持的结构变更，推送会失败。" : "",
    ].filter(Boolean)

    if (!currentDoc?.analysis.riskyBlocks.length && details.length === 0) {
      return props.t("飞书页.文档.提示.推送说明.普通")
    }
    if (currentDoc?.analysis.riskyBlocks.length) {
      details.push(props.t("飞书页.文档.提示.推送说明.原生块", {
        原因: currentDoc.analysis.riskyBlocks.join("；"),
      }))
    }

    return details.join("；")
  }, [currentDoc?.analysis.riskyBlocks, currentDoc?.cache?.hasBlockedChanges, currentDoc?.cache?.hasRevisionConflict, props.t])
  const selectedTreeKey = useMemo(() => {
    const currentDocId = currentDoc?.docId ?? activeDoc?.docId
    if (currentDocId) {
      const matchedKey = findTreeNodeKeyByDocId(treeNodes, currentDocId)
      if (matchedKey) {
        return matchedKey
      }
    }
    return activeDoc?.id ?? activeDoc?.docId ?? currentDoc?.docId ?? ""
  }, [activeDoc?.docId, activeDoc?.id, currentDoc?.docId, treeNodes])

  const selectedKeys = selectedTreeKey ? [selectedTreeKey] : []
  const controlledCheckedKeys = useMemo<NonNullable<TreeProps["checkedKeys"]>>(() => ({
    checked: checkedTreeKeys,
    halfChecked: [],
  }), [checkedTreeKeys])
  const checkedConversationTargets = useMemo<CheckedConversationTarget[]>(() => {
    const targets: CheckedConversationTarget[] = []

    for (const key of checkedTreeKeys) {
      const node = findTreeNodeByKey(treeNodes, key)
      const docId = node?.doc?.docId ?? node?.doc?.id ?? ""
      if (!node || !docId) {
        continue
      }

      targets.push({
        key: String(node.key),
        title: node.doc?.title ?? node.title,
        docId,
        resolvedDocId: node.doc?.resolvedDocId,
        url: node.doc?.url,
        updateTime: node.doc?.updateTime,
      })
    }

    return targets
  }, [checkedTreeKeys, treeNodes])
  const treeStatusText = useMemo(() => {
    if (treeStatus === "loading" || treeStatus === "refreshing") {
      return props.t("飞书页.文档.状态.正在加载")
    }
    if (treeStatus === "cached") {
      return props.t("飞书页.文档.状态.已显示上次结果")
    }
    if (treeStatus === "error") {
      return props.t("飞书页.文档.状态.加载失败")
    }
    return ""
  }, [props.t, treeStatus])
  const handleTreeExpand = useCallback<NonNullable<TreeProps["onExpand"]>>((keys, info) => {
    const nextKeys = keys.map((item) => String(item))
    if (!info.expanded) {
      setExpandedKeys(nextKeys)
      return
    }

    const expandedNode = findTreeNodeByKey(treeNodes, String(info.node.key))
    if (!expandedNode?.children?.length) {
      setExpandedKeys(nextKeys)
      return
    }

    setExpandedKeys(mergeExpandedKeyLists(nextKeys, collectExpandableKeys([expandedNode])))
  }, [treeNodes])
  const handleSelectAllTreeDocs = useCallback(() => {
    if (treeNodesRef.current.length === 0) {
      return
    }

    void (async () => {
      setTreeSelectionBusy(true)
      try {
        const nextNodes = treeRootDocId.trim()
          ? await hydrateTreeBranches(treeRootDocId.trim(), treeNodesRef.current, { forceRefresh: false })
          : treeNodesRef.current
        setCheckedTreeKeys(collectTreeKeys(nextNodes))
      } catch (error) {
        void error
        setCheckedTreeKeys(collectTreeKeys(treeNodesRef.current))
        notifier.warning(props.t("飞书页.文档.反馈.部分子文档未加入"))
      } finally {
        setTreeSelectionBusy(false)
      }
    })()
  }, [hydrateTreeBranches, props.t, treeRootDocId])
  const handleFillCheckedTreeDescendants = useCallback(() => {
    if (checkedTreeKeys.length === 0) {
      return
    }

    void (async () => {
      setTreeSelectionBusy(true)
      try {
        let nextCheckedKeys = checkedTreeKeys

        for (const key of checkedTreeKeys) {
          const node = findTreeNodeByKey(treeNodesRef.current, key)
          if (!node) {
            continue
          }

          const subtreeNodes = !node.isLeaf && !node.loaded
            ? await hydrateTreeBranches(treeRootDocId.trim() || key, [node], { forceRefresh: false })
            : [node]

          nextCheckedKeys = mergeCheckedKeys(
            nextCheckedKeys,
            collectNodeAndDescendantKeys(subtreeNodes, key),
          )
        }

        setCheckedTreeKeys(nextCheckedKeys)
      } catch (error) {
        void error
        notifier.warning(props.t("飞书页.文档.反馈.部分子文档未加入"))
      } finally {
        setTreeSelectionBusy(false)
      }
    })()
  }, [checkedTreeKeys, hydrateTreeBranches, props.t, treeRootDocId])
  const handleClearCheckedTreeDescendants = useCallback(() => {
    const parentKeys = checkedTreeKeys.filter((key) => {
      const node = findTreeNodeByKey(treeNodesRef.current, key)
      return Boolean(node?.children?.length)
    })

    if (parentKeys.length === 0) {
      return
    }

    setCheckedTreeKeys((current) => removeDescendantKeys({
      tree: treeNodesRef.current,
      checkedKeys: current,
      parentKeys,
    }))
  }, [checkedTreeKeys])
  const handleTreeCheck = useCallback<NonNullable<TreeProps["onCheck"]>>((_keys, info) => {
    const key = String(info.node.key)
    const node = findTreeNodeByKey(treeNodesRef.current, key)

    if (!info.checked) {
      const removedKeys = treeSelectionMode === "include_subtree" && node
        ? collectNodeAndDescendantKeys(treeNodesRef.current, key)
        : [key]
      setCheckedTreeKeys((current) => current.filter((item) => !removedKeys.includes(item)))
      return
    }

    void (async () => {
      setTreeSelectionBusy(true)
      try {
        if (!node) {
          setCheckedTreeKeys((current) => mergeCheckedKeys(current, [key]))
          return
        }

        if (treeSelectionMode === "current_only") {
          setCheckedTreeKeys((current) => mergeCheckedKeys(current, [key]))
          return
        }

        const subtreeNodes = !node.isLeaf && !node.loaded
          ? await hydrateTreeBranches(treeRootDocId.trim() || key, [node], { forceRefresh: false })
          : [node]
        const subtreeKeys = collectNodeAndDescendantKeys(subtreeNodes, key)

        setCheckedTreeKeys((current) => mergeCheckedKeys(current, subtreeKeys.length > 0 ? subtreeKeys : [key]))
      } catch (error) {
        void error
        notifier.warning(props.t("飞书页.文档.反馈.部分子文档未加入"))
        setCheckedTreeKeys((current) => mergeCheckedKeys(current, [key]))
      } finally {
        setTreeSelectionBusy(false)
      }
    })()
  }, [hydrateTreeBranches, props.t, treeRootDocId, treeSelectionMode])
  const handleAddCheckedDocsToConversation = useCallback(() => {
    if (!hasWorkspaceContext || checkedConversationTargets.length === 0) {
      return
    }

    void (async () => {
      try {
        const preparedDocs = await Promise.all(checkedConversationTargets.map(async (target) => {
          const chatDoc = currentDoc?.docId === target.docId
            ? currentDoc
            : await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, target.docId)
          const chatPreviewPath = chatDoc.cache?.draftRelativePath ?? chatDoc.cache?.originalRelativePath
          const chatPreviewFallbackPath = chatDoc.cache?.draftRelativePath
            && chatDoc.cache?.originalRelativePath
            && chatDoc.cache.draftRelativePath !== chatDoc.cache.originalRelativePath
            ? chatDoc.cache.originalRelativePath
            : undefined

          return {
            title: target.title,
            docId: target.docId,
            resolvedDocId: chatDoc.resolvedDocId ?? target.resolvedDocId,
            rootDocId: treeRootDocId || undefined,
            url: target.url,
            relativeUpdate: formatRelativeDocUpdateTime(target.updateTime, props.t),
            originalRelativePath: chatDoc.cache?.originalRelativePath,
            draftRelativePath: chatDoc.cache?.draftRelativePath,
            attachedTab: chatPreviewPath
              ? {
                  kind: "preview" as const,
                  title: target.title,
                  workspaceId: props.workspaceId || undefined,
                  source: {
                    kind: "feishu-doc" as const,
                    docId: target.docId,
                    path: chatPreviewPath,
                    ...(chatPreviewFallbackPath ? { fallbackPath: chatPreviewFallbackPath } : {}),
                  },
                }
              : null,
          }
        }))

        await conversationLauncher.openConversation({
          workspaceId: props.workspaceId,
          createSession: true,
          selectedAgentId: FEISHU_DOC_WRITER_AGENT_ID,
          draftText: buildFeishuDocChatDraftBatchText(preparedDocs.map((item) => ({
            title: item.title,
            docId: item.docId,
            originalRelativePath: item.originalRelativePath,
            draftRelativePath: item.draftRelativePath,
          }))),
          attachedTabs: preparedDocs
            .map((item) => item.attachedTab)
            .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        })
      } catch (error) {
        notifier.error(props.t("飞书页.反馈.加载失败", { 错误: error instanceof Error ? error.message : String(error) }))
      }
    })()
  }, [
    checkedConversationTargets,
    conversationLauncher,
    currentDoc,
    hasWorkspaceContext,
    props.baseUrl,
    props.t,
    props.workspaceId,
    treeRootDocId,
  ])

  const saveTag = useMemo(() => {
    if (saveState === "pulling") return { color: "blue", text: props.t("飞书页.文档.保存状态.拉取中") }
    if (saveState === "pushing") return { color: "blue", text: props.t("飞书页.文档.保存状态.推送中") }
    if (saveState === "caching") return { color: "processing", text: props.t("飞书页.文档.保存状态.写入缓存") }
    if (saveState === "error") return { color: "red", text: props.t("飞书页.文档.保存状态.操作失败") }
    if (hasPendingEditChanges || draft !== lastSavedDraftRef.current) {
      return { color: "gold", text: props.t("飞书页.文档.保存状态.本地有改动") }
    }
    if (currentDoc?.cache?.hasLocalChanges) {
      return { color: "gold", text: props.t("飞书页.文档.保存状态.本地有改动") }
    }
    if (currentDoc?.cache?.hasBaseline) return { color: "green", text: props.t("飞书页.文档.保存状态.已同步本地") }
    if (currentDoc?.cache) return { color: "default", text: props.t("飞书页.文档.保存状态.仅本地缓存") }
    return { color: "default", text: props.t("飞书页.文档.保存状态.未缓存") }
  }, [currentDoc?.cache, draft, hasPendingEditChanges, props.t, saveState])

  const handleBackToSettings = useCallback(() => {
    void (async () => {
      const canLeaveWorkspace = await confirmSaveBeforeLeave()
      if (!canLeaveWorkspace) {
        return
      }
      props.onBackToSettings?.()
    })()
  }, [confirmSaveBeforeLeave, props])

  useEffect(() => {
    const loadError = props.loadError.trim()
    if (!loadError || props.loading) {
      if (!loadError) {
        lastLoadErrorNoticeRef.current = ""
      }
      return
    }

    if (lastLoadErrorNoticeRef.current === loadError) {
      return
    }

    lastLoadErrorNoticeRef.current = loadError
    notifier.error(props.t("飞书页.反馈.加载失败", { 错误: loadError }))
  }, [props.loadError, props.loading, props.t])

  useEffect(() => {
    if (props.loading || access.status === "ready" || access.status === "probing") {
      if (access.status === "ready" || access.status === "probing") {
        lastAccessNoticeRef.current = ""
      }
      return
    }

    const noticeKey = `${access.status}:${access.title}:${access.message}`
    if (lastAccessNoticeRef.current === noticeKey) {
      return
    }

    lastAccessNoticeRef.current = noticeKey
    const notice = {
      title: access.title,
      description: access.message,
      duration: access.status === "limited" ? 5.5 : 4.5,
    }

    if (access.status === "limited") {
      notificationCenter.warning(notice)
      return
    }

    notificationCenter.info(notice)
  }, [access.message, access.status, access.title, props.loading])

  return (
    <>
      {modalContextHolder}
      <div className="feishu-docs-shell">
      <div className="feishu-docs-page-layout">
        <aside className="feishu-docs-page-sidebar">
          <section className="feishu-docs-panel feishu-docs-page-sidebar-panel">
            <div className="feishu-docs-page-sidebar-header">
              {props.onBackToSettings ? (
                <button type="button" className="feishu-docs-back-link" onClick={handleBackToSettings}>
                  <ArrowLeftOutlined />
                  <span>{props.t("飞书页.文档.导航.返回设置页")}</span>
                </button>
              ) : null}

              <div className="feishu-docs-page-sidebar-controls">
                <Input
                  allowClear
                  value={treeQuery}
                  placeholder={props.t("飞书页.文档.导航.根文档占位")}
                  className="feishu-docs-page-root-input"
                  onChange={(event) => handleTreeQueryChange(event.target.value)}
                  onPressEnter={handleTreeSubmit}
                />
                <Button
                  icon={<ApartmentOutlined />}
                  className="feishu-docs-load-button"
                  loading={treeLoading}
                  onClick={handleTreeSubmit}
                >
                  {treeQuery.trim()
                    ? props.t("飞书页.文档.导航.加载节点")
                    : props.t("飞书页.文档.导航.我的文档库")}
                </Button>
              </div>
            </div>

            <div className="feishu-docs-panel-body is-tree-panel-body">
              <div className="feishu-docs-tree-shell">
                {treeStatusText && (treeNodes.length > 0 || treeStatus !== "loading") ? (
                  <Text type="secondary" className="feishu-docs-tree-status">
                    {treeStatusText}
                  </Text>
                ) : null}
                <div className="feishu-docs-tree-toolbar">
                  <Tooltip title={props.t("飞书页.文档.按钮.加入当前选择到对话")}>
                    <Button
                      type="text"
                      icon={<MessageOutlined />}
                      className="feishu-docs-tree-toolbar-button"
                      disabled={!hasWorkspaceContext || checkedConversationTargets.length === 0}
                      loading={treeSelectionBusy}
                      aria-label={props.t("飞书页.文档.按钮.加入当前选择到对话")}
                      onClick={handleAddCheckedDocsToConversation}
                    />
                  </Tooltip>
                  <Tooltip title={props.t("飞书页.文档.按钮.全选")}>
                    <Button
                      type="text"
                      icon={<CheckSquareOutlined />}
                      className="feishu-docs-tree-toolbar-button"
                      disabled={treeNodes.length === 0}
                      aria-label={props.t("飞书页.文档.按钮.全选")}
                      onClick={handleSelectAllTreeDocs}
                    />
                  </Tooltip>
                  <Tooltip title={props.t("飞书页.文档.按钮.全取消")}>
                    <Button
                      type="text"
                      icon={<BorderOutlined />}
                      className="feishu-docs-tree-toolbar-button"
                      disabled={checkedTreeKeys.length === 0}
                      aria-label={props.t("飞书页.文档.按钮.全取消")}
                      onClick={() => setCheckedTreeKeys([])}
                    />
                  </Tooltip>
                  <Tooltip title={props.t("飞书页.文档.按钮.仅当前")}>
                    <Button
                      type="text"
                      icon={<PartitionOutlined />}
                      className={`feishu-docs-tree-toolbar-button${treeSelectionMode === "current_only" ? " is-active" : ""}`}
                      aria-label={props.t("飞书页.文档.按钮.仅当前")}
                      onClick={() => setTreeSelectionMode("current_only")}
                    />
                  </Tooltip>
                  <Tooltip title={props.t("飞书页.文档.按钮.含子文档")}>
                    <Button
                      type="text"
                      icon={<NodeExpandOutlined />}
                      className={`feishu-docs-tree-toolbar-button${treeSelectionMode === "include_subtree" ? " is-active" : ""}`}
                      aria-label={props.t("飞书页.文档.按钮.含子文档")}
                      onClick={() => setTreeSelectionMode("include_subtree")}
                    />
                  </Tooltip>
                  <Tooltip title={props.t("飞书页.文档.按钮.补选子文档")}>
                    <Button
                      type="text"
                      icon={<PlusSquareOutlined />}
                      className="feishu-docs-tree-toolbar-button"
                      disabled={checkedTreeKeys.length === 0}
                      aria-label={props.t("飞书页.文档.按钮.补选子文档")}
                      onClick={handleFillCheckedTreeDescendants}
                    />
                  </Tooltip>
                  <Tooltip title={props.t("飞书页.文档.按钮.取消子文档")}>
                    <Button
                      type="text"
                      icon={<MinusSquareOutlined />}
                      className="feishu-docs-tree-toolbar-button"
                      disabled={checkedTreeKeys.length === 0}
                      aria-label={props.t("飞书页.文档.按钮.取消子文档")}
                      onClick={handleClearCheckedTreeDescendants}
                    />
                  </Tooltip>
                  <Text type="secondary" className="feishu-docs-tree-selection-count">
                    {props.t("飞书页.文档.状态.已选择文档数", { 数量: checkedConversationTargets.length })}
                  </Text>
                </div>
                {treeLoading && treeNodes.length === 0 ? (
                  <div className="feishu-docs-loading-shell">
                    <Spin size="small" />
                    <Text type="secondary">{props.t("飞书页.文档.状态.正在加载")}</Text>
                  </div>
                ) : treeNodes.length > 0 ? (
                  <>
                    {treeError ? <Alert showIcon type="error" message={treeError} /> : null}
                    <Tree
                      blockNode
                      checkable
                      checkStrictly
                      className="feishu-docs-tree"
                      treeData={treeNodes}
                      expandedKeys={expandedKeys}
                      checkedKeys={controlledCheckedKeys}
                      selectedKeys={selectedKeys}
                      loadData={handleLoadTreeData}
                      switcherIcon={(nodeProps) => nodeProps.isLeaf ? null : <CaretRightFilled className="feishu-docs-tree-switcher-icon" />}
                      titleRender={(node) => {
                        const target = node as DocsTreeNode
                        const docId = target.doc?.docId ?? target.doc?.id ?? ""

                        return (
                          <span className={`feishu-docs-tree-title${target.isLeaf ? " is-leaf" : ""}`} title={target.title}>
                            <span className="feishu-docs-tree-title-main">
                              <FileTextOutlined className="feishu-docs-tree-title-icon" />
                              <span className="feishu-docs-tree-title-text">{target.title}</span>
                            </span>
                            {docId ? (
                              <Button
                                type="text"
                                size="small"
                                icon={<MessageOutlined />}
                                className="feishu-docs-tree-action"
                                disabled={!hasWorkspaceContext}
                                aria-label={props.t("飞书页.文档.按钮.加入当前对话")}
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                }}
                                onClick={(event) => {
                                  if (!hasWorkspaceContext) {
                                    return
                                  }
                                  event.preventDefault()
                                  event.stopPropagation()
                                  void (async () => {
                                    try {
                                      const chatDoc = currentDoc?.docId === docId
                                        ? currentDoc
                                        : await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)
                                      const chatPreviewPath = chatDoc.cache?.draftRelativePath ?? chatDoc.cache?.originalRelativePath
                                      const chatPreviewFallbackPath = chatDoc.cache?.draftRelativePath
                                        && chatDoc.cache?.originalRelativePath
                                        && chatDoc.cache.draftRelativePath !== chatDoc.cache.originalRelativePath
                                        ? chatDoc.cache.originalRelativePath
                                        : undefined

                                      conversationLauncher.openConversation({
                                        workspaceId: props.workspaceId,
                                        createSession: true,
                                        selectedAgentId: FEISHU_DOC_WRITER_AGENT_ID,
                                        draftText: buildFeishuDocChatDraftText({
                                          title: target.doc?.title ?? target.title,
                                          docId,
                                          originalRelativePath: chatDoc.cache?.originalRelativePath,
                                          draftRelativePath: chatDoc.cache?.draftRelativePath,
                                        }),
                                        attachedTabs: chatPreviewPath
                                          ? [{
                                              kind: "preview",
                                              title: target.doc?.title ?? target.title,
                                              workspaceId: props.workspaceId || undefined,
                                              source: {
                                                kind: "feishu-doc",
                                                docId,
                                                path: chatPreviewPath,
                                                ...(chatPreviewFallbackPath ? { fallbackPath: chatPreviewFallbackPath } : {}),
                                              },
                                            }]
                                          : undefined,
                                      })
                                    } catch (error) {
                                      notifier.error(props.t("飞书页.反馈.加载失败", { 错误: error instanceof Error ? error.message : String(error) }))
                                    }
                                  })()
                                }}
                              />
                            ) : null}
                          </span>
                        )
                      }}
                      onCheck={handleTreeCheck}
                      onExpand={handleTreeExpand}
                      onSelect={(_keys, info) => {
                        const target = info.node as DocsTreeNode
                        if (target.doc) {
                          void handleOpenDoc(target.doc)
                        }
                      }}
                    />
                  </>
                ) : treeError ? (
                  <Alert showIcon type="error" message={treeError} />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={treeRootDocId
                      ? props.t("飞书页.文档.空状态.当前节点无子节点")
                      : props.t("飞书页.文档.空状态.文档库无子节点")}
                  />
                )}
              </div>
            </div>
          </section>
        </aside>

        <main className="feishu-docs-page-content">
          <div className="feishu-docs-page-main-stack">
            <div className="feishu-docs-page-content-layout">
              <section className="feishu-docs-panel feishu-docs-page-workspace-panel">
                <div className="feishu-docs-workspace-head">
                  <div className="feishu-docs-workspace-head-main">
                    <div className="feishu-docs-workspace-title-block">
                      <div className="feishu-docs-workspace-title-row">
                        <Title level={2} className="feishu-docs-workspace-title">
                          {currentDoc?.title || activeDoc?.title || props.t("飞书页.文档.标题.未打开文档")}
                        </Title>
                      </div>
                      {activeDoc?.updateTime ? (
                        <div className="feishu-docs-workspace-meta">
                          <Text type="secondary">
                            {props.t("飞书页.文档.时间.更新于", {
                              时间: formatRelativeDocUpdateTime(activeDoc.updateTime, props.t),
                            })}
                          </Text>
                        </div>
                      ) : null}
                      <div className="feishu-docs-workspace-statuses">
                        <Tag bordered={false} color={resolveStatusTagColor(access.status)}>
                          {resolveStatusTagText(access.status, props.t)}
                        </Tag>
                        {currentDoc ? (
                          <Tag bordered={false} color={saveTag.color}>
                            {saveTag.text}
                          </Tag>
                        ) : null}
                        {!hasWorkspaceContext ? (
                          <Tag bordered={false}>浏览模式</Tag>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="feishu-docs-workspace-toolbar">
                    <div className="feishu-docs-workspace-mode-stack">
                      <Radio.Group
                        optionType="button"
                        buttonStyle="solid"
                        className="feishu-docs-workspace-view-switch"
                        value={workspaceViewMode}
                        onChange={(event) => setWorkspaceViewMode(event.target.value as FeishuDocWorkspaceViewMode)}
                      >
                        <Radio.Button value="preview">
                          {props.t("飞书页.文档.模式.预览")}
                        </Radio.Button>
                        <Radio.Button value="edit">
                          {props.t("飞书页.文档.模式.编辑")}
                        </Radio.Button>
                      </Radio.Group>
                    </div>
                    <div className="feishu-docs-workspace-actions">
                      {hasWorkspaceContext && currentDoc?.docId && (workspaceViewMode === "edit" || hasPendingEditChanges) ? (
                        <>
                          <Button
                            type="primary"
                            className="feishu-docs-toolbar-action"
                            icon={<SaveOutlined />}
                            disabled={!hasPendingEditChanges || saveState === "pulling" || saveState === "pushing"}
                            onClick={() => {
                              void handleSaveEditSession()
                            }}
                          >
                            {props.t("飞书页.文档.按钮.保存草稿")}
                          </Button>
                          <Button
                            className="feishu-docs-toolbar-action"
                            icon={<CloseOutlined />}
                            disabled={!hasPendingEditChanges || saveState === "pulling" || saveState === "pushing"}
                            onClick={() => {
                              void handleCancelEditSession()
                            }}
                          >
                            {props.t("飞书页.文档.按钮.取消编辑")}
                          </Button>
                        </>
                      ) : null}
                      <Button type="primary" className="feishu-docs-toolbar-action" icon={<ReloadOutlined />} onClick={handleReloadAll}>
                        {props.t("飞书页.文档.按钮.刷新")}
                      </Button>
                      <Button
                        className="feishu-docs-toolbar-action"
                        icon={<ApartmentOutlined />}
                        disabled={!hasWorkspaceContext || !currentDoc?.docId || saveState === "pulling" || saveState === "pushing"}
                        onClick={() => {
                          setPermissionInspectOpen(true)
                          void loadPermissionInspect()
                        }}
                      >
                        {props.t("飞书页.文档.按钮.权限自检")}
                      </Button>
                      <Popconfirm
                        title={props.t("飞书页.文档.提示.覆盖本地草稿")}
                        description={props.t("飞书页.文档.提示.拉取覆盖说明")}
                        okText={props.t("飞书页.文档.按钮.确认覆盖")}
                        cancelText={props.t("危险操作.弹窗.取消")}
                        disabled={!hasPendingEditChanges}
                        onConfirm={() => {
                          void handlePullDoc()
                        }}
                      >
                        <Button
                          type="primary"
                          className="feishu-docs-toolbar-action"
                          icon={<DownloadOutlined />}
                          disabled={!currentDoc?.docId || saveState === "pulling" || saveState === "pushing"}
                          onClick={() => {
                            if (draft === lastSavedDraftRef.current) {
                              void handlePullDoc()
                            }
                          }}
                      >
                        {props.t("飞书页.文档.按钮.拉取最新")}
                      </Button>
                      </Popconfirm>
                      <Tooltip title={pushDisabledReason || undefined}>
                        <span>
                          <Popconfirm
                            title={props.t("飞书页.文档.提示.推送确认")}
                            description={pushConfirmDescription}
                            okText={props.t("飞书页.文档.按钮.确认推送")}
                            cancelText={props.t("危险操作.弹窗.取消")}
                            disabled={pushDisabled}
                            onConfirm={() => {
                              void handlePushDoc()
                            }}
                          >
                            <Button
                              type="primary"
                              className="feishu-docs-toolbar-action"
                              icon={<UploadOutlined />}
                              disabled={pushDisabled}
                            >
                              {props.t("飞书页.文档.按钮.推送文档")}
                            </Button>
                          </Popconfirm>
                        </span>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                <div className="feishu-docs-workspace-body">
                  {docLoading ? (
                    <div className="feishu-docs-loading-shell">
                      <Spin />
                      <Text type="secondary">{props.t("飞书页.文档.加载中.正文")}</Text>
                    </div>
                  ) : docError ? (
                    <Alert showIcon type="error" message={docError} className="feishu-docs-workspace-alert" />
                  ) : !currentDoc ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.t("飞书页.文档.空状态.从目录树打开文档")} />
                  ) : (
                    <div className="feishu-docs-workspace-stack">
                      {!hasWorkspaceContext ? (
                        <Alert
                          showIcon
                          type="info"
                          message="当前没有活动工作区，文档工作区先以浏览模式打开。要使用加入对话、本地草稿和推送回写，请先激活一个工作区。"
                          className="feishu-docs-workspace-alert"
                        />
                      ) : null}
                      {saveError ? (
                        <Alert showIcon type="error" message={saveError} className="feishu-docs-workspace-alert" />
                      ) : null}

                      <div className="feishu-docs-editor-shell">
                        {workspaceViewMode === "preview" && draftDocIR ? (
                          <div className="feishu-docs-preview-shell">
                            <FeishuDocVisualEditor
                              ir={draftDocIR}
                              mdx={draft}
                              t={props.t}
                              mediaPreviewUrls={mediaPreviewUrls}
                              mediaPreviewErrors={mediaPreviewErrorMap}
                              boardSnapshots={currentDoc.boardSnapshots}
                              onChange={setDraft}
                            />
                          </div>
                        ) : (
                          <div className="feishu-docs-source-edit-shell">
                            <div className="feishu-docs-editor-shell-inner">
                              <FeishuDocSourceEditor
                                path={sourceEditorPath}
                                language="markdown"
                                value={draft}
                                error=""
                                readOnly={!hasWorkspaceContext}
                                onChange={setDraft}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
      </div>
      <FeishuDocPermissionInspectModal
        open={permissionInspectOpen}
        loading={permissionInspectLoading}
        error={permissionInspectError}
        result={permissionInspectResult}
        t={props.t}
        onClose={() => setPermissionInspectOpen(false)}
        onRetry={() => {
          void loadPermissionInspect()
        }}
      />
    </>
  )
}
