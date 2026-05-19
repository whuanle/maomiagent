import {
  Card,
  Empty,
  Tabs,
} from "antd"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  FeishuBotConfigInput,
  FeishuBotStateView,
  FeishuStateView,
} from "../../../shared/desktop-feishu"
import type { DesktopWorkspaceItem as WorkspaceItem } from "../../../shared/desktop-workspace"
import type { FeishuTranslate as Translate } from "./types"
import {
  beginFeishuDeveloperAuthorization,
  clearFeishuBotConfig,
  clearFeishuPersonalConfig,
  clearFeishuSmartAssistantConfig,
  fetchFeishuBotState,
  fetchFeishuState,
  refreshFeishuDeveloperToken,
  saveFeishuBotConfig,
  saveFeishuDeveloperConfig,
  saveFeishuPersonalConfig,
  subscribeFeishuMutations,
} from "../../lib/feishu"
import { reserveFeishuAuthorizationWindow } from "../../lib/feishu-auth-window"
import { fetchMcpCapabilities } from "../../lib/mcp"
import { notifier } from "../../lib/notifications"
import {
  fetchActiveWorkspace,
  fetchWorkspaceRestoreState,
  fetchWorkspaces,
  saveWorkspaceRestoreState,
} from "../../lib/workspace"
import { FeishuBotConfigPanel } from "./components/bot-config-panel"
import {
  FeishuDocsWorkbench,
  type FeishuDocsWorkbenchUiState,
} from "./components/docs-workbench"
import { FeishuPersonalDocsPanel } from "./components/personal-docs-panel"
import { FeishuSmartAssistantPanel } from "./components/smart-assistant-panel"
import {
  FEISHU_DOCS_WORKSPACE_UI_KEY,
  getFeishuPageStorageKey,
  isSameDocsUiState,
  mergeFeishuDocsUiStateWithWorkspaceRestore,
  readFeishuPagePersistentState,
  writeFeishuPagePersistentState,
  type FeishuPageView,
} from "./page-state"
import "./page.css"

type Props = {
  active: boolean
  t: Translate
}

type FeishuPageTabKey = Exclude<FeishuPageView, "personal-docs-workspace">

async function hydratePersonalDiscoveredTools(
  baseUrl: string,
  state: FeishuStateView,
): Promise<FeishuStateView> {
  if (state.smartAssistant.enabled) {
    return state
  }
  if (!state.personalDocs.enabled) {
    return state
  }
  if ((state.personalDocs.discoveredTools.length ?? 0) > 0) {
    return state
  }
  if (!state.personalDocs.docsMcp?.mcpId) {
    return state
  }

  try {
    const capabilities = await fetchMcpCapabilities(baseUrl, state.personalDocs.docsMcp.mcpId)
    if (capabilities.toolDetails.length === 0) {
      return state
    }

    const discoveredTools = capabilities.toolDetails.map((item) => ({
      name: item.name,
      ...(item.description ? { description: item.description } : {}),
    }))

    return {
      ...state,
      personalDocs: {
        ...state.personalDocs,
        discoveredTools,
      },
      personal: state.personal
        ? {
            ...state.personal,
            discoveredTools,
          }
        : state.personal,
    }
  } catch {
    return state
  }
}

function readResolvedFeishuPagePersistentState(activeWorkspaceId?: string) {
  const persistedState = readFeishuPagePersistentState(activeWorkspaceId)
  return {
    pageView: persistedState.pageView,
    docs: persistedState.docs,
  }
}

function resolvePersonalUrl(state: FeishuStateView | null): string {
  return state?.personalDocs.serverUrl ?? state?.personal?.serverUrl ?? ""
}

function resolveAssistantAppId(state: FeishuStateView | null): string {
  return state?.smartAssistant.appId ?? state?.developer?.appId ?? ""
}

function resolveAssistantRedirectUri(state: FeishuStateView | null): string {
  return state?.smartAssistant.redirectUri ?? state?.developer?.redirectUri ?? ""
}

