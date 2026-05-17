import { App as AntdApp, Typography, type TableColumnsType, type TableProps } from "antd"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { Translate } from "../../i18n"
import {
  autoInstallMcpByRequirement,
  createMcp,
  deleteMcp,
  fetchMcpCapabilities,
  fetchMcpList,
  fetchMcpMarketProviders,
  fetchMcpRecommended,
  healthCheckMcp,
  installMcpFromMarket,
  installRecommendedMcp,
  patchMcp,
  searchMcpMarket,
  searchMcpMarketByRequirement,
  testMcpConnection,
  type McpCapabilityProbeResult,
  type McpMarketProvider,
  type McpMarketProviderId,
  type McpTransport,
  type McpView,
} from "../../lib/desktop-mcp"
import {
  buildMcpSavePayload,
  buildInstalledMarketDisplayKey,
  dedupeMarketViewItems,
  defaultMarketProviders,
  hasDiscoveredTools,
  initialForm,
  normalizeError,
  shouldShowMcpSaveButton,
  toKeyValueText,
  toMetadataRecord,
  toPayload,
  type MarketViewItem,
  type McpForm,
  type TestResult,
} from "./helpers"
import {
  InspectModal,
  MarketModal,
  McpEditorModal,
  McpListSection,
  RecommendedModal,
} from "./components/sections"
import { createMcpColumns } from "./components/table-columns"
import "./page.css"

const { Text } = Typography
const MCP_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/

type Props = {
  t: Translate
  active: boolean
}

