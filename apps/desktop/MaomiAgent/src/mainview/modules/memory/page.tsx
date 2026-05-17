import {
  App as AntdApp,
  Card,
  Empty,
  Modal,
} from "antd";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { LanguageCode } from "../../config/titlebar";
import {
  appendMemoryCandidate,
  deleteMemoryUnit,
  DESKTOP_MEMORY_BRIDGE_READY_EVENT,
  fetchMemoryProjection,
  fetchMemoryRuntimeContext,
  hasDesktopMemoryBridge,
  patchMemoryUnit,
  previewMemoryMaintenance,
  searchMemory,
  type MemoryKind,
  type MemoryRuntimeContext,
  type MemoryScopeFilter,
  type MemorySearchItem,
  type MemoryStatus,
  type MemoryUnit,
} from "../../lib/desktop-memory";
import { listDesktopWorkspaces } from "../../lib/desktop-workspace";
import {
  MemoryDetailDrawer,
  MemoryEditorDialog,
  MemoryListPanel,
  MemoryMaintenancePanel,
  MemorySearchPanel,
  MemoryToolbar,
} from "./components";
import {
  createMemoryDraft,
  initialForm,
  normalizeError,
  resolveProjectionWorkspaceId,
  type MemoryEntryKey,
  type MemoryFormValues,
} from "./helpers";
import { createMemoryTranslator } from "./i18n";
import "./page.css";

type Props = {
  language: LanguageCode;
  active: boolean;
};

const EMPTY_RUNTIME_CONTEXT: MemoryRuntimeContext = {
  query: "",
  items: [],
};

type WorkspaceOption = {
  label: string;
  value: string;
};

