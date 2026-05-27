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
  clearFeishuSmartAssistantConfig,
  fetchFeishuBotState,
  fetchFeishuState,
  refreshFeishuDeveloperToken,
  saveFeishuBotConfig,
  saveFeishuDeveloperConfig,
  subscribeFeishuMutations,
} from "../../lib/feishu"
import { reserveFeishuAuthorizationWindow } from "../../lib/feishu-auth-window"
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
import { FeishuSmartAssistantPanel } from "./components/smart-assistant-panel"
import {
  FEISHU_DOCS_WORKSPACE_UI_KEY,
  getFeishuPageStorageKey,
  isSameDocsUiState,
  mergeFeishuDocsUiStateWithWorkspaceRestore,
  readFeishuPagePersistentState,
  readSavedFeishuActiveWorkspaceId,
  writeFeishuPagePersistentState,
  writeSavedFeishuActiveWorkspaceId,
  type FeishuPageView,
} from "./page-state"
import "./page.css"

type Props = {
  active: boolean
  t: Translate
}

type FeishuPageTabKey = Exclude<FeishuPageView, "docs-workspace">

function readResolvedFeishuPagePersistentState(activeWorkspaceId?: string) {
  const persistedState = readFeishuPagePersistentState(activeWorkspaceId)
  return {
    pageView: persistedState.pageView,
    docs: persistedState.docs,
  }
}