export function McpPage(props: Props) {
  const { message, modal } = AntdApp.useApp()
  const notifier = message
  const inspectRequestIdRef = useRef(0)
  const { t } = props
  const desktopMcpBridgeId = "desktop"
  const [items, setItems] = useState<McpView[]>([])
  const [recommendedItems, setRecommendedItems] = useState<Awaited<ReturnType<typeof fetchMcpRecommended>>>([])
  const [marketProviders, setMarketProviders] = useState<McpMarketProvider[]>([])
  const [marketProvider, setMarketProvider] = useState<McpMarketProviderId>("official")
  const [marketSearchText, setMarketSearchText] = useState("")
  const [marketItems, setMarketItems] = useState<MarketViewItem[]>([])
  const [marketQueries, setMarketQueries] = useState<string[]>([])
  const [marketTerms, setMarketTerms] = useState<string[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketRefreshing, setMarketRefreshing] = useState(false)
  const [installingMarketCatalogId, setInstallingMarketCatalogId] = useState<string | null>(null)
  const [marketAutoInstalling, setMarketAutoInstalling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [pendingToggleIds, setPendingToggleIds] = useState<string[]>([])
  const [installingRecommendedId, setInstallingRecommendedId] = useState<string | null>(null)
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([])
  const [marketDialogOpen, setMarketDialogOpen] = useState(false)
  const [recommendedDialogOpen, setRecommendedDialogOpen] = useState(false)
  const [batchActionLoading, setBatchActionLoading] = useState<string | null>(null)
  const [searchText, setSearchText] = useState("")
  const deferredSearchText = useDeferredValue(searchText)
  const [transportFilter, setTransportFilter] = useState<"all" | McpTransport>("all")
  const [nameSortOrder, setNameSortOrder] = useState<"ascend" | "descend">("ascend")
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false)
  const [inspectMcpId, setInspectMcpId] = useState("")
  const [capabilities, setCapabilities] = useState<McpCapabilityProbeResult | null>(null)
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<McpView | null>(null)
  const [form, setForm] = useState<McpForm>(initialForm)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)

  const inspectItem = useMemo(
    () => items.find((item) => item.id === inspectMcpId) ?? null,
    [inspectMcpId, items],
  )

  const visibleItems = useMemo(() => {
    const query = deferredSearchText.trim().toLowerCase()
    const searched = query
      ? items.filter((item) =>
          [
            item.name,
            item.id,
            item.endpoint,
            item.transport,
            item.description ?? "",
            ...(item.tags ?? []),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : items

    const filtered = transportFilter === "all"
      ? searched
      : searched.filter((item) => item.transport === transportFilter)

    return [...filtered].sort((left, right) => {
      const factor = nameSortOrder === "ascend" ? 1 : -1
      const nameCompare = left.name.localeCompare(right.name, "en", {
        numeric: true,
        sensitivity: "base",
      })
      if (nameCompare !== 0) {
        return nameCompare * factor
      }
      return left.id.localeCompare(right.id, "en", {
        numeric: true,
        sensitivity: "base",
      }) * factor
    })
  }, [deferredSearchText, items, nameSortOrder, transportFilter])

  const selectedRows = useMemo(
    () => items.filter((item) => selectedMcpIds.includes(item.id)),
    [items, selectedMcpIds],
  )

  const installedMarketState = useMemo(() => {
    const catalogIds = new Set<string>()
    const displayKeys = new Set<string>()
    for (const item of items) {
      const metadata = toMetadataRecord(item.metadata)
      const market = toMetadataRecord(metadata?.market)
      const catalogId = typeof market?.catalogId === "string" ? market.catalogId.trim() : ""
      if (catalogId) {
        catalogIds.add(catalogId)
      }

      const displayKey = buildInstalledMarketDisplayKey(item)
      if (displayKey) {
        displayKeys.add(displayKey)
      }
    }

    return { catalogIds, displayKeys }
  }, [items])

  const marketProviderOptions = marketProviders.length > 0 ? marketProviders : defaultMarketProviders
  const hasMarketSearchKeyword = marketSearchText.trim().length > 0
  const showSaveButton = shouldShowMcpSaveButton(form, testResult)

  const loadData = useCallback(async (silent = false) => {
    if (!props.active) {
      return
    }

    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [list, recommended] = await Promise.all([
        fetchMcpList(desktopMcpBridgeId, { limit: 1000, offset: 0 }),
        fetchMcpRecommended(desktopMcpBridgeId),
      ])
      setItems(list.items)
      setRecommendedItems(recommended)
    } catch (error) {
      notifier.error(t("MCP页.反馈.加载失败", { 错误: normalizeError(error) }))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [desktopMcpBridgeId, props.active, t])

  const loadMarketProviders = useCallback(async (silent = false) => {
    if (!props.active) {
      return
    }

    if (silent) {
      setMarketRefreshing(true)
    } else {
      setMarketLoading(true)
    }

    try {
      const providers = await fetchMcpMarketProviders(desktopMcpBridgeId)
      setMarketProviders(providers)
      if (!providers.some((item) => item.id === marketProvider)) {
        setMarketProvider("official")
      }
    } catch (error) {
      notifier.error(t("MCP页.反馈.市场来源加载失败", { 错误: normalizeError(error) }))
    } finally {
      setMarketLoading(false)
      setMarketRefreshing(false)
    }
  }, [desktopMcpBridgeId, marketProvider, props.active, t])

  useEffect(() => {
    if (!props.active) {
      return
    }
    void loadData(false)
  }, [loadData, props.active])

  useEffect(() => {
    if (!props.active) {
      return
    }
    void loadMarketProviders(false)
  }, [loadMarketProviders, props.active])

  useEffect(() => {
    setSelectedMcpIds((current) =>
      current.filter((id) => visibleItems.some((item) => item.id === id)),
    )
  }, [visibleItems])

  useEffect(() => {
    if (!inspectMcpId) {
      return
    }
    if (items.some((item) => item.id === inspectMcpId)) {
      return
    }

    setInspectDialogOpen(false)
    setInspectMcpId("")
    setCapabilities(null)
  }, [inspectMcpId, items])

  const closeEditModal = useCallback(() => {
    setModalOpen(false)
    setEditingItem(null)
    setForm(initialForm)
    setTestResult(null)
  }, [])

  const closeInspectModal = useCallback(() => {
    inspectRequestIdRef.current += 1
    setInspectDialogOpen(false)
    setInspectMcpId("")
    setCapabilities(null)
    setCapabilitiesLoading(false)
    setCheckingId(null)
  }, [])

  const openInspectModal = useCallback((item: McpView) => {
    inspectRequestIdRef.current += 1
    setInspectMcpId(item.id)
    setInspectDialogOpen(true)
    setCapabilities(null)
    setCapabilitiesLoading(false)
    setCheckingId(null)
  }, [])

  const openCreate = useCallback(() => {
    setEditingItem(null)
    setForm(initialForm)
    setTestResult(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((item: McpView) => {
    const metadata = toMetadataRecord(item.metadata) ?? {}
    setEditingItem(item)
    setForm({
      name: item.name,
      scope: item.scope,
      workspaceId: item.workspaceId || "",
      transport: item.transport,
      endpoint: item.endpoint,
      enabled: item.enabled,
      timeoutMs: item.timeoutMs ? String(item.timeoutMs) : "",
      tagsText: item.tags?.join(", ") || "",
      description: item.description || "",
      argsText: Array.isArray(metadata.args)
        ? metadata.args.filter((value): value is string => typeof value === "string").join("\n")
        : "",
      envText: toKeyValueText(metadata.env),
      headersText: toKeyValueText(metadata.headers),
      queryText: toKeyValueText(metadata.query),
    })
    setTestResult(null)
    setModalOpen(true)
  }, [])

  const saveMcp = useCallback(async () => {
    if (!form.name.trim()) {
      notifier.error(t("MCP页.校验.名称必填"))
      return
    }
    if (!MCP_NAME_RE.test(form.name.trim())) {
      notifier.error(t("MCP页.校验.名称格式"))
      return
    }
    if (form.scope === "workspace" && !form.workspaceId.trim()) {
      notifier.error(t("MCP页.校验.workspaceId必填"))
      return
    }
    if (!form.endpoint.trim()) {
      notifier.error(t("MCP页.校验.endpoint必填"))
      return
    }

    try {
      setSaving(true)
      const payload = buildMcpSavePayload(form, testResult, editingItem)
      if (editingItem) {
        await patchMcp(desktopMcpBridgeId, editingItem.id, payload)
        notifier.success(t("MCP页.反馈.更新成功"))
      } else {
        const created = await createMcp(desktopMcpBridgeId, payload)
        notifier.success(created.created ? t("MCP页.反馈.创建成功") : t("MCP页.反馈.已存在"))
      }
      closeEditModal()
      await loadData(true)
    } catch (error) {
      notifier.error(t("MCP页.反馈.保存失败", { 错误: normalizeError(error) }))
    } finally {
      setSaving(false)
    }
  }, [closeEditModal, desktopMcpBridgeId, editingItem, form, loadData, notifier, t, testResult])

  const runTestConnection = useCallback(async () => {
    try {
      setTesting(true)
      setTestResult(null)
      const result = await testMcpConnection(desktopMcpBridgeId, editingItem ? { ...toPayload(form), id: editingItem.id } : toPayload(form))
      setTestResult(result)
      notifier.success(t("MCP页.反馈.连接测试完成"))
    } catch (error) {
      setTestResult(null)
      notifier.error(t("MCP页.反馈.连接测试失败", { 错误: normalizeError(error) }))
    } finally {
      setTesting(false)
    }
  }, [desktopMcpBridgeId, editingItem, form, notifier, t])

  const setTogglePending = useCallback((mcpId: string, pending: boolean) => {
    setPendingToggleIds((current) => {
      if (pending) {
        return current.includes(mcpId) ? current : [...current, mcpId]
      }
      return current.filter((id) => id !== mcpId)
    })
  }, [])

  const removeMcp = useCallback(async (item: McpView) => {
    const confirmed = await modal.confirm({
      title: t("MCP页.按钮.删除"),
      content: `${item.name} · ${t("MCP页.提示.确认删除")}`,
      okText: t("MCP页.按钮.删除"),
      cancelText: t("MCP页.按钮.取消"),
      okButtonProps: { danger: true },
    })
    if (!confirmed) {
      return false
    }

    try {
      setDeletingId(item.id)
      await deleteMcp(desktopMcpBridgeId, item.id)
      notifier.success(t("MCP页.反馈.删除成功"))
      if (inspectMcpId === item.id) {
        closeInspectModal()
      }
      await loadData(true)
      return true
    } catch (error) {
      notifier.error(t("MCP页.反馈.删除失败", { 错误: normalizeError(error) }))
      return false
    } finally {
      setDeletingId(null)
    }
  }, [closeInspectModal, desktopMcpBridgeId, inspectMcpId, loadData, modal, notifier, t])

  const validateEnableCandidate = useCallback(async (item: McpView) => {
    const nextCapabilities = await fetchMcpCapabilities(desktopMcpBridgeId, item.id)
    if (hasDiscoveredTools(nextCapabilities)) {
      return null
    }

    return nextCapabilities.toolsMessage?.trim()
      || nextCapabilities.message?.trim()
      || nextCapabilities.toolsReasonCode?.trim()
      || nextCapabilities.reasonCode?.trim()
      || t("MCP页.反馈.检查失败", { 错误: item.name })
  }, [desktopMcpBridgeId, t])

  const toggleMcpEnabled = useCallback(async (item: McpView, enabled: boolean) => {
    const loadingMessageKey = `mcp-toggle-${item.id}`

    try {
      setTogglePending(item.id, true)
      if (enabled && !item.enabled) {
        void message.open({
          key: loadingMessageKey,
          type: "loading",
          content: t("MCP页.反馈.启用前检查中", { 名称: item.name }),
          duration: 0,
        })
        const failureMessage = await validateEnableCandidate(item)
        if (failureMessage) {
          message.destroy(loadingMessageKey)
          notifier.error(failureMessage)
          await loadData(true)
          return
        }
      }

      await patchMcp(desktopMcpBridgeId, item.id, { enabled })
      message.destroy(loadingMessageKey)
      notifier.success(t("MCP页.反馈.更新成功"))
      await loadData(true)
    } catch (error) {
      message.destroy(loadingMessageKey)
      notifier.error(t("MCP页.反馈.保存失败", { 错误: normalizeError(error) }))
    } finally {
      setTogglePending(item.id, false)
    }
  }, [desktopMcpBridgeId, loadData, message, notifier, setTogglePending, t, validateEnableCandidate])

  const runInspection = useCallback(async (item: McpView) => {
    const requestId = inspectRequestIdRef.current + 1
    inspectRequestIdRef.current = requestId
    setCapabilities(null)

    try {
      setCheckingId(item.id)
      setCapabilitiesLoading(true)

      await healthCheckMcp(desktopMcpBridgeId, item.id)
      const nextCapabilities = await fetchMcpCapabilities(desktopMcpBridgeId, item.id)
      await loadData(true)

      if (inspectRequestIdRef.current !== requestId) {
        return
      }

      if (!hasDiscoveredTools(nextCapabilities)) {
        const failureMessage = nextCapabilities.toolsMessage?.trim()
          || nextCapabilities.message?.trim()
          || nextCapabilities.toolsReasonCode?.trim()
          || nextCapabilities.reasonCode?.trim()
          || t("MCP页.反馈.检查失败", { 错误: item.name })
        setCapabilities(null)
        message.error(failureMessage)
        return
      }

      setCapabilities(nextCapabilities)
    } catch (error) {
      if (inspectRequestIdRef.current === requestId) {
        setCapabilities(null)
      }
      message.error(t("MCP页.反馈.检查失败", { 错误: normalizeError(error) }))
    } finally {
      if (inspectRequestIdRef.current === requestId) {
        setCheckingId(null)
        setCapabilitiesLoading(false)
      }
    }
  }, [desktopMcpBridgeId, loadData, message, t])

  const runBatchEnable = useCallback(async (enabled: boolean) => {
    if (selectedRows.length === 0) {
      return
    }

    try {
      setBatchActionLoading(enabled ? "enable" : "disable")
      if (enabled) {
        for (const row of selectedRows) {
          if (row.enabled) {
            continue
          }
          const failureMessage = await validateEnableCandidate(row)
          if (failureMessage) {
            notifier.error(failureMessage)
            await loadData(true)
            return
          }
        }
      }
      await Promise.all(selectedRows.map((row) => patchMcp(desktopMcpBridgeId, row.id, { enabled })))
      notifier.success(t("MCP页.反馈.更新成功"))
      await loadData(true)
    } catch (error) {
      notifier.error(t("MCP页.反馈.保存失败", { 错误: normalizeError(error) }))
    } finally {
      setBatchActionLoading(null)
    }
  }, [desktopMcpBridgeId, loadData, notifier, selectedRows, t, validateEnableCandidate])

  const runBatchHealthCheck = useCallback(async () => {
    if (selectedRows.length === 0) {
      return
    }

    try {
      setBatchActionLoading("health")
      await Promise.all(selectedRows.map((row) => healthCheckMcp(desktopMcpBridgeId, row.id)))
      notifier.success(t("MCP页.反馈.健康检查完成"))
      await loadData(true)
    } catch (error) {
      notifier.error(t("MCP页.反馈.健康检查失败", { 错误: normalizeError(error) }))
    } finally {
      setBatchActionLoading(null)
    }
  }, [desktopMcpBridgeId, loadData, notifier, selectedRows, t])

  const runBatchDelete = useCallback(async () => {
    if (selectedRows.length === 0) {
      return
    }

    const confirmed = await modal.confirm({
      title: t("MCP页.按钮.删除"),
      content: t("MCP页.提示.确认删除"),
      okText: t("MCP页.按钮.删除"),
      cancelText: t("MCP页.按钮.取消"),
      okButtonProps: { danger: true },
    })
    if (!confirmed) {
      return
    }

    try {
      setBatchActionLoading("delete")
      await Promise.all(selectedRows.map((row) => deleteMcp(desktopMcpBridgeId, row.id)))
      if (inspectMcpId && selectedRows.some((row) => row.id === inspectMcpId)) {
        closeInspectModal()
      }
      setSelectedMcpIds([])
      notifier.success(t("MCP页.反馈.删除成功"))
      await loadData(true)
    } catch (error) {
      notifier.error(t("MCP页.反馈.删除失败", { 错误: normalizeError(error) }))
    } finally {
      setBatchActionLoading(null)
    }
  }, [closeInspectModal, desktopMcpBridgeId, inspectMcpId, loadData, modal, notifier, selectedRows, t])

  const installRecommended = useCallback(async (recommendedId: string) => {
    try {
      setInstallingRecommendedId(recommendedId)
      await installRecommendedMcp(desktopMcpBridgeId, recommendedId)
      notifier.success(t("MCP页.反馈.推荐安装成功"))
      await loadData(true)
    } catch (error) {
      notifier.error(t("MCP页.反馈.推荐安装失败", { 错误: normalizeError(error) }))
    } finally {
      setInstallingRecommendedId(null)
    }
  }, [desktopMcpBridgeId, loadData, notifier, t])

  const searchMarket = useCallback(async (
    silent = false,
    qOverride?: string,
    providerOverride?: McpMarketProviderId,
  ) => {
    const keyword = (qOverride ?? marketSearchText).trim()
    if (!keyword) {
      notifier.info(t("MCP页.反馈.市场搜索词必填"))
      return
    }

    if (silent) {
      setMarketRefreshing(true)
    } else {
      setMarketLoading(true)
    }

    try {
      const result = await searchMcpMarket(desktopMcpBridgeId, {
        provider: providerOverride ?? marketProvider,
        q: keyword,
        limit: 20,
      })
      setMarketItems(dedupeMarketViewItems(result.items))
      setMarketQueries([])
      setMarketTerms([])
      setMarketProviders(result.providers)
    } catch (error) {
      notifier.error(t("MCP页.反馈.市场搜索失败", { 错误: normalizeError(error) }))
    } finally {
      setMarketLoading(false)
      setMarketRefreshing(false)
    }
  }, [desktopMcpBridgeId, marketProvider, marketSearchText, notifier, t])

  const searchMarketByNeed = useCallback(async (
    silent = false,
    requirementOverride?: string,
    providerOverride?: McpMarketProviderId,
  ) => {
    const requirement = (requirementOverride ?? marketSearchText).trim()
    if (!requirement) {
      notifier.info(t("MCP页.反馈.市场需求必填"))
      return
    }

    if (silent) {
      setMarketRefreshing(true)
    } else {
      setMarketLoading(true)
    }

    try {
      const result = await searchMcpMarketByRequirement(desktopMcpBridgeId, {
        provider: providerOverride ?? marketProvider,
        requirement,
        limit: 10,
      })
      setMarketItems(dedupeMarketViewItems(result.items.map((item) => ({ ...item }))))
      setMarketQueries(result.queries)
      setMarketTerms(result.terms)
      setMarketProviders(result.providers)
      if (result.items.length === 0) {
        notifier.info(t("MCP页.反馈.市场无匹配候选"))
      }
    } catch (error) {
      notifier.error(t("MCP页.反馈.市场需求搜索失败", { 错误: normalizeError(error) }))
    } finally {
      setMarketLoading(false)
      setMarketRefreshing(false)
    }
  }, [desktopMcpBridgeId, marketProvider, marketSearchText, notifier, t])

  const installMarketItem = useCallback(async (item: MarketViewItem) => {
    if (!item.catalogId) {
      notifier.error(t("MCP页.反馈.市场条目缺少catalogId"))
      return
    }

    try {
      setInstallingMarketCatalogId(item.catalogId)
      const result = await installMcpFromMarket(desktopMcpBridgeId, {
        provider: item.provider,
        catalogId: item.catalogId,
        enabled: false,
      })
      notifier.success(result.created ? t("MCP页.反馈.市场安装成功") : t("MCP页.反馈.市场已安装"))
      await Promise.all([loadData(true), loadMarketProviders(true)])
    } catch (error) {
      notifier.error(t("MCP页.反馈.市场安装失败", { 错误: normalizeError(error) }))
    } finally {
      setInstallingMarketCatalogId(null)
    }
  }, [desktopMcpBridgeId, loadData, loadMarketProviders, notifier, t])

  const autoInstallMarketByRequirement = useCallback(async () => {
    const requirement = marketSearchText.trim()
    if (!requirement) {
      notifier.info(t("MCP页.反馈.市场需求必填"))
      return
    }

    try {
      setMarketAutoInstalling(true)
      const result = await autoInstallMcpByRequirement(desktopMcpBridgeId, {
        provider: marketProvider,
        requirement,
        limit: 6,
        enabled: false,
      })
      setMarketItems(dedupeMarketViewItems(result.candidates.map((item) => ({ ...item }))))
      setMarketQueries(result.queries)
      setMarketTerms(result.terms)
      setMarketProviders((current) => (current.length > 0 ? current : defaultMarketProviders))
      notifier.success(
        result.installation.created
          ? t("MCP页.反馈.市场自动安装成功", { 名称: result.selected.title })
          : t("MCP页.反馈.市场自动安装已存在", { 名称: result.selected.title }),
      )
      await Promise.all([loadData(true), loadMarketProviders(true)])
    } catch (error) {
      notifier.error(t("MCP页.反馈.市场自动安装失败", { 错误: normalizeError(error) }))
    } finally {
      setMarketAutoInstalling(false)
    }
  }, [desktopMcpBridgeId, loadData, loadMarketProviders, marketProvider, marketSearchText, notifier, t])

  const columns = useMemo<TableColumnsType<McpView>>(
    () => createMcpColumns({
      deletingId,
      nameSortOrder,
      pendingToggleIds,
      t,
      onDelete: (row) => {
        void removeMcp(row)
      },
      onEdit: openEdit,
      onInspect: openInspectModal,
      onToggleEnabled: (row, enabled) => {
        void toggleMcpEnabled(row, enabled)
      },
    }),
    [deletingId, nameSortOrder, openEdit, openInspectModal, pendingToggleIds, removeMcp, t, toggleMcpEnabled],
  )

  const rowSelection: TableProps<McpView>["rowSelection"] = useMemo(() => ({
    columnWidth: 40,
    type: "checkbox",
    selectedRowKeys: selectedMcpIds,
    preserveSelectedRowKeys: false,
    onChange: (selectedRowKeys) => {
      setSelectedMcpIds(selectedRowKeys as string[])
    },
  }), [selectedMcpIds])

  const handleTableChange: NonNullable<TableProps<McpView>["onChange"]> = useCallback(
    (_pagination, _filters, sorter) => {
      const nextSorter = Array.isArray(sorter) ? sorter[0] : sorter
      if (
        nextSorter?.columnKey === "name"
        && (nextSorter.order === "ascend" || nextSorter.order === "descend")
      ) {
        setNameSortOrder(nextSorter.order)
        return
      }
      setNameSortOrder("ascend")
    },
    [],
  )

  return (
    <section className="mcp-page">
      <div className="mcp-page-surface">
        <McpListSection
          batchActionLoading={batchActionLoading}
          columns={columns}
          loading={loading}
          refreshing={refreshing}
          rowSelection={rowSelection}
          searchText={searchText}
          selectedRowsCount={selectedRows.length}
          t={t}
          transportFilter={transportFilter}
          visibleItems={visibleItems}
          onBatchDelete={() => {
            void runBatchDelete()
          }}
          onBatchHealthCheck={() => {
            void runBatchHealthCheck()
          }}
          onBatchToggleEnabled={(enabled) => {
            void runBatchEnable(enabled)
          }}
          onCreate={openCreate}
          onOpenMarket={() => {
            const nextKeyword = searchText.trim()
            setMarketDialogOpen(true)
            if (nextKeyword) {
              setMarketSearchText(nextKeyword)
              void searchMarket(false, nextKeyword, marketProvider)
            }
          }}
          onOpenRecommended={() => setRecommendedDialogOpen(true)}
          onRefresh={() => {
            void loadData(true)
          }}
          onSearchTextChange={setSearchText}
          onTableChange={handleTableChange}
          onTransportFilterChange={setTransportFilter}
        />
      </div>

      <InspectModal
        capabilities={capabilities}
        capabilitiesLoading={capabilitiesLoading}
        checkingId={checkingId}
        inspectItem={inspectDialogOpen ? inspectItem : null}
        t={t}
        onCancel={closeInspectModal}
        onRefresh={(item) => {
          void runInspection(item)
        }}
      />

      <MarketModal
        hasMarketSearchKeyword={hasMarketSearchKeyword}
        installedMarketCatalogIds={installedMarketState.catalogIds}
        installedMarketDisplayKeys={installedMarketState.displayKeys}
        installingMarketCatalogId={installingMarketCatalogId}
        marketAutoInstalling={marketAutoInstalling}
        marketDialogOpen={marketDialogOpen}
        marketItems={marketItems}
        marketLoading={marketLoading}
        marketProvider={marketProvider}
        marketProviderOptions={marketProviderOptions}
        marketQueries={marketQueries}
        marketRefreshing={marketRefreshing}
        marketSearchText={marketSearchText}
        marketTerms={marketTerms}
        t={t}
        onAutoInstall={() => {
          void autoInstallMarketByRequirement()
        }}
        onCancel={() => setMarketDialogOpen(false)}
        onInstall={(item) => {
          void installMarketItem(item)
        }}
        onProviderChange={(value) => {
          setMarketProvider(value)
          if (hasMarketSearchKeyword) {
            void searchMarket(true, marketSearchText, value)
          }
        }}
        onSearch={() => {
          void searchMarket(true, marketSearchText, marketProvider)
        }}
        onSearchByNeed={() => {
          void searchMarketByNeed(true, marketSearchText, marketProvider)
        }}
        onSearchTextChange={setMarketSearchText}
      />

      <RecommendedModal
        installingRecommendedId={installingRecommendedId}
        recommendedDialogOpen={recommendedDialogOpen}
        recommendedItems={recommendedItems}
        t={t}
        onCancel={() => setRecommendedDialogOpen(false)}
        onInstall={(item) => {
          void installRecommended(item.id)
        }}
      />

      <McpEditorModal
        deletingId={deletingId}
        editingItem={editingItem}
        form={form}
        modalOpen={modalOpen}
        saving={saving}
        showSaveButton={showSaveButton}
        t={t}
        testResult={testResult}
        testing={testing}
        onCancel={closeEditModal}
        onDelete={async (item) => {
          const removed = await removeMcp(item)
          if (removed) {
            closeEditModal()
          }
        }}
        onFormChange={(updater) => {
          setForm((current) => updater(current))
          setTestResult(null)
        }}
        onSave={() => {
          void saveMcp()
        }}
        onTestConnection={() => {
          void runTestConnection()
        }}
      />
    </section>
  )
}

export default McpPage
