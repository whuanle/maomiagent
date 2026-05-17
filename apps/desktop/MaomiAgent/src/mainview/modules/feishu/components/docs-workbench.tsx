import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  CaretRightFilled,
  DownloadOutlined,
  FileTextOutlined,
  MessageOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons"
import {
  Alert,
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
  FeishuDocWhiteboardPreviewErrorItem,
  FeishuDocSummary,
  FeishuDocTreeQuery,
  FeishuStateView,
} from "../../../../shared/desktop-feishu"
import type { FeishuTranslate as Translate } from "../types"
import {
  fetchFeishuDocContent,
  fetchFeishuDocMediaPreviewUrls,
  fetchFeishuDocWhiteboardPreviewUrls,
  fetchFeishuDocTree,
  fetchFeishuDocsCapabilities,
  fetchFeishuWorkspaceDocLocalDraft,
  openFeishuWorkspaceDoc,
  pullFeishuWorkspaceDoc,
  pushFeishuWorkspaceDoc,
  saveFeishuWorkspaceDocLocalDraft,
  subscribeFeishuDocMutations,
} from "../../../lib/feishu"
import { notificationCenter, notifier } from "../../../lib/notifications"
import { useAppService } from "../../../services/app-service-container"
import { FRONTEND_CONVERSATION_LAUNCHER_PORT } from "../../../services/conversation/feature-contracts"
import { FeishuDocsLocalPreview } from "./feishu-docs-local-preview"

const { Text, Title } = Typography
const { TextArea } = Input
const FEISHU_TREE_PAGE_SIZE = 50

export type FeishuDocWorkspaceMode = "workspace"

export type FeishuDocsWorkbenchUiState = {
  activeDocId?: string
  treeRootDocId: string
  workspaceMode: FeishuDocWorkspaceMode
}

type DocsTreeNode = TreeDataNode & {
  key: string
  title: string
  isLeaf?: boolean
  loaded?: boolean
  doc?: FeishuDocSummary
  children?: DocsTreeNode[]
}

