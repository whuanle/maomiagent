import {
  DownOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  UpOutlined,
} from "@ant-design/icons"
import {
  App as AntdApp,
  Button,
  Empty,
  Form,
  type TableColumnsType,
} from "antd"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { LanguageCode } from "../../config/titlebar"
import type { Translate } from "../../i18n"
import { hasDesktopWindowBridge } from "../../lib/desktop-window"
import {
  DESKTOP_AGENTS_BRIDGE_READY_EVENT,
  getDesktopAgentBundle,
  hasDesktopAgentsBridge,
  listDesktopAgents,
  removeDesktopAgent,
  saveDesktopAgentBundle,
  setDesktopAgentEnabled,
} from "../../lib/desktop-agents"
import { AppTableCard } from "../../components/shared/AppTableCard"
import type { AgentItem } from "../../../shared/desktop-agents"
import { AgentDetailModal } from "./components/agent-detail-modal"
import {
  AgentEditorPage,
  type AgentEditorFormValues,
} from "./components/agent-editor-page"
import { OpencodeAgentImportModal } from "./components/opencode-agent-import-modal"
import { createAgentColumns } from "./components/table-columns"
import {
  deriveAgentListItems,
  type AgentListItem,
} from "./components/agent-relations"
import {
  compareAgentsByName,
  isReadonlyAgent,
  normalizeError,
} from "./helpers"
import { createAgentsTranslator } from "./agents-i18n"
import "./page.css"

type Props = {
  language: LanguageCode
  t: Translate
  active: boolean
}

const AGENT_ID_FORMAT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/

type AgentTableRow = AgentListItem & {
  rowId: string
  parentAgentId?: string
  nested?: boolean
  children?: AgentTableRow[]
}

function createInitialFormValues(): AgentEditorFormValues {
  return {
    agentId: "",
    name: "",
    mode: "primary",
    description: "",
    prompt: "",
    enabled: true,
    childAgents: [],
    linkedAgentIds: [],
  }
}

function upsertAgentItem(current: AgentItem[], next: AgentItem): AgentItem[] {
  return [...current.filter((item) => item.agentId !== next.agentId), next].sort(compareAgentsByName)
}

function flattenExpandableRowKeys(items: AgentTableRow[]): string[] {
  const keys: string[] = []

  const visit = (rows: AgentTableRow[]) => {
    for (const row of rows) {
      if (row.children && row.children.length > 0) {
        keys.push(row.rowId)
        visit(row.children)
      }
    }
  }

  visit(items)
  return keys
}

function applyBundleSaveResult(current: AgentItem[], result: {
  rootItem: AgentItem
  childItems: AgentItem[]
  removedAgentIds: string[]
}): AgentItem[] {
  let next = current.filter((item) => !result.removedAgentIds.includes(item.agentId))
  next = upsertAgentItem(next, result.rootItem)
  for (const childItem of result.childItems) {
    next = upsertAgentItem(next, childItem)
  }
  return next
}