export function MemoryPage(props: Props) {
  const { message } = AntdApp.useApp();
  const [modal, modalContextHolder] = Modal.useModal();
  const t = useMemo(() => createMemoryTranslator(props.language), [props.language]);

  const [bridgeAvailable, setBridgeAvailable] = useState(() => hasDesktopMemoryBridge());
  const [activeEntry, setActiveEntry] = useState<MemoryEntryKey>("records");
  const [scopeFilter, setScopeFilter] = useState<MemoryScopeFilter>("all");
  const [workspaceIdInput, setWorkspaceIdInput] = useState("");
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);

  const [units, setUnits] = useState<MemoryUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);

  const [queryText, setQueryText] = useState("");
  const deferredQueryText = useDeferredValue(queryText);
  const [kindFilter, setKindFilter] = useState<"all" | MemoryKind>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MemoryStatus>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<MemoryUnit | null>(null);
  const [form, setForm] = useState<MemoryFormValues>(initialForm);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchTopK, setSearchTopK] = useState("10");
  const [searchItems, setSearchItems] = useState<MemorySearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [organizeDays, setOrganizeDays] = useState("30");
  const [maintenanceSummary, setMaintenanceSummary] = useState("");
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [runtimeContext, setRuntimeContext] = useState<MemoryRuntimeContext>(EMPTY_RUNTIME_CONTEXT);
  const [runtimeLoading, setRuntimeLoading] = useState(false);

  const resolvedWorkspaceId = useMemo(
    () => resolveProjectionWorkspaceId(scopeFilter, workspaceIdInput),
    [scopeFilter, workspaceIdInput],
  );

  const clearProjectionState = useCallback(() => {
    setUnits([]);
    setSelectedUnitId("");
    setRuntimeContext(EMPTY_RUNTIME_CONTEXT);
  }, []);

  useEffect(() => {
    const syncBridgeAvailability = () => {
      const nextAvailable = hasDesktopMemoryBridge();
      setBridgeAvailable(nextAvailable);
      if (!nextAvailable) {
        clearProjectionState();
        setWorkspaceOptions([]);
        setSearchItems([]);
        setMaintenanceSummary("");
      }
    };

    syncBridgeAvailability();
    window.addEventListener(DESKTOP_MEMORY_BRIDGE_READY_EVENT, syncBridgeAvailability);
    return () => {
      window.removeEventListener(DESKTOP_MEMORY_BRIDGE_READY_EVENT, syncBridgeAvailability);
    };
  }, [clearProjectionState]);

  const loadWorkspaceOptions = useCallback(async () => {
    if (!bridgeAvailable) {
      setWorkspaceOptions([]);
      return;
    }

    try {
      const response = await listDesktopWorkspaces({ limit: 200, offset: 0 });
      const items = response.items.map((item) => ({
        value: item.workspaceId,
        label: item.name.trim() ? `${item.name} (${item.workspaceId})` : item.workspaceId,
      }));
      setWorkspaceOptions(items);
    } catch (error) {
      message.error(t("记忆页.反馈.加载工作区失败", { 错误: normalizeError(error) }));
    }
  }, [bridgeAvailable, message, t]);

  const loadProjection = useCallback(
    async (silent = false) => {
      if (!bridgeAvailable) {
        clearProjectionState();
        return;
      }

      if (!props.active) {
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setRuntimeLoading(true);

      try {
        const projection = await fetchMemoryProjection(undefined, resolvedWorkspaceId, {
          q: deferredQueryText.trim() || undefined,
          kinds: kindFilter === "all" ? undefined : [kindFilter],
          status: statusFilter === "all" ? undefined : statusFilter,
          scopeFilter,
          unitsLimit: 200,
          unitsOffset: 0,
          traceLimit: 20,
        });

        setUnits(projection.units.items);
        setSelectedUnitId((previous) =>
          previous && projection.units.items.some((item) => item.unitId === previous)
            ? previous
            : (projection.units.items[0]?.unitId ?? ""),
        );
        setRuntimeContext(projection.runtimeContext);
      } catch (error) {
        message.error(t("记忆页.反馈.加载失败", { 错误: normalizeError(error) }));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setRuntimeLoading(false);
      }
    },
    [
      bridgeAvailable,
      clearProjectionState,
      deferredQueryText,
      kindFilter,
      message,
      props.active,
      resolvedWorkspaceId,
      scopeFilter,
      statusFilter,
      t,
    ],
  );

  useEffect(() => {
    if (!props.active) {
      return;
    }

    void loadWorkspaceOptions();
  }, [loadWorkspaceOptions, props.active]);

  useEffect(() => {
    if (!props.active) {
      return;
    }

    void loadProjection(false);
  }, [loadProjection, props.active]);

  useEffect(() => {
    setDetailOpen(false);
    setSearchItems([]);
    setMaintenanceSummary("");
  }, [activeEntry, resolvedWorkspaceId, scopeFilter]);

  useEffect(() => {
    if (detailOpen && !selectedUnitId) {
      setDetailOpen(false);
    }
  }, [detailOpen, selectedUnitId]);

  const selectedUnit = useMemo(
    () => units.find((item) => item.unitId === selectedUnitId) ?? null,
    [selectedUnitId, units],
  );

  const resolveUnitWorkspaceId = useCallback((unit: MemoryUnit) => {
    return unit.scope === "global" ? undefined : unit.workspaceId;
  }, []);

  const saveUnit = useCallback(async () => {
    if (!bridgeAvailable) {
      return;
    }

    if (!form.rawContent.trim()) {
      message.error(t("记忆页.校验.内容必填"));
      return;
    }

    if (form.scope === "workspace" && !form.workspaceId.trim()) {
      message.error(t("记忆页.校验.工作区ID必填"));
      return;
    }

    try {
      setSaving(true);

      if (editingUnit) {
        await patchMemoryUnit(
          undefined,
          resolveUnitWorkspaceId(editingUnit),
          editingUnit.unitId,
          {
            rawContent: form.rawContent.trim(),
            summary: form.summary.trim() || undefined,
            kind: form.kind,
          },
        );
        message.success(t("记忆页.反馈.更新成功"));
      } else {
        const workspaceId = form.scope === "workspace" ? form.workspaceId.trim() : undefined;
        await appendMemoryCandidate(undefined, workspaceId, {
          scope: form.scope,
          workspaceId,
          rawContent: form.rawContent.trim(),
          summary: form.summary.trim() || undefined,
          kind: form.kind,
        });
        message.success(t("记忆页.反馈.创建成功"));
      }

      setModalOpen(false);
      setEditingUnit(null);
      setForm(initialForm);
      await loadProjection(true);
    } catch (error) {
      message.error(t("记忆页.反馈.保存失败", { 错误: normalizeError(error) }));
    } finally {
      setSaving(false);
    }
  }, [
    bridgeAvailable,
    editingUnit,
    form,
    loadProjection,
    message,
    resolveUnitWorkspaceId,
    t,
  ]);

  const handleSearch = useCallback(async () => {
    if (!bridgeAvailable) {
      return;
    }

    if (!searchQuery.trim()) {
      message.error(t("记忆页.校验.检索词必填"));
      return;
    }

    try {
      setSearchLoading(true);
      setRuntimeLoading(true);

      const [result, runtime] = await Promise.all([
        searchMemory(undefined, resolvedWorkspaceId, {
          query: searchQuery.trim(),
          topK: Number(searchTopK) || 10,
          scopeFilter,
        }),
        fetchMemoryRuntimeContext(undefined, resolvedWorkspaceId, searchQuery.trim()),
      ]);

      setSearchItems(result.items);
      setRuntimeContext(runtime);
    } catch (error) {
      message.error(t("记忆页.反馈.检索失败", { 错误: normalizeError(error) }));
    } finally {
      setSearchLoading(false);
      setRuntimeLoading(false);
    }
  }, [
    bridgeAvailable,
    message,
    resolvedWorkspaceId,
    scopeFilter,
    searchQuery,
    searchTopK,
    t,
  ]);

  const handleOrganize = useCallback(async () => {
    if (!bridgeAvailable) {
      return;
    }

    try {
      setMaintenanceLoading(true);
      const olderThanDays = Number(organizeDays) || 30;
      const preview = await previewMemoryMaintenance(undefined, resolvedWorkspaceId, {
        scopeFilter,
        criteria: { olderThanDays },
      });

      setMaintenanceSummary(
        [
          t("记忆页.更多工具.整理记忆.结果.范围", {
            范围: t(
              scopeFilter === "all"
                ? "记忆页.筛选.scope.全部"
                : scopeFilter === "global"
                  ? "记忆页.筛选.scope.全局"
                  : "记忆页.筛选.scope.工作区",
            ),
          }),
          t("记忆页.更多工具.整理记忆.结果.扫描", { 数量: String(preview.summary.scanned) }),
          t("记忆页.更多工具.整理记忆.结果.命中", { 数量: String(preview.summary.selected) }),
          t("记忆页.更多工具.整理记忆.结果.天数", { 天数: String(preview.summary.olderThanDays) }),
        ].join("\n"),
      );
      message.success(t("记忆页.反馈.整理完成"));
    } catch (error) {
      message.error(t("记忆页.反馈.整理失败", { 错误: normalizeError(error) }));
    } finally {
      setMaintenanceLoading(false);
    }
  }, [bridgeAvailable, message, organizeDays, resolvedWorkspaceId, scopeFilter, t]);

  if (!bridgeAvailable) {
    return (
      <div className="memory-page-shell memory-page-shell-empty">
        {modalContextHolder}
        <Card variant="borderless" className="panel-card memory-page-empty-card">
          <Empty description={t("记忆页.提示.请先连接sidecar")} />
        </Card>
      </div>
    );
  }

  return (
    <div className="memory-page-shell">
      {modalContextHolder}

      <MemoryToolbar
        activeEntry={activeEntry}
        scopeFilter={scopeFilter}
        workspaceIdInput={workspaceIdInput}
        workspaceOptions={workspaceOptions}
        kindFilter={kindFilter}
        loading={loading}
        organizeDays={organizeDays}
        queryText={queryText}
        refreshing={refreshing}
        searchLoading={searchLoading}
        searchQuery={searchQuery}
        searchTopK={searchTopK}
        statusFilter={statusFilter}
        t={t}
        onActiveEntryChange={setActiveEntry}
        onCreate={() => {
          setEditingUnit(null);
          setForm(createMemoryDraft(scopeFilter, workspaceIdInput));
          setModalOpen(true);
        }}
        onKindFilterChange={setKindFilter}
        onOrganizeDaysChange={setOrganizeDays}
        onQueryTextChange={setQueryText}
        onRefresh={() => {
          void loadProjection(true);
        }}
        onRunOrganize={() => {
          void handleOrganize();
        }}
        onRunSearch={() => {
          void handleSearch();
        }}
        onSearchQueryChange={setSearchQuery}
        onSearchTopKChange={setSearchTopK}
        onScopeFilterChange={setScopeFilter}
        onStatusFilterChange={setStatusFilter}
        onWorkspaceIdInputChange={setWorkspaceIdInput}
      />

      <div className="memory-page-content">
        {activeEntry === "records" ? (
          <MemoryListPanel
            deletingUnitId={deletingUnitId}
            loading={loading}
            refreshing={refreshing}
            selectedUnitId={detailOpen ? selectedUnitId : ""}
            emptyDescription={t("记忆页.空状态.无记忆")}
            t={t}
            units={units}
            onDelete={(row) => {
              void (async () => {
                const confirmed = await modal.confirm({
                  title: t("记忆页.按钮.删除"),
                  content: t("记忆页.提示.确认删除"),
                  okText: t("记忆页.按钮.删除"),
                  cancelText: t("记忆页.按钮.取消"),
                  okButtonProps: { danger: true },
                });
                if (!confirmed || !bridgeAvailable) {
                  return;
                }

                try {
                  setDeletingUnitId(row.unitId);
                  await deleteMemoryUnit(undefined, resolveUnitWorkspaceId(row), row.unitId);
                  message.success(t("记忆页.反馈.删除成功"));
                  await loadProjection(true);
                } catch (error) {
                  message.error(t("记忆页.反馈.删除失败", { 错误: normalizeError(error) }));
                } finally {
                  setDeletingUnitId(null);
                }
              })();
            }}
            onEdit={(row) => {
              setEditingUnit(row);
              setForm({
                scope: row.scope,
                workspaceId: row.workspaceId ?? "",
                rawContent: row.rawContent,
                summary: row.summary || "",
                kind: row.kind,
              });
              setModalOpen(true);
            }}
            onOpenDetail={(row) => {
              setSelectedUnitId(row.unitId);
              setDetailOpen(true);
            }}
          />
        ) : null}

        {activeEntry === "understand" ? (
          <MemorySearchPanel
            runtimeContext={runtimeContext}
            runtimeLoading={runtimeLoading}
            searchItems={searchItems}
            searchLoading={searchLoading}
            t={t}
          />
        ) : null}

        {activeEntry === "organize" ? (
          <MemoryMaintenancePanel
            maintenanceLoading={maintenanceLoading}
            maintenanceSummary={maintenanceSummary}
            t={t}
          />
        ) : null}
      </div>

      <MemoryDetailDrawer
        open={detailOpen}
        selectedUnit={selectedUnit}
        t={t}
        onClose={() => setDetailOpen(false)}
      />

      <MemoryEditorDialog
        editingUnit={editingUnit}
        form={form}
        modalOpen={modalOpen}
        saving={saving}
        t={t}
        workspaceOptions={workspaceOptions}
        onClose={setModalOpen}
        onFormChange={(updater) => {
          setForm((previous) => updater(previous));
        }}
        onSave={() => {
          void saveUnit();
        }}
      />
    </div>
  );
}

export default MemoryPage;