type Props = {
  baseUrl: string
  workspaceId: string
  state: FeishuStateView | null
  loading: boolean
  loadError: string
  t: Translate
  initialDocId?: string
  initialTreeRootDocId?: string
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

function mapTreeNodes(items: FeishuDocSummary[]): DocsTreeNode[] {
  return items.map(mapTreeNode)
}

function mapTreeNode(item: FeishuDocSummary): DocsTreeNode {
  return {
    key: item.id,
    title: item.title,
    isLeaf: item.hasChild !== true,
    loaded: item.hasChild !== true,
    doc: item,
  }
}

function buildLoadedTreeNode(doc: FeishuDocSummary, children: DocsTreeNode[] = []): DocsTreeNode {
  return {
    key: doc.id,
    title: doc.title,
    isLeaf: children.length === 0,
    loaded: true,
    doc,
    ...(children.length > 0 ? { children } : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function buildDocChatDraftText(input: {
  title: string
  docId: string
  rootDocId?: string
  url?: string
  updateTime?: string
  cacheRelativePath?: string
  t: Translate
}): string {
  const relativeUpdate = formatRelativeDocUpdateTime(input.updateTime, input.t)

  return [
    "请直接使用这篇飞书文档对应的本地 Markdown 草稿，不可以直接改动飞书远端。",
    "如果要修改内容，只能修改本地 Markdown 草稿，只能由用户操作推送，不能由任何自动化流程改动飞书远端文档内容。",
    "",
    "<feishu_doc_context>",
    `doc_token: ${input.docId}`,
    `title: ${input.title}`,
    input.rootDocId ? `root_doc_token: ${input.rootDocId}` : undefined,
    input.url ? `url: ${input.url}` : undefined,
    relativeUpdate ? `updated_at: ${relativeUpdate}` : undefined,
    input.cacheRelativePath ? `local_draft_path: ${input.cacheRelativePath}` : undefined,
    input.rootDocId ? "create_target: root_doc_token" : "create_target: query_workspace_root_doc_first",
    "workflow: edit_local_markdown",
    "</feishu_doc_context>",
  ].filter((item): item is string => Boolean(item)).join("\n")
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

function stripMarkdownFencedCode(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const output: string[] = []
  let activeFence: string | null = null

  for (const line of lines) {
    const fenceMatch = /^(```+|~~~+)/.exec(line.trim())
    if (fenceMatch) {
      const fence = fenceMatch[1]
      if (activeFence === fence) {
        activeFence = null
      } else if (activeFence === null) {
        activeFence = fence
      }
      continue
    }

    if (!activeFence) {
      output.push(line)
    }
  }

  return output.join("\n")
}

function extractFeishuMediaTokens(markdown: string): string[] {
  const source = stripMarkdownFencedCode(markdown)
  const tokens = new Set<string>()
  const pattern = /<(?:image|file)\b[^>]*\b(?:token|file-token|file_token)=(?:"([^"]+)"|'([^']+)'|{([^}]+)}|([^\s"'=<>`]+))/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ""
    const normalized = token.trim()
    if (normalized) {
      tokens.add(normalized)
    }
  }

  return [...tokens]
}

function extractFeishuWhiteboardTokens(markdown: string): string[] {
  const source = stripMarkdownFencedCode(markdown)
  const tokens = new Set<string>()
  const pattern = /<(?:board|whiteboard)\b[^>]*\btoken=(?:"([^"]+)"|'([^']+)'|{([^}]+)}|([^\s"'=<>`]+))/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(source)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ""
    const normalized = token.trim()
    if (normalized) {
      tokens.add(normalized)
    }
  }

  return [...tokens]
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
  const [treeQuery, setTreeQuery] = useState(props.initialTreeRootDocId ?? "")
  const [treeRootDocId, setTreeRootDocId] = useState(props.initialTreeRootDocId ?? "")
  const [capabilityLoading, setCapabilityLoading] = useState(false)
  const [capabilityError, setCapabilityError] = useState("")
  const [capabilities, setCapabilities] = useState<Awaited<ReturnType<typeof fetchFeishuDocsCapabilities>> | null>(null)
  const [treeNodes, setTreeNodes] = useState<DocsTreeNode[]>([])
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState("")
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [activeDoc, setActiveDoc] = useState<FeishuDocSummary | null>(null)
  const [currentDoc, setCurrentDoc] = useState<FeishuDocContentView | null>(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState("")
  const [draft, setDraft] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "caching" | "pulling" | "pushing" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState("")
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview")
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState<Record<string, string>>({})
  const [mediaPreviewErrors, setMediaPreviewErrors] = useState<FeishuDocMediaPreviewErrorItem[]>([])
  const [whiteboardPreviewUrls, setWhiteboardPreviewUrls] = useState<Record<string, string>>({})
  const [whiteboardPreviewFocusRects, setWhiteboardPreviewFocusRects] = useState<
    Record<string, { left: number; top: number; width: number; height: number }>
  >({})
  const [whiteboardPreviewErrors, setWhiteboardPreviewErrors] = useState<FeishuDocWhiteboardPreviewErrorItem[]>([])
  const lastSavedDraftRef = useRef("")
  const initialDocLoadedRef = useRef(false)
  const draftRef = useRef("")
  const saveStateRef = useRef(saveState)
  const activeDocIdRef = useRef("")
  const mediaPreviewRequestIdRef = useRef(0)
  const whiteboardPreviewRequestIdRef = useRef(0)
  const lastLoadErrorNoticeRef = useRef("")
  const lastAccessNoticeRef = useRef("")

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

  const fetchAllTreeNodes = useCallback(async (input: FeishuDocTreeQuery): Promise<FeishuDocSummary[]> => {
    const nodes: FeishuDocSummary[] = []
    let pageToken = input.pageToken

    for (;;) {
      const item = await fetchFeishuDocTree(props.baseUrl, {
        ...input,
        ...(pageToken ? { pageToken } : {}),
        pageSize: FEISHU_TREE_PAGE_SIZE,
      })
      nodes.push(...item.nodes)

      if (!item.hasMore || !item.pageToken || item.pageToken === pageToken) {
        break
      }

      pageToken = item.pageToken
    }

    return nodes
  }, [props.baseUrl])

  const hydrateTreeBranch = useCallback(async (
    items: FeishuDocSummary[],
    lineage: ReadonlySet<string> = new Set(),
  ): Promise<DocsTreeNode[]> => {
    const nodes: DocsTreeNode[] = []

    for (const item of items) {
      const nodeId = (item.id || item.docId || "").trim()
      if (item.hasChild !== true || !nodeId || lineage.has(nodeId)) {
        nodes.push(mapTreeNode(item))
        continue
      }

      const nextLineage = new Set(lineage)
      nextLineage.add(nodeId)
      const children = await fetchAllTreeNodes({
        root: "document",
        docId: nodeId,
      })

      nodes.push(buildLoadedTreeNode(item, await hydrateTreeBranch(children, nextLineage)))
    }

    return nodes
  }, [fetchAllTreeNodes])

  const resolveRootDocSummary = useCallback(async (rootDocId: string): Promise<FeishuDocSummary> => {
    // Keep tree loading independent from the currently selected doc.
    // Otherwise selecting a node changes callback dependencies and re-triggers a full tree reload.
    try {
      const rootDoc = await fetchFeishuDocContent(props.baseUrl, rootDocId)
      return {
        id: rootDocId,
        docId: rootDoc.docId,
        title: rootDoc.title,
      }
    } catch {
      return {
        id: rootDocId,
        docId: rootDocId,
        title: rootDocId,
      }
    }
  }, [props.baseUrl])

  const loadTree = useCallback(async (rootDocId: string) => {
    if (!props.baseUrl || !remoteDocsReady) {
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError(remoteDocsBlockedMessage)
      setTreeLoading(false)
      return
    }
    if (capabilities && !capabilities.canBrowseTree) {
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError(props.t("飞书页.文档.接入状态.未暴露工具.描述"))
      setTreeLoading(false)
      return
    }

    try {
      setTreeLoading(true)
      if (rootDocId) {
        const [childItems, rootDoc] = await Promise.all([
          fetchAllTreeNodes({
            root: "document",
            docId: rootDocId,
          }),
          resolveRootDocSummary(rootDocId),
        ])
        const loadedRoot = buildLoadedTreeNode(
          rootDoc,
          await hydrateTreeBranch(childItems, new Set([rootDoc.id])),
        )
        setTreeNodes([loadedRoot])
        setExpandedKeys(collectExpandableKeys([loadedRoot]))
      } else {
        const items = await fetchAllTreeNodes({
          root: "my_library",
        })
        setTreeNodes(mapTreeNodes(items))
        setExpandedKeys([])
      }
      setTreeError("")
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error))
    } finally {
      setTreeLoading(false)
    }
  }, [
    capabilities,
    fetchAllTreeNodes,
    hydrateTreeBranch,
    props.t,
    remoteDocsBlockedMessage,
    remoteDocsReady,
    resolveRootDocSummary,
  ])

  const handleOpenDoc = useCallback(async (doc: FeishuDocSummary) => {
    const docId = doc.docId ?? doc.id
    if (!docId) {
      return
    }
    if (capabilities && !capabilities.canReadDocs) {
      setDocError(props.t("飞书页.文档.接入状态.目录浏览模式.描述"))
      return
    }

    try {
      if (currentDoc?.docId && currentDoc.docId !== docId && draft !== lastSavedDraftRef.current) {
        await persistDraftIfDirty()
      }

      setDocLoading(true)
      const item = props.workspaceId
        ? await openFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, docId)
        : await fetchFeishuDocContent(props.baseUrl, docId)
      setActiveDoc({
        ...doc,
        docId,
      })
      setCurrentDoc(item)
      setDraft(item.markdown)
      lastSavedDraftRef.current = item.markdown
      setDocError("")
      setSaveError("")
      setSaveState("saved")
      setViewMode("preview")
    } catch (error) {
      setDocError(error instanceof Error ? error.message : String(error))
    } finally {
      setDocLoading(false)
    }
  }, [capabilities, currentDoc?.docId, draft, persistDraftIfDirty, props.baseUrl, props.t, props.workspaceId])

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
      void loadTree(treeRootDocId)
      if (currentDoc?.docId) {
        void handleOpenDoc({
          id: currentDoc.docId,
          docId: currentDoc.docId,
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

  const handlePullDoc = useCallback(async () => {
    if (!currentDoc?.docId) {
      return
    }

    try {
      setSaveError("")
      setSaveState("pulling")
      if (hasWorkspaceContext) {
        const result = await pullFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId)
        setCurrentDoc(result.item)
        setDraft(result.item.markdown)
        lastSavedDraftRef.current = result.item.markdown
      } else {
        const item = await fetchFeishuDocContent(props.baseUrl, currentDoc.docId)
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
  }, [currentDoc?.docId, hasWorkspaceContext, props.baseUrl, props.workspaceId])

  const handlePushDoc = useCallback(async () => {
    if (!currentDoc?.docId || !hasWorkspaceContext) {
      return
    }

    try {
      await persistDraftIfDirty()
      setSaveError("")
      setSaveState("pushing")
      const result = await pushFeishuWorkspaceDoc(props.baseUrl, props.workspaceId, currentDoc.docId, {
        title: currentDoc.title,
        force: true,
      })
      setCurrentDoc(result.item)
      setDraft(result.item.markdown)
      lastSavedDraftRef.current = result.item.markdown
      setSaveError("")
      setSaveState("saved")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      setSaveState("error")
    }
  }, [currentDoc?.docId, currentDoc?.title, hasWorkspaceContext, persistDraftIfDirty, props.baseUrl, props.workspaceId])

  const handleTreeSubmit = useCallback(() => {
    const nextRoot = treeQuery.trim()
    setTreeRootDocId(nextRoot)
    void loadTree(nextRoot)
  }, [loadTree, treeQuery])

  const handleLoadTreeData = useCallback<NonNullable<TreeProps["loadData"]>>(async (node) => {
    if (!remoteDocsReady || (capabilities && !capabilities.canBrowseTree)) {
      return
    }

    const current = node as DocsTreeNode
    const doc = current.doc
    const nodeId = doc?.id
    if (!doc || !nodeId || current.loaded || current.isLeaf) {
      return
    }

    const children = await fetchAllTreeNodes({
      root: "document",
      docId: nodeId,
    })
    const loadedNode = buildLoadedTreeNode(
      doc,
      await hydrateTreeBranch(children, new Set([nodeId])),
    )
    setTreeNodes((previous) => replaceChildren(previous, current.key, loadedNode.children ?? []))
    setExpandedKeys((previous) => mergeExpandedKeyLists(previous, collectExpandableKeys([loadedNode])))
  }, [capabilities, fetchAllTreeNodes, hydrateTreeBranch, remoteDocsReady])

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
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError("")
      setTreeLoading(true)
      return
    }

    if (!remoteDocsReady) {
      setTreeNodes([])
      setExpandedKeys([])
      setTreeError(remoteDocsBlockedMessage)
      setTreeLoading(false)
      return
    }

    void loadTree(props.initialTreeRootDocId ?? "")
  }, [loadTree, props.initialTreeRootDocId, remoteDocsBlockedMessage, remoteDocsReady, statePending])

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
      treeRootDocId,
      workspaceMode: "workspace",
    })
  }, [activeDoc?.docId, activeDoc?.id, currentDoc?.docId, props, treeRootDocId])

  useEffect(() => {
    if (!currentDoc) {
      return
    }

    if (draft !== lastSavedDraftRef.current) {
      setSaveState((previous) => previous === "pushing" || previous === "pulling" ? previous : "dirty")
    }
  }, [currentDoc, draft])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

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
  const whiteboardTokens = useMemo(() => extractFeishuWhiteboardTokens(draft), [draft])
  const whiteboardTokenKey = useMemo(() => whiteboardTokens.join("|"), [whiteboardTokens])
  const hasPreviewAuth = props.state?.smartAssistant.authStatus === "authorized"
    || props.state?.developer?.authStatus === "authorized"
  const mediaPreviewErrorMap = useMemo(
    () => Object.fromEntries(mediaPreviewErrors.map((item) => [item.fileToken, item.message])),
    [mediaPreviewErrors],
  )
  const whiteboardPreviewErrorMap = useMemo(
    () => Object.fromEntries(whiteboardPreviewErrors.map((item) => [item.whiteboardToken, item.message])),
    [whiteboardPreviewErrors],
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

    if (!props.baseUrl || mediaTokens.length === 0 || !hasPreviewAuth) {
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
  }, [hasPreviewAuth, mediaTokenKey, mediaTokens, props.baseUrl])

  useEffect(() => {
    const activeTokens = new Set(whiteboardTokens)
    setWhiteboardPreviewUrls((previous) => {
      const nextEntries = Object.entries(previous).filter(([token]) => activeTokens.has(token))
      if (nextEntries.length === Object.keys(previous).length) {
        return previous
      }
      return Object.fromEntries(nextEntries)
    })
    setWhiteboardPreviewFocusRects((previous) => {
      const nextEntries = Object.entries(previous).filter(([token]) => activeTokens.has(token))
      if (nextEntries.length === Object.keys(previous).length) {
        return previous
      }
      return Object.fromEntries(nextEntries)
    })
    setWhiteboardPreviewErrors((previous) => previous.filter((item) => activeTokens.has(item.whiteboardToken)))

    if (!props.baseUrl || whiteboardTokens.length === 0 || !hasPreviewAuth) {
      whiteboardPreviewRequestIdRef.current += 1
      setWhiteboardPreviewUrls((previous) => (Object.keys(previous).length === 0 ? previous : {}))
      setWhiteboardPreviewFocusRects((previous) => (Object.keys(previous).length === 0 ? previous : {}))
      setWhiteboardPreviewErrors([])
      return
    }

    const requestId = whiteboardPreviewRequestIdRef.current + 1
    whiteboardPreviewRequestIdRef.current = requestId

    void fetchFeishuDocWhiteboardPreviewUrls(props.baseUrl, {
      whiteboardTokens,
    }).then((result) => {
      if (whiteboardPreviewRequestIdRef.current !== requestId) {
        return
      }
      setWhiteboardPreviewUrls((previous) => ({
        ...previous,
        ...Object.fromEntries(result.items.map((item) => [item.whiteboardToken, item.tmpDownloadUrl])),
      }))
      setWhiteboardPreviewFocusRects((previous) => ({
        ...previous,
        ...Object.fromEntries(
          result.items
            .filter((item): item is typeof item & {
              focusRect: { left: number; top: number; width: number; height: number }
            } => Boolean(item.focusRect))
            .map((item) => [item.whiteboardToken, item.focusRect]),
        ),
      }))
      setWhiteboardPreviewErrors(result.errors)
    }).catch(() => {
      if (whiteboardPreviewRequestIdRef.current !== requestId) {
        return
      }
      setWhiteboardPreviewErrors([])
    })
  }, [hasPreviewAuth, props.baseUrl, whiteboardTokenKey, whiteboardTokens])

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
  }, [props.baseUrl, props.workspaceId])

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
  const pushConfirmDescription = useMemo(() => {
    if (!currentDoc?.analysis.riskyBlocks.length) {
      return props.t("飞书页.文档.提示.推送说明.普通")
    }
    return props.t("飞书页.文档.提示.推送说明.原生块", {
      原因: currentDoc.analysis.riskyBlocks.join("；"),
    })
  }, [currentDoc?.analysis.riskyBlocks, props.t])
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

  const saveTag = useMemo(() => {
    if (saveState === "pulling") return { color: "blue", text: props.t("飞书页.文档.保存状态.拉取中") }
    if (saveState === "pushing") return { color: "blue", text: props.t("飞书页.文档.保存状态.推送中") }
    if (saveState === "caching") return { color: "processing", text: props.t("飞书页.文档.保存状态.写入缓存") }
    if (saveState === "error") return { color: "red", text: props.t("飞书页.文档.保存状态.操作失败") }
    if (draft !== lastSavedDraftRef.current) return { color: "gold", text: props.t("飞书页.文档.保存状态.本地有改动") }
    if (currentDoc?.cache?.hasBaseline) return { color: "green", text: props.t("飞书页.文档.保存状态.已同步本地") }
    if (currentDoc?.cache) return { color: "default", text: props.t("飞书页.文档.保存状态.仅本地缓存") }
    return { color: "default", text: props.t("飞书页.文档.保存状态.未缓存") }
  }, [currentDoc?.cache, draft, props.t, saveState])

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
    <div className="feishu-docs-shell">
      <div className="feishu-docs-page-layout">
        <aside className="feishu-docs-page-sidebar">
          <section className="feishu-docs-panel feishu-docs-page-sidebar-panel">
            <div className="feishu-docs-page-sidebar-header">
              {props.onBackToSettings ? (
                <button type="button" className="feishu-docs-back-link" onClick={props.onBackToSettings}>
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
                  onChange={(event) => setTreeQuery(event.target.value)}
                  onPressEnter={handleTreeSubmit}
                />
                <Button icon={<ApartmentOutlined />} className="feishu-docs-load-button" onClick={handleTreeSubmit}>
                  {treeQuery.trim()
                    ? props.t("飞书页.文档.导航.加载节点")
                    : props.t("飞书页.文档.导航.我的文档库")}
                </Button>
              </div>
            </div>

            <div className="feishu-docs-panel-body is-tree-panel-body">
              <div className="feishu-docs-tree-shell">
                {treeLoading ? (
                  <div className="feishu-docs-loading-shell">
                    <Spin size="small" />
                    <Text type="secondary">{props.t("飞书页.文档.加载中.目录树")}</Text>
                  </div>
                ) : treeError ? (
                  <Alert showIcon type="error" message={treeError} />
                ) : treeNodes.length > 0 ? (
                  <Tree
                    blockNode
                    className="feishu-docs-tree"
                    treeData={treeNodes}
                    expandedKeys={expandedKeys}
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
                                conversationLauncher.openConversation({
                                  workspaceId: props.workspaceId,
                                  draftText: buildDocChatDraftText({
                                    title: target.doc?.title ?? target.title,
                                    docId,
                                    rootDocId: treeRootDocId || undefined,
                                    url: target.doc?.url,
                                    updateTime: target.doc?.updateTime,
                                    cacheRelativePath:
                                      currentDoc?.docId === docId
                                        ? currentDoc.cache?.cacheRelativePath
                                        : undefined,
                                    t: props.t,
                                  }),
                                  attachedTabs: [{
                                    kind: "feishu-docs-workspace",
                                    title: target.doc?.title ?? target.title,
                                    workspaceId: props.workspaceId || undefined,
                                    docId,
                                    rootDocId: treeRootDocId || undefined,
                                  }],
                                })
                              }}
                            />
                          ) : null}
                        </span>
                      )
                    }}
                    onExpand={handleTreeExpand}
                    onSelect={(_keys, info) => {
                      const target = info.node as DocsTreeNode
                      if (target.doc) {
                        void handleOpenDoc(target.doc)
                      }
                    }}
                  />
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
                    <Radio.Group
                      optionType="button"
                      buttonStyle="solid"
                      className="feishu-docs-workspace-view-switch"
                      value={viewMode}
                      onChange={(event) => setViewMode(event.target.value as "preview" | "edit")}
                    >
                      <Radio.Button value="preview">
                        {props.t("飞书页.文档.视图.本地预览")}
                      </Radio.Button>
                      <Radio.Button value="edit">
                        {props.t("飞书页.文档.视图.原生标签")}
                      </Radio.Button>
                    </Radio.Group>
                    <div className="feishu-docs-workspace-actions">
                      <Button type="primary" className="feishu-docs-toolbar-action" icon={<ReloadOutlined />} onClick={handleReloadAll}>
                        {props.t("飞书页.文档.按钮.刷新")}
                      </Button>
                      <Popconfirm
                        title={props.t("飞书页.文档.提示.覆盖本地草稿")}
                        description={props.t("飞书页.文档.提示.拉取覆盖说明")}
                        okText={props.t("飞书页.文档.按钮.确认覆盖")}
                        cancelText={props.t("危险操作.弹窗.取消")}
                        disabled={draft === lastSavedDraftRef.current}
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
                        {viewMode === "preview" ? (
                          <div className="feishu-docs-preview-shell">
                            <FeishuDocsLocalPreview
                              markdown={draft}
                              t={props.t}
                              mediaPreviewUrls={mediaPreviewUrls}
                              mediaPreviewErrors={mediaPreviewErrorMap}
                              whiteboardPreviewUrls={whiteboardPreviewUrls}
                              whiteboardPreviewFocusRects={whiteboardPreviewFocusRects}
                              whiteboardPreviewErrors={whiteboardPreviewErrorMap}
                            />
                          </div>
                        ) : (
                          <div className="feishu-docs-editor-shell-inner">
                            <TextArea
                              className="feishu-docs-editor-textarea"
                              value={draft}
                              readOnly={!hasWorkspaceContext}
                              spellCheck={false}
                              autoSize={false}
                              onChange={(event) => setDraft(event.target.value)}
                            />
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
  )
}