export function AgentsPage(props: Props) {
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm<AgentEditorFormValues>()
  const [windowBridgeReady, setWindowBridgeReady] = useState(() => hasDesktopWindowBridge())
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopAgentsBridge())
  const [items, setItems] = useState<AgentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<AgentItem | null>(null)
  const [editingBundleChildIds, setEditingBundleChildIds] = useState<string[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const t = useMemo(() => createAgentsTranslator(props.language), [props.language])

  useEffect(() => {
    const syncBridgeState = () => {
      setWindowBridgeReady(hasDesktopWindowBridge())
      setBridgeReady(hasDesktopAgentsBridge())
    }

    syncBridgeState()
    window.addEventListener(DESKTOP_AGENTS_BRIDGE_READY_EVENT, syncBridgeState)
    return () => window.removeEventListener(DESKTOP_AGENTS_BRIDGE_READY_EVENT, syncBridgeState)
  }, [])

  const derivedItems = useMemo(() => deriveAgentListItems(items), [items])

  const selectedItem = useMemo(
    () => derivedItems.find((item) => item.agentId === selectedAgentId) ?? null,
    [derivedItems, selectedAgentId],
  )

  const tableRows = useMemo<AgentTableRow[]>(() => {
    const itemById = new Map(derivedItems.map((item) => [item.agentId, item]))

    const buildChildren = (
      parent: AgentListItem,
      parentRowId: string,
      visited: Set<string>,
    ): AgentTableRow[] => {
      const childItems = parent.relationInfo.childAgentIds
        .map((agentId) => itemById.get(agentId))
        .filter((item): item is AgentListItem => Boolean(item))
        .sort(compareAgentsByName)

      return childItems
        .filter((childItem) => !visited.has(childItem.agentId))
        .map((childItem) => {
          const rowId = `${parentRowId}::${childItem.agentId}`
          const nextVisited = new Set(visited)
          nextVisited.add(childItem.agentId)
          const children = buildChildren(childItem, rowId, nextVisited)

          return {
            ...childItem,
            rowId,
            parentAgentId: parent.agentId,
            nested: true,
            ...(children.length > 0 ? { children } : {}),
          }
        })
    }

    return derivedItems
      .filter((item) => {
        const parentIds = item.relationInfo.primaryAgentIds.filter((agentId) => itemById.has(agentId))
        return item.mode !== "subagent" || parentIds.length === 0
      })
      .map((item) => {
        const children = buildChildren(
          item,
          item.agentId,
          new Set([item.agentId]),
        )

        return {
          ...item,
          rowId: item.agentId,
          ...(children.length > 0 ? { children } : {}),
        }
      })
  }, [derivedItems])

  useEffect(() => {
    const validKeys = new Set(flattenExpandableRowKeys(tableRows))

    setExpandedRowKeys((current) => current.filter((key) => validKeys.has(key)))
  }, [tableRows])

  const tableLoading = loading || refreshing
  const loadingTip = t("智能体页.提示.加载中")

  const loadData = useCallback(async (silent = false) => {
    if (!props.active || !bridgeReady) {
      return
    }

    try {
      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const response = await listDesktopAgents({})
      setItems([...response.items].sort(compareAgentsByName))
    } catch (error) {
      message.error(`${t("智能体页.反馈.加载失败")}: ${normalizeError(error)}`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [bridgeReady, message, props.active, t])

  useEffect(() => {
    if (!props.active) {
      return
    }
    void loadData(false)
  }, [loadData, props.active])

  const closeEditor = useCallback(() => {
    setEditorOpen(false)
    setEditingItem(null)
    setEditingBundleChildIds([])
    form.resetFields()
    form.setFieldsValue(createInitialFormValues())
  }, [form])

  const openCreatePage = useCallback(() => {
    setEditingItem(null)
    setEditingBundleChildIds([])
    setDetailOpen(false)
    form.resetFields()
    form.setFieldsValue(createInitialFormValues())
    setEditorOpen(true)
  }, [form])

  const openEditPage = useCallback(async (item: AgentItem) => {
    if (isReadonlyAgent(item)) {
      message.warning(t("智能体页.反馈.内置只读"))
      return
    }

    const openWithBundle = (rootItem: AgentItem, childItems: AgentItem[]) => {
      const editableChildItems = childItems.filter((childItem) => !isReadonlyAgent(childItem))
      const editableChildIds = new Set(editableChildItems.map((childItem) => childItem.agentId))
      const linkedAgentIds = rootItem.subAgentPolicy?.mode === "allow_list"
        ? (rootItem.subAgentPolicy.allowedAgentIds ?? []).filter((agentId) => !editableChildIds.has(agentId))
        : []

      setEditingBundleChildIds(editableChildItems.map((childItem) => childItem.agentId))
      setEditingItem(rootItem)
      setDetailOpen(false)
      form.resetFields()
      form.setFieldsValue({
        agentId: rootItem.agentId,
        name: rootItem.name,
        mode: rootItem.mode,
        description: rootItem.description ?? "",
        prompt: rootItem.prompt ?? "",
        enabled: rootItem.enabled,
        childAgents: editableChildItems.map((childItem) => ({
          draftKey: childItem.agentId,
          agentId: childItem.agentId,
          name: childItem.name,
          mode: childItem.mode === "all" ? "all" : "subagent",
          description: childItem.description ?? "",
          prompt: childItem.prompt ?? "",
          enabled: true,
        })),
        linkedAgentIds,
      })
      setEditorOpen(true)
    }

    try {
      const bundle = await getDesktopAgentBundle(item.agentId)
      openWithBundle(bundle.rootItem ?? item, bundle.childItems)
    } catch {
      openWithBundle(item, [])
    }
  }, [form, message, t])

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields()
      const linkedAgentIds = (form.getFieldValue("linkedAgentIds") ?? []) as string[]
      const childAgents = values.mode === "subagent" ? [] : values.childAgents ?? []
      const validationErrors: Parameters<typeof form.setFields>[0] = []

      if (!AGENT_ID_FORMAT_RE.test(values.agentId.trim())) {
        validationErrors.push({
          name: "agentId",
          errors: [t("智能体页.校验.agentId格式")],
        })
      }

      if (!values.name.trim()) {
        validationErrors.push({
          name: "name",
          errors: [t("智能体页.校验.名称必填")],
        })
      }

      for (const [index, child] of (values.childAgents ?? []).entries()) {
        if (!AGENT_ID_FORMAT_RE.test(child.agentId.trim())) {
          validationErrors.push({
            name: ["childAgents", index, "agentId"],
            errors: [t("智能体页.校验.agentId格式")],
          })
        }

        if (!child.name.trim()) {
          validationErrors.push({
            name: ["childAgents", index, "name"],
            errors: [t("智能体页.校验.名称必填")],
          })
        }
      }

      if (validationErrors.length > 0) {
        form.setFields(validationErrors)
        return
      }

      if (
        values.mode === "subagent"
        && ((values.childAgents?.length ?? 0) > 0 || editingBundleChildIds.length > 0 || linkedAgentIds.length > 0)
      ) {
        message.error(t("智能体页.校验.子智能体模式冲突"))
        return
      }

      const nextChildIds = new Set(
        childAgents
          .map((child) => child.agentId.trim())
          .filter(Boolean),
      )
      const removedAgentIds = editingBundleChildIds.filter((agentId) => !nextChildIds.has(agentId))

      setSaving(true)

      const result = await saveDesktopAgentBundle({
        root: {
          agentId: values.agentId.trim(),
          name: values.name.trim(),
          mode: values.mode,
          description: values.description.trim() || undefined,
          prompt: values.prompt.trim() || undefined,
          enabled: values.enabled,
        },
        childAgents: childAgents.map((child) => ({
          agentId: child.agentId.trim(),
          name: child.name.trim(),
          mode: child.mode,
          description: child.description.trim() || undefined,
          prompt: child.prompt.trim() || undefined,
          enabled: true,
        })),
        linkedAgentIds: values.mode === "subagent" ? [] : linkedAgentIds,
        removedAgentIds,
      })

      setItems((current) => applyBundleSaveResult(current, result))
      setSelectedAgentId(result.rootItem.agentId)
      message.success(t(editingItem ? "智能体页.反馈.更新成功" : "智能体页.反馈.创建成功"))

      closeEditor()
    } catch (error) {
      if (typeof error === "object" && error && "errorFields" in error) {
        return
      }
      message.error(`${t("智能体页.反馈.保存失败")}: ${normalizeError(error)}`)
    } finally {
      setSaving(false)
    }
  }, [closeEditor, editingItem, form, message, t])

  const handleToggleEnabled = useCallback(async (item: AgentItem) => {
    if (isReadonlyAgent(item) || item.mode === "subagent") {
      return
    }

    try {
      setTogglingId(item.agentId)
      const updated = await setDesktopAgentEnabled(item.agentId, !item.enabled)
      if (!updated) {
        throw new Error(item.agentId)
      }
      setItems((current) => upsertAgentItem(current, updated))
    } catch (error) {
      message.error(`${t("智能体页.反馈.保存失败")}: ${normalizeError(error)}`)
    } finally {
      setTogglingId(null)
    }
  }, [message, t])

  const handleDeleteAgent = useCallback(async (item: AgentItem) => {
    if (isReadonlyAgent(item)) {
      return
    }

    try {
      setDeletingId(item.agentId)
      const result = await removeDesktopAgent(item.agentId)
      if (!result.deleted) {
        throw new Error(item.agentId)
      }
      setItems((current) => current.filter((row) => row.agentId !== item.agentId))
      if (selectedAgentId === item.agentId) {
        setDetailOpen(false)
        setSelectedAgentId("")
      }
      message.success(t("智能体页.反馈.删除成功"))
    } catch (error) {
      message.error(`${t("智能体页.反馈.删除失败")}: ${normalizeError(error)}`)
    } finally {
      setDeletingId(null)
    }
  }, [message, selectedAgentId, t])

  const handleRefresh = useCallback(() => {
    void loadData(true)
  }, [loadData])

  const handleImportedAgents = useCallback((result: {
    items: AgentItem[]
    createdCount: number
    updatedCount: number
  }) => {
    setItems((current) => {
      const nextItems = [...current]
      for (const item of result.items) {
        const index = nextItems.findIndex((currentItem) => currentItem.agentId === item.agentId)
        if (index >= 0) {
          nextItems[index] = item
        } else {
          nextItems.push(item)
        }
      }
      nextItems.sort(compareAgentsByName)
      return nextItems
    })
    setImportOpen(false)
    if (result.items[0]) {
      setSelectedAgentId(result.items[0].agentId)
    }
    message.success(t("智能体页.反馈.导入OpenCode成功", {
      新建数: result.createdCount,
      更新数: result.updatedCount,
    }))
  }, [message, t])

  const columns = useMemo<TableColumnsType<AgentTableRow>>(
    () => createAgentColumns({
      deletingId,
      togglingId,
      t,
      onView: (item) => {
        setSelectedAgentId(item.agentId)
        setDetailOpen(true)
      },
      onEdit: (item) => {
        void openEditPage(item)
      },
      onRemove: handleDeleteAgent,
      onToggleEnabled: (item) => {
        void handleToggleEnabled(item)
      },
    }),
    [deletingId, handleDeleteAgent, handleToggleEnabled, openEditPage, t, togglingId],
  )

  if (!bridgeReady) {
    return (
      <section className="agents-page">
        <div className="agents-page-surface">
          <div className="agents-page-empty-state">
            <Empty
              description={windowBridgeReady
                ? t("智能体页.提示.桌面桥接加载中")
                : t("智能体页.提示.需要桌面外壳")}
            />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="agents-page">
      <div className="agents-page-surface">
        {editorOpen ? (
          <AgentEditorPage
            editingItem={editingItem}
            form={form}
            saving={saving}
            availableAgents={items}
            language={props.language}
            t={t}
            onBack={closeEditor}
            onSave={() => {
              void handleSave()
            }}
          />
        ) : (
          <>
            <div className="agents-page-toolbar-shell">
              <div className="agents-page-toolbar">
                <div className="agents-page-toolbar-actions">
                  <Button
                    icon={<ReloadOutlined aria-hidden="true" />}
                    loading={tableLoading}
                    onClick={handleRefresh}
                  >
                    {t("智能体页.按钮.刷新")}
                  </Button>

                  <Button icon={<ImportOutlined aria-hidden="true" />} onClick={() => setImportOpen(true)}>
                    {t("智能体页.按钮.导入OpenCode")}
                  </Button>

                  <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={openCreatePage}>
                    {t("智能体页.按钮.新建智能体")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="agents-page-table-shell">
              <AppTableCard
                className="agents-page-table-card"
                rowKey="rowId"
                columns={columns}
                items={tableRows}
                loading={tableLoading}
                loadingText={loadingTip}
                emptyDescription={t("智能体页.空状态.无智能体")}
                scrollX={1880}
                tableProps={{
                  className: "agents-table agents-page-table",
                  loading: tableRows.length > 0
                    ? {
                        spinning: tableLoading,
                        tip: loadingTip,
                      }
                    : false,
                  expandable: {
                    expandedRowKeys,
                    onExpandedRowsChange: (keys) => setExpandedRowKeys(keys.map(String)),
                    rowExpandable: (record) => Boolean(record.children && record.children.length > 0),
                    expandIcon: ({ expanded, onExpand, record }) => (
                      record.children && record.children.length > 0 ? (
                        <button
                          type="button"
                          className={`agents-table-expand-button${expanded ? " is-expanded" : ""}`}
                          aria-label={expanded ? "收起子智能体" : "展开子智能体"}
                          onClick={(event) => onExpand(record, event)}
                        >
                          {expanded ? (
                            <UpOutlined aria-hidden="true" className="agents-table-expand-button-icon" />
                          ) : (
                            <DownOutlined aria-hidden="true" className="agents-table-expand-button-icon" />
                          )}
                        </button>
                      ) : (
                        <span className="agents-table-expand-placeholder" />
                      )
                    ),
                  },
                  rowClassName: (record) => record.nested ? "agents-table-row-child" : "",
                }}
              />
            </div>
          </>
        )}
      </div>

      <AgentDetailModal open={detailOpen} item={selectedItem} t={t} onClose={() => setDetailOpen(false)} />

      <OpencodeAgentImportModal
        open={importOpen}
        t={t}
        onCancel={() => setImportOpen(false)}
        onImported={handleImportedAgents}
      />
    </section>
  )
}

export default AgentsPage