export function FeishuPage(props: Props) {
  const baseUrl = "desktop://feishu"
  const wasActiveRef = useRef(props.active)

  const [activeWorkspaceId, setActiveWorkspaceId] = useState("")
  const [pageView, setPageView] = useState<FeishuPageView>(
    () => readResolvedFeishuPagePersistentState().pageView,
  )
  const [docsUiState, setDocsUiState] = useState<FeishuDocsWorkbenchUiState>(
    () => readResolvedFeishuPagePersistentState().docs,
  )
  const [docsWorkspaceReturnView, setDocsWorkspaceReturnView] =
    useState<FeishuPageTabKey>("personal-docs")
  const [docsUiStateReady, setDocsUiStateReady] = useState(false)
  const [hydratedPageStateStorageKey, setHydratedPageStateStorageKey] = useState("")
  const [state, setState] = useState<FeishuStateView | null>(null)
  const [botState, setBotState] = useState<FeishuBotStateView | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [personalUrl, setPersonalUrl] = useState("")
  const [personalDraftDirty, setPersonalDraftDirty] = useState(false)
  const [assistantAppId, setAssistantAppId] = useState("")
  const [assistantAppSecret, setAssistantAppSecret] = useState("")
  const [assistantRedirectUri, setAssistantRedirectUri] = useState("")
  const [assistantDraftDirty, setAssistantDraftDirty] = useState(false)
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [clearingPersonal, setClearingPersonal] = useState(false)
  const [savingAssistant, setSavingAssistant] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [refreshingToken, setRefreshingToken] = useState(false)
  const [clearingAssistant, setClearingAssistant] = useState(false)
  const [savingBot, setSavingBot] = useState(false)
  const [clearingBot, setClearingBot] = useState(false)
  const pageStateStorageKey = getFeishuPageStorageKey(activeWorkspaceId)

  const syncPersonalDraftFromState = useCallback((nextState: FeishuStateView | null) => {
    setPersonalUrl(resolvePersonalUrl(nextState))
    setPersonalDraftDirty(false)
  }, [])

  const syncAssistantDraftFromState = useCallback((nextState: FeishuStateView | null) => {
    setAssistantAppId(resolveAssistantAppId(nextState))
    setAssistantAppSecret("")
    setAssistantRedirectUri(resolveAssistantRedirectUri(nextState))
    setAssistantDraftDirty(false)
  }, [])

  const handlePersonalUrlChange = useCallback((value: string) => {
    setPersonalDraftDirty(true)
    setPersonalUrl(value)
  }, [])

  const handleAssistantAppIdChange = useCallback((value: string) => {
    setAssistantDraftDirty(true)
    setAssistantAppId(value)
  }, [])

  const handleAssistantAppSecretChange = useCallback((value: string) => {
    setAssistantDraftDirty(true)
    setAssistantAppSecret(value)
  }, [])

  const loadData = useCallback(async (silent = false) => {
    if (!baseUrl) {
      setState(null)
      setBotState(null)
      setWorkspaces([])
      setActiveWorkspaceId("")
      setLoadError("")
      return
    }

    if (!props.active) {
      return
    }

    if (!silent) {
      setLoading(true)
    }

    try {
      const [
        stateResult,
        botResult,
        workspaceResult,
        activeWorkspaceResult,
      ] = await Promise.allSettled([
        fetchFeishuState(baseUrl),
        fetchFeishuBotState(baseUrl),
        fetchWorkspaces(baseUrl, {
          includeUnavailable: true,
          limit: 200,
          offset: 0,
        }),
        fetchActiveWorkspace(baseUrl),
      ])

      if (stateResult.status === "rejected") {
        throw stateResult.reason
      }
      if (botResult.status === "rejected") {
        throw botResult.reason
      }

      const hydratedState = await hydratePersonalDiscoveredTools(baseUrl, stateResult.value)
      setState(hydratedState)
      setBotState(botResult.value)
      setWorkspaces(
        workspaceResult.status === "fulfilled"
          ? workspaceResult.value.items
          : [],
      )
      setActiveWorkspaceId(
        activeWorkspaceResult.status === "fulfilled"
          ? activeWorkspaceResult.value.item?.workspaceId
            ?? activeWorkspaceResult.value.active?.workspaceId
            ?? ""
          : "",
      )
      setLoadError("")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setLoadError(message)
      if (!silent) {
        notifier.error(props.t("飞书页.反馈.加载失败", { 错误: message }))
      }
    } finally {
      setLoading(false)
    }
  }, [baseUrl, props.active, props.t])

  useEffect(() => {
    if (!props.active) {
      return
    }
    void loadData(false)
  }, [loadData, props.active])

  useEffect(() => {
    const becameActive = props.active && !wasActiveRef.current
    wasActiveRef.current = props.active
    if (!becameActive) {
      return
    }

    void loadData(true)
  }, [loadData, props.active])

  useEffect(() => {
    if (!state) {
      syncPersonalDraftFromState(null)
      syncAssistantDraftFromState(null)
      return
    }

    if (!personalDraftDirty) {
      syncPersonalDraftFromState(state)
    }
    if (!assistantDraftDirty) {
      syncAssistantDraftFromState(state)
    }
  }, [assistantDraftDirty, personalDraftDirty, state, syncAssistantDraftFromState, syncPersonalDraftFromState])

  useEffect(() => {
    let cancelled = false
    const persistedState = readResolvedFeishuPagePersistentState(activeWorkspaceId)

    setDocsUiStateReady(false)
    setHydratedPageStateStorageKey("")
    setPageView(persistedState.pageView)
    setDocsUiState(persistedState.docs)

    if (!baseUrl || !activeWorkspaceId.trim()) {
      setDocsUiStateReady(true)
      setHydratedPageStateStorageKey(pageStateStorageKey)
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const restoreState = await fetchWorkspaceRestoreState(baseUrl, activeWorkspaceId)
        if (cancelled) {
          return
        }

        const mergedState = mergeFeishuDocsUiStateWithWorkspaceRestore(
          persistedState.docs,
          restoreState,
        )
        setDocsUiState((previous) => (
          isSameDocsUiState(previous, mergedState)
            ? previous
            : mergedState
        ))
      } catch {
        // Keep the page usable even if restore-state hydration fails.
      } finally {
        if (!cancelled) {
          setDocsUiStateReady(true)
          setHydratedPageStateStorageKey(pageStateStorageKey)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, baseUrl, pageStateStorageKey])

  useEffect(() => {
    if (hydratedPageStateStorageKey !== pageStateStorageKey) {
      return
    }

    writeFeishuPagePersistentState(activeWorkspaceId || undefined, {
      pageView,
      docs: docsUiState,
    })
  }, [
    activeWorkspaceId,
    docsUiState,
    hydratedPageStateStorageKey,
    pageStateStorageKey,
    pageView,
  ])

  useEffect(() => {
    if (!docsUiStateReady || !baseUrl || !activeWorkspaceId.trim()) {
      return
    }

    const timer = window.setTimeout(() => {
      void saveWorkspaceRestoreState(baseUrl, activeWorkspaceId, {
        ui: {
          [FEISHU_DOCS_WORKSPACE_UI_KEY]: {
            ...(docsUiState.activeDocId ? { activeDocId: docsUiState.activeDocId } : {}),
            treeRootDocId: docsUiState.treeRootDocId.trim(),
            workspaceMode: docsUiState.workspaceMode,
          },
        },
      }).catch(() => undefined)
    }, 320)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeWorkspaceId, baseUrl, docsUiState, docsUiStateReady])

  useEffect(() => {
    if (!props.active || !baseUrl) {
      return
    }

    return subscribeFeishuMutations(baseUrl, () => {
      void loadData(true)
    })
  }, [baseUrl, loadData, props.active])

  const handleSavePersonal = useCallback(async () => {
    if (!baseUrl) {
      return
    }
    if (state?.smartAssistant.enabled) {
      notifier.warning("已启用飞书智能助手，个人文档 MCP 已停用。")
      return
    }
    if (!personalUrl.trim()) {
      notifier.error(props.t("飞书页.校验.个人URL必填"))
      return
    }

    try {
      setSavingPersonal(true)
      const nextState = await saveFeishuPersonalConfig(baseUrl, {
        serverUrl: personalUrl.trim(),
      })
      const hydratedState = await hydratePersonalDiscoveredTools(baseUrl, nextState)
      setState(hydratedState)
      syncPersonalDraftFromState(hydratedState)
      setLoadError("")
      notifier.success(props.t("飞书页.反馈.保存成功"))
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.保存失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setSavingPersonal(false)
    }
  }, [baseUrl, personalUrl, props.t, state?.smartAssistant.enabled])

  const handleClearPersonal = useCallback(async () => {
    if (!baseUrl) {
      return
    }

    try {
      setClearingPersonal(true)
      const nextState = await clearFeishuPersonalConfig(baseUrl)
      setState(nextState)
      syncPersonalDraftFromState(nextState)
      setPageView("personal-docs")
      setLoadError("")
      notifier.success("个人文档 MCP 已清除")
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.清除失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setClearingPersonal(false)
    }
  }, [baseUrl, props.t])

  const handleSaveAssistant = useCallback(async () => {
    if (!baseUrl) {
      return
    }
    if (!assistantAppId.trim()) {
      notifier.error("请先填写飞书智能助手应用 App ID")
      return
    }
    if (!state?.smartAssistant.hasAppSecret && !assistantAppSecret.trim()) {
      notifier.error("请先填写飞书智能助手应用 App Secret")
      return
    }

    try {
      setSavingAssistant(true)
      const nextState = await saveFeishuDeveloperConfig(baseUrl, {
        appId: assistantAppId.trim(),
        appSecret: assistantAppSecret.trim() || undefined,
      })
      setState(nextState)
      syncAssistantDraftFromState(nextState)
      setLoadError("")
      notifier.success("飞书智能助手配置已保存")
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.保存失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setSavingAssistant(false)
    }
  }, [
    baseUrl,
    assistantAppId,
    assistantAppSecret,
    props.t,
    state?.smartAssistant.hasAppSecret,
  ])

  const handleAuthorizeAssistant = useCallback(async () => {
    if (!baseUrl) {
      return
    }

    const savedAssistant = state?.smartAssistant
    if (!savedAssistant?.appId || !savedAssistant.hasAppSecret) {
      notifier.error("请先保存飞书智能助手配置，再发起 OAuth")
      return
    }

    const authWindow = reserveFeishuAuthorizationWindow()
    if (authWindow.blocked) {
      notifier.warning(props.t("飞书页.反馈.授权页被拦截"))
      return
    }

    try {
      setAuthorizing(true)
      const result = await beginFeishuDeveloperAuthorization(baseUrl, {
        appId: savedAssistant.appId,
        redirectUri: savedAssistant.redirectUri,
      })
      setState(result.item)

      const opened = await authWindow.open(result.authUrl)
      if (!opened) {
        notifier.warning(props.t("飞书页.反馈.授权页被拦截"))
      } else {
        notifier.success(props.t("飞书页.反馈.授权页已打开"))
      }
    } catch (error) {
      authWindow.close()
      notifier.error(props.t("飞书页.反馈.授权启动失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setAuthorizing(false)
    }
  }, [baseUrl, props.t, state?.smartAssistant])

  const handleRefreshAssistantToken = useCallback(async () => {
    if (!baseUrl) {
      return
    }

    try {
      setRefreshingToken(true)
      const nextState = await refreshFeishuDeveloperToken(baseUrl)
      setState(nextState)
      setLoadError("")
      notifier.success("飞书智能助手 Token 已刷新")
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.Token刷新失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setRefreshingToken(false)
    }
  }, [baseUrl, props.t])

  const handleClearAssistant = useCallback(async () => {
    if (!baseUrl) {
      return
    }

    try {
      setClearingAssistant(true)
      const nextState = await clearFeishuSmartAssistantConfig(baseUrl)
      setState(nextState)
      syncAssistantDraftFromState(nextState)
      setPageView("smart-assistant")
      setLoadError("")
      notifier.success("飞书智能助手配置已清除")
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.清除失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setClearingAssistant(false)
    }
  }, [baseUrl, props.t])

  const handleSaveBot = useCallback(async (input: FeishuBotConfigInput) => {
    if (!baseUrl) {
      return
    }
    if (!input.appId.trim()) {
      notifier.error(props.t("飞书页.校验.机器人AppId必填"))
      return
    }
    if (!botState?.hasAppSecret && !input.appSecret?.trim()) {
      notifier.error(props.t("飞书页.校验.机器人AppSecret必填"))
      return
    }

    try {
      setSavingBot(true)
      const nextState = await saveFeishuBotConfig(baseUrl, input)
      setBotState(nextState)
      setLoadError("")
      notifier.success(props.t("飞书页.反馈.机器人保存成功"))
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.机器人保存失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setSavingBot(false)
    }
  }, [baseUrl, botState?.hasAppSecret, props.t])

  const handleClearBot = useCallback(async () => {
    if (!baseUrl) {
      return
    }

    try {
      setClearingBot(true)
      const nextState = await clearFeishuBotConfig(baseUrl)
      setBotState(nextState)
      setLoadError("")
      notifier.success(props.t("飞书页.反馈.机器人清除成功"))
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.机器人清除失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setClearingBot(false)
    }
  }, [baseUrl, props.t])

  const handleOpenDocsWorkspace = useCallback((returnView: FeishuPageTabKey) => {
    const smartAssistantActive =
      state?.smartAssistant.enabled === true || state?.mode === "developer"
    const smartAssistantAuthorized =
      state?.smartAssistant.authStatus === "authorized"
      || state?.developer?.authStatus === "authorized"
    const personalDocsReady = Boolean(state?.personalDocs.docsMcp?.mcpId)

    if (smartAssistantActive) {
      if (!smartAssistantAuthorized) {
        notifier.warning("请先完成飞书智能助手授权")
        return
      }
    } else if (!personalDocsReady && !smartAssistantAuthorized) {
      notifier.warning("请先完成飞书文档接入")
      return
    }

    setDocsWorkspaceReturnView(returnView)
    setPageView("personal-docs-workspace")
  }, [
    state?.developer?.authStatus,
    state?.mode,
    state?.personalDocs.docsMcp?.mcpId,
    state?.smartAssistant.authStatus,
    state?.smartAssistant.enabled,
  ])

  const handleDocsUiStateChange = useCallback((nextState: FeishuDocsWorkbenchUiState) => {
    setDocsUiState((previous) => (
      isSameDocsUiState(previous, nextState)
        ? previous
        : nextState
    ))
  }, [])

  const canOpenDocsWorkspace = useMemo(() => {
    const smartAssistantActive =
      state?.smartAssistant.enabled === true || state?.mode === "developer"
    const smartAssistantAuthorized =
      state?.smartAssistant.authStatus === "authorized"
      || state?.developer?.authStatus === "authorized"
    const personalDocsReady = Boolean(state?.personalDocs.docsMcp?.mcpId)

    if (smartAssistantActive) {
      return smartAssistantAuthorized
    }

    return personalDocsReady || smartAssistantAuthorized
  }, [
    state?.developer?.authStatus,
    state?.mode,
    state?.personalDocs.docsMcp?.mcpId,
    state?.smartAssistant.authStatus,
    state?.smartAssistant.enabled,
  ])
  const pageSections = useMemo(() => ([
    {
      key: "personal-docs" as const,
      label: "个人文档 MCP",
      content: (
        <FeishuPersonalDocsPanel
          state={state}
          loadError={loadError}
          personalUrl={personalUrl}
          saving={savingPersonal}
          clearing={clearingPersonal}
          canOpenDocsWorkspace={canOpenDocsWorkspace}
          onPersonalUrlChange={handlePersonalUrlChange}
          onSave={() => {
            void handleSavePersonal()
          }}
          onClear={() => {
            void handleClearPersonal()
          }}
          onOpenDocsWorkspace={() => handleOpenDocsWorkspace("personal-docs")}
          onRefresh={() => {
            void loadData(false)
          }}
        />
      ),
    },
    {
      key: "bot" as const,
      label: "飞书机器人",
      content: (
        <FeishuBotConfigPanel
          baseUrl={baseUrl}
          t={props.t}
          botState={botState}
          workspaces={workspaces}
          loading={loading}
          loadError={loadError}
          saving={savingBot}
          clearing={clearingBot}
          onSave={handleSaveBot}
          onClear={() => {
            void handleClearBot()
          }}
          onRefresh={() => {
            void loadData(false)
          }}
        />
      ),
    },
    {
      key: "smart-assistant" as const,
      label: "飞书智能助手",
      content: (
        <FeishuSmartAssistantPanel
          baseUrl={baseUrl}
          state={state}
          activeWorkspaceId={activeWorkspaceId}
          workspaces={workspaces}
          loadError={loadError}
          assistantAppId={assistantAppId}
          assistantAppSecret={assistantAppSecret}
          assistantRedirectUri={assistantRedirectUri}
          saving={savingAssistant}
          authorizing={authorizing}
          refreshingToken={refreshingToken}
          clearing={clearingAssistant}
          canOpenDocsWorkspace={canOpenDocsWorkspace}
          onAssistantAppIdChange={handleAssistantAppIdChange}
          onAssistantAppSecretChange={handleAssistantAppSecretChange}
          onAssistantRedirectUriChange={setAssistantRedirectUri}
          onSave={() => {
            void handleSaveAssistant()
          }}
          onAuthorize={() => {
            void handleAuthorizeAssistant()
          }}
          onRefreshToken={() => {
            void handleRefreshAssistantToken()
          }}
          onClear={() => {
            void handleClearAssistant()
          }}
          onRefresh={() => {
            void loadData(false)
          }}
          onOpenDocsWorkspace={() => handleOpenDocsWorkspace("smart-assistant")}
        />
      ),
    },
  ]), [
    activeWorkspaceId,
    authorizing,
    baseUrl,
    botState,
    canOpenDocsWorkspace,
    clearingBot,
    clearingAssistant,
    clearingPersonal,
    assistantAppId,
    assistantAppSecret,
    assistantRedirectUri,
    handleAuthorizeAssistant,
    handleClearBot,
    handleClearAssistant,
    handleClearPersonal,
    handleAssistantAppIdChange,
    handleAssistantAppSecretChange,
    handleOpenDocsWorkspace,
    handlePersonalUrlChange,
    handleRefreshAssistantToken,
    handleSaveBot,
    handleSaveAssistant,
    handleSavePersonal,
    loadData,
    loadError,
    loading,
    personalUrl,
    props.t,
    refreshingToken,
    savingBot,
    savingAssistant,
    savingPersonal,
    state,
    workspaces,
  ])
  const activeSection =
    pageSections.find((item) => item.key === pageView) ?? pageSections[0]

  if (!baseUrl) {
    return (
      <div className="feishu-page">
        <Card className="panel-card feishu-page-empty-card" bordered>
          <Empty description="飞书模块未就绪" />
        </Card>
      </div>
    )
  }

  if (pageView === "personal-docs-workspace") {
    const docsWorkspaceId = activeWorkspaceId.trim()
    return (
      <div className="feishu-page">
        <FeishuDocsWorkbench
          key={docsWorkspaceId || "feishu-personal-docs-global"}
          baseUrl={baseUrl}
          workspaceId={docsWorkspaceId}
          state={state}
          loading={loading}
          loadError={loadError}
          t={props.t}
          initialDocId={docsUiState.activeDocId}
          initialTreeRootDocId={docsUiState.treeRootDocId}
          onReloadState={() => {
            void loadData(true)
          }}
          onBackToSettings={() => {
            setPageView(docsWorkspaceReturnView)
          }}
          onUiStateChange={handleDocsUiStateChange}
        />
      </div>
    )
  }

  return (
    <div className="feishu-page">
      <div className="feishu-page-surface">
        <Tabs
          activeKey={activeSection.key}
          destroyOnHidden={false}
          className="feishu-page-tabs"
          items={pageSections.map((item) => ({
            key: item.key,
            label: item.label,
            children: (
              <div className="feishu-page-content-inner">
                {item.content}
              </div>
            ),
          }))}
          onChange={(value) => {
            setPageView(value as FeishuPageTabKey)
          }}
        />
      </div>
    </div>
  )
}