function readInitialFeishuPageState() {
  const activeWorkspaceId = readSavedFeishuActiveWorkspaceId()
  return {
    activeWorkspaceId,
    persistedState: readResolvedFeishuPagePersistentState(activeWorkspaceId),
  }
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
  const initialPageStateRef = useRef<ReturnType<typeof readInitialFeishuPageState> | null>(null)
  if (initialPageStateRef.current === null) {
    initialPageStateRef.current = readInitialFeishuPageState()
  }
  const initialPageState = initialPageStateRef.current

  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialPageState.activeWorkspaceId)
  const [pageView, setPageView] = useState<FeishuPageView>(
    initialPageState.persistedState.pageView,
  )
  const [docsUiState, setDocsUiState] = useState<FeishuDocsWorkbenchUiState>(
    initialPageState.persistedState.docs,
  )
  const [docsWorkspaceReturnView, setDocsWorkspaceReturnView] =
    useState<FeishuPageTabKey>("bot")
  const [docsUiStateReady, setDocsUiStateReady] = useState(false)
  const [hydratedPageStateStorageKey, setHydratedPageStateStorageKey] = useState("")
  const [workspaceContextReady, setWorkspaceContextReady] = useState(Boolean(initialPageState.activeWorkspaceId.trim()))
  const [state, setState] = useState<FeishuStateView | null>(null)
  const [botState, setBotState] = useState<FeishuBotStateView | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [assistantAppId, setAssistantAppId] = useState("")
  const [assistantAppSecret, setAssistantAppSecret] = useState("")
  const [assistantRedirectUri, setAssistantRedirectUri] = useState("")
  const [assistantDraftDirty, setAssistantDraftDirty] = useState(false)
  const [savingAssistant, setSavingAssistant] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [refreshingToken, setRefreshingToken] = useState(false)
  const [clearingAssistant, setClearingAssistant] = useState(false)
  const [savingBot, setSavingBot] = useState(false)
  const [clearingBot, setClearingBot] = useState(false)
  const pageStateStorageKey = getFeishuPageStorageKey(activeWorkspaceId)

  const syncAssistantDraftFromState = useCallback((nextState: FeishuStateView | null) => {
    setAssistantAppId(resolveAssistantAppId(nextState))
    setAssistantAppSecret("")
    setAssistantRedirectUri(resolveAssistantRedirectUri(nextState))
    setAssistantDraftDirty(false)
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
      setWorkspaceContextReady(true)
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

      if (activeWorkspaceResult.status === "fulfilled") {
        const nextActiveWorkspaceId = (
          activeWorkspaceResult.value.item?.workspaceId
          ?? activeWorkspaceResult.value.active?.workspaceId
          ?? ""
        ).trim()
        if (nextActiveWorkspaceId) {
          writeSavedFeishuActiveWorkspaceId(nextActiveWorkspaceId)
        }
        setActiveWorkspaceId(nextActiveWorkspaceId)
      }
      setWorkspaceContextReady(true)

      if (stateResult.status === "rejected") {
        throw stateResult.reason
      }
      if (botResult.status === "rejected") {
        throw botResult.reason
      }

      setState(stateResult.value)
      setBotState(botResult.value)
      setWorkspaces(
        workspaceResult.status === "fulfilled"
          ? workspaceResult.value.items
          : [],
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
      syncAssistantDraftFromState(null)
      return
    }

    if (!assistantDraftDirty) {
      syncAssistantDraftFromState(state)
    }
  }, [assistantDraftDirty, state, syncAssistantDraftFromState])

  useEffect(() => {
    const lastRootToken = state?.docsWorkspace?.lastRootToken?.trim() ?? ""
    if (!lastRootToken) {
      return
    }

    setDocsUiState((previous) => {
      if (previous.treeRootDocId.trim() || previous.treeQuery.trim()) {
        return previous
      }

      return {
        ...previous,
        treeQuery: lastRootToken,
        treeRootDocId: lastRootToken,
      }
    })
  }, [state?.docsWorkspace?.lastRootToken])

  useEffect(() => {
    let cancelled = false
    const persistedState = readResolvedFeishuPagePersistentState(activeWorkspaceId)
    const lastRootToken = state?.docsWorkspace?.lastRootToken?.trim() ?? ""
    const persistedDocs = (
      lastRootToken
      && !persistedState.docs.treeRootDocId.trim()
      && !persistedState.docs.treeQuery.trim()
    )
      ? {
          ...persistedState.docs,
          treeQuery: lastRootToken,
          treeRootDocId: lastRootToken,
        }
      : persistedState.docs

    setDocsUiStateReady(false)
    setHydratedPageStateStorageKey("")
    setPageView(persistedState.pageView)
    setDocsUiState(persistedDocs)

    if (!baseUrl) {
      setDocsUiStateReady(true)
      setHydratedPageStateStorageKey(pageStateStorageKey)
      return () => {
        cancelled = true
      }
    }

    if (!activeWorkspaceId.trim()) {
      if (!workspaceContextReady) {
        return () => {
          cancelled = true
        }
      }

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
          persistedDocs,
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
  }, [activeWorkspaceId, baseUrl, pageStateStorageKey, state?.docsWorkspace?.lastRootToken, workspaceContextReady])

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
            treeQuery: docsUiState.treeQuery.trim(),
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

  useEffect(() => {
    if (!props.active || !baseUrl) {
      return
    }

    const timer = window.setInterval(() => {
      void fetchFeishuBotState(baseUrl)
        .then((nextState) => {
          setBotState(nextState)
        })
        .catch(() => undefined)
    }, 3_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [baseUrl, props.active])

  const handleSaveAssistant = useCallback(async (): Promise<FeishuStateView | null> => {
    if (!baseUrl) {
      return null
    }
    if (!assistantAppId.trim()) {
      notifier.error("请先填写飞书智能助手应用 App ID")
      return null
    }
    if (!state?.smartAssistant.hasAppSecret && !assistantAppSecret.trim()) {
      notifier.error("请先填写飞书智能助手应用 App Secret")
      return null
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
      return nextState
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.保存失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
      return null
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

    const hasDraftAppId = assistantAppId.trim().length > 0
    const hasDraftSecret = assistantAppSecret.trim().length > 0
    if (!hasDraftAppId) {
      notifier.error("请先填写飞书智能助手应用 App ID")
      return
    }
    if (!state?.smartAssistant.hasAppSecret && !hasDraftSecret) {
      notifier.error("请先填写飞书智能助手应用 App Secret")
      return
    }

    const authWindow = reserveFeishuAuthorizationWindow()
    if (authWindow.blocked) {
      notifier.warning(props.t("飞书页.反馈.授权页被拦截"))
      return
    }

    try {
      setAuthorizing(true)
      let nextState = state
      if (assistantDraftDirty || hasDraftSecret || assistantAppId.trim() !== (state?.smartAssistant.appId ?? "")) {
        nextState = await handleSaveAssistant()
        if (!nextState) {
          authWindow.close()
          return
        }
      }

      const savedAssistant = nextState?.smartAssistant
      if (!savedAssistant?.appId || !savedAssistant.hasAppSecret) {
        authWindow.close()
        notifier.error("请先保存飞书智能助手配置")
        return
      }

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
  }, [
    assistantAppId,
    assistantAppSecret,
    assistantDraftDirty,
    baseUrl,
    handleSaveAssistant,
    props.t,
    state,
  ])

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

  const handleSaveBot = useCallback(async (input: FeishuBotConfigInput): Promise<FeishuBotStateView | null> => {
    if (!baseUrl) {
      return null
    }
    if (!input.appId.trim()) {
      notifier.error(props.t("飞书页.校验.机器人AppId必填"))
      return null
    }
    if (!botState?.hasAppSecret && !input.appSecret?.trim()) {
      notifier.error(props.t("飞书页.校验.机器人AppSecret必填"))
      return null
    }

    try {
      setSavingBot(true)
      const nextState = await saveFeishuBotConfig(baseUrl, input)
      setBotState(nextState)
      setLoadError("")
      notifier.success(props.t("飞书页.反馈.机器人保存成功"))
      return nextState
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.机器人保存失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
      return null
    } finally {
      setSavingBot(false)
    }
  }, [baseUrl, botState?.hasAppSecret, props.t])

  const handleClearBot = useCallback(async (): Promise<FeishuBotStateView | null> => {
    if (!baseUrl) {
      return null
    }

    try {
      setClearingBot(true)
      const nextState = await clearFeishuBotConfig(baseUrl)
      setBotState(nextState)
      setLoadError("")
      notifier.success(props.t("飞书页.反馈.机器人清除成功"))
      return nextState
    } catch (error) {
      notifier.error(props.t("飞书页.反馈.机器人清除失败", {
        错误: error instanceof Error ? error.message : String(error),
      }))
      return null
    } finally {
      setClearingBot(false)
    }
  }, [baseUrl, props.t])

  const handleOpenDocsWorkspace = useCallback((returnView: FeishuPageTabKey) => {
    const smartAssistantAuthorized =
      state?.smartAssistant.authStatus === "authorized"
      || state?.developer?.authStatus === "authorized"

    if (!smartAssistantAuthorized) {
      notifier.warning("请先完成飞书智能助手授权")
      return
    }

    const docsMcpReady = Boolean(state?.smartAssistant.docsMcp?.mcpId || state?.managedMcp?.mcpId)
    if (!docsMcpReady) {
      notifier.warning("飞书文档工作区未就绪")
      return
    }

    setDocsWorkspaceReturnView(returnView)
    setPageView("docs-workspace")
  }, [
    state?.smartAssistant.authStatus,
    state?.smartAssistant.docsMcp?.mcpId,
    state?.developer?.authStatus,
    state?.managedMcp?.mcpId,
  ])

  const handleDocsUiStateChange = useCallback((nextState: FeishuDocsWorkbenchUiState) => {
    setDocsUiState((previous) => {
      const nextTreeRootDocId = nextState.treeRootDocId.trim()
      const previousTreeRootDocId = previous.treeRootDocId.trim()
      const nextTreeQuery = nextState.treeQuery.trim()
      const previousTreeQuery = previous.treeQuery.trim()
      const mergedState: FeishuDocsWorkbenchUiState = {
        ...nextState,
        treeQuery: nextTreeQuery || (nextTreeRootDocId ? nextState.treeQuery : previousTreeQuery),
        treeRootDocId: nextTreeRootDocId || previousTreeRootDocId,
        treeNodes: nextState.treeNodes ?? previous.treeNodes,
        expandedKeys: nextState.expandedKeys ?? previous.expandedKeys,
      }

      return isSameDocsUiState(previous, mergedState)
        ? previous
        : mergedState
    })
  }, [])

  const canOpenDocsWorkspace = useMemo(() => {
    const smartAssistantAuthorized =
      state?.smartAssistant.authStatus === "authorized"
      || state?.developer?.authStatus === "authorized"
    const docsMcpReady = Boolean(state?.smartAssistant.docsMcp?.mcpId || state?.managedMcp?.mcpId)
    return smartAssistantAuthorized && docsMcpReady
  }, [
    state?.developer?.authStatus,
    state?.managedMcp?.mcpId,
    state?.smartAssistant.docsMcp?.mcpId,
    state?.smartAssistant.authStatus,
  ])
  const pageSections = useMemo(() => ([
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
          onClear={handleClearBot}
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
          assistantDraftDirty={assistantDraftDirty}
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
    assistantAppId,
    assistantAppSecret,
    assistantDraftDirty,
    assistantRedirectUri,
    handleAuthorizeAssistant,
    handleClearBot,
    handleClearAssistant,
    handleAssistantAppIdChange,
    handleAssistantAppSecretChange,
    handleOpenDocsWorkspace,
    handleRefreshAssistantToken,
    handleSaveBot,
    handleSaveAssistant,
    loadData,
    loadError,
    loading,
    props.t,
    refreshingToken,
    savingBot,
    savingAssistant,
    state,
    workspaces,
  ])
  const activeSection =
    pageSections.find((item) => item.key === pageView) ?? pageSections[0]
  const hasRestorableDocsUiState = Boolean(
    docsUiState.activeDocId?.trim()
    || docsUiState.treeQuery.trim()
    || docsUiState.treeRootDocId.trim()
    || docsUiState.treeNodes?.length,
  )

  if (!baseUrl) {
    return (
      <div className="feishu-page">
        <Card className="panel-card feishu-page-empty-card" bordered>
          <Empty description="飞书模块未就绪" />
        </Card>
      </div>
    )
  }

  if (pageView === "docs-workspace") {
    const docsWorkspaceId = activeWorkspaceId.trim()
    if ((!docsUiStateReady && !hasRestorableDocsUiState) || (!docsWorkspaceId && !workspaceContextReady)) {
      return (
        <div className="feishu-page">
          <Card className="panel-card feishu-page-empty-card" bordered>
            <Empty description="正在加载" />
          </Card>
        </div>
      )
    }

    return (
      <div className="feishu-page">
        <FeishuDocsWorkbench
          key={docsWorkspaceId || "feishu-docs-global"}
          active={props.active}
          baseUrl={baseUrl}
          workspaceId={docsWorkspaceId}
          state={state}
          loading={loading}
          loadError={loadError}
          t={props.t}
          initialDocId={docsUiState.activeDocId}
          initialTreeQuery={docsUiState.treeQuery}
          initialTreeRootDocId={docsUiState.treeRootDocId}
          initialTreeNodes={docsUiState.treeNodes}
          initialExpandedKeys={docsUiState.expandedKeys}
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
