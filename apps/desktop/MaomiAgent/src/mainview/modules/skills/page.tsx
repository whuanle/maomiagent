import {
  App as AntdApp,
  Form,
  Modal,
  Space,
  Switch,
  Tabs,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DesktopDiscoveredSkillItem,
  DesktopSkillItem,
  DesktopSkillsMarketItem,
  DesktopSkillsMarketProvider,
  DesktopSkillsMarketProviderId,
} from "../../../shared/desktop-skills";
import {
  adoptDesktopSkill,
  DESKTOP_SKILLS_BRIDGE_READY_EVENT,
  DESKTOP_SKILLS_INVALIDATED_EVENT,
  discoverDesktopSkills,
  hasDesktopSkillsBridge,
  installDesktopSkillMarket,
  listDesktopSkills,
  listDesktopSkillsMarketProviders,
  patchDesktopSkill,
  removeDesktopSkill,
  searchDesktopSkillsMarket,
  setDesktopSkillEnabled,
} from "../../lib/desktop-skills";
import {
  DiscoveryPanel,
  ManagedSkillsPanel,
  MarketPanel,
  SkillsBridgeUnavailableState,
} from "./components/panels";
import { SkillEditorModal } from "./components/skill-editor-modal";
import {
  buildTabLabel,
  initialSkillFormValues,
  normalizeError,
  rowKeyForDiscovery,
  toSkillPayload,
  type SourceSummary,
  type SkillFormValues,
} from "./components/helpers";
import {
  createDiscoveryColumns,
  createManagedActionCell,
  createManagedColumns,
  createMarketColumns,
} from "./components/table-columns";
import type { SkillsPageProps } from "./types";
import "./page.css";

const { Text } = Typography;

type TabKey = "managed" | "discovery" | "market";
type SkillsEnabledFilter = "all" | "true" | "false";

const defaultMarketProviders: DesktopSkillsMarketProvider[] = [
  { id: "all", label: "all" },
  { id: "skills.sh", label: "skills.sh" },
  { id: "npm", label: "npm" },
  { id: "github", label: "GitHub" },
];

export function SkillsPage(props: SkillsPageProps) {
  const { message } = AntdApp.useApp();
  const [modal, modalContextHolder] = Modal.useModal();
  const [form] = Form.useForm<SkillFormValues>();
  const [bridgeAvailable, setBridgeAvailable] = useState(() => hasDesktopSkillsBridge());

  const [activeTab, setActiveTab] = useState<TabKey>("discovery");
  const [managedItems, setManagedItems] = useState<DesktopSkillItem[]>([]);
  const [managedLoading, setManagedLoading] = useState(false);
  const [managedSearchText, setManagedSearchText] = useState("");
  const [managedFilter, setManagedFilter] = useState<SkillsEnabledFilter>("all");

  const [discoveryItems, setDiscoveryItems] = useState<DesktopDiscoveredSkillItem[]>([]);
  const [discoverySources, setDiscoverySources] = useState<Array<{
    source: string;
    label: string;
    strategy: string;
    candidatePaths: string[];
    existingPaths: string[];
    itemsCount: number;
  }>>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoverySearchText, setDiscoverySearchText] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedDiscoveryKeys, setSelectedDiscoveryKeys] = useState<string[]>([]);
  const [batchCopying, setBatchCopying] = useState(false);

  const [marketItems, setMarketItems] = useState<DesktopSkillsMarketItem[]>([]);
  const [marketProviders, setMarketProviders] = useState<DesktopSkillsMarketProvider[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketSearchText, setMarketSearchText] = useState("");
  const [marketProvider, setMarketProvider] = useState<DesktopSkillsMarketProviderId>("skills.sh");

  const [copyingDiscoveryKey, setCopyingDiscoveryKey] = useState<string | null>(null);
  const [installingMarketRef, setInstallingMarketRef] = useState<string | null>(null);
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null);
  const [togglingSkillId, setTogglingSkillId] = useState<string | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<DesktopSkillItem | null>(null);
  const mutationRefreshTimerRef = useRef<number | null>(null);

  const syncSkillForm = useCallback((item: DesktopSkillItem | null) => {
    if (!item) {
      form.setFieldsValue(initialSkillFormValues);
      return;
    }

    form.setFieldsValue({
      skillId: item.skillId,
      name: item.name || "",
      label: item.label || "",
      enabled: item.enabled,
      sourcePath: item.sourcePath || "",
      tagsText: item.tags?.join(", ") || "",
      description: item.description || "",
    });
  }, [form]);

  useEffect(() => {
    const syncBridgeAvailability = () => {
      const nextAvailable = hasDesktopSkillsBridge();
      setBridgeAvailable(nextAvailable);
      if (!nextAvailable) {
        setManagedItems([]);
        setDiscoveryItems([]);
        setDiscoverySources([]);
        setMarketItems([]);
        setMarketProviders([]);
      }
    };

    syncBridgeAvailability();
    window.addEventListener(DESKTOP_SKILLS_BRIDGE_READY_EVENT, syncBridgeAvailability);
    return () => {
      window.removeEventListener(DESKTOP_SKILLS_BRIDGE_READY_EVENT, syncBridgeAvailability);
    };
  }, []);

  const sourceSummaries = useMemo<SourceSummary[]>(() => {
    const summaryMap = new Map<string, SourceSummary>();

    for (const source of discoverySources) {
      summaryMap.set(source.source, {
        source: source.source,
        label: source.label,
        strategy: source.strategy,
        candidatePaths: source.candidatePaths,
        existingPaths: source.existingPaths,
        count: 0,
        managedCount: 0,
      });
    }

    for (const item of discoveryItems) {
      const current = summaryMap.get(item.source) ?? {
        source: item.source,
        label: item.source,
        strategy: "",
        candidatePaths: [],
        existingPaths: [],
        count: 0,
        managedCount: 0,
      };

      current.count += 1;
      if (item.managed) {
        current.managedCount += 1;
      }

      summaryMap.set(item.source, current);
    }

    return [...summaryMap.values()]
      .filter((item) => item.count > 0)
      .sort((left, right) => left.label.localeCompare(right.label, "en", { sensitivity: "base" }));
  }, [discoveryItems, discoverySources]);

  const selectedSourceItems = useMemo(() => {
    if (!selectedSource) {
      return [];
    }
    return discoveryItems.filter((item) => item.source === selectedSource);
  }, [discoveryItems, selectedSource]);

  const providerOptions = marketProviders.length > 0 ? marketProviders : defaultMarketProviders;

  const loadManaged = useCallback(async (overrides?: {
    searchText?: string;
    enabledFilter?: SkillsEnabledFilter;
  }) => {
    if (!props.active || !bridgeAvailable) {
      return;
    }
    try {
      setManagedLoading(true);
      const searchText = (overrides?.searchText ?? managedSearchText).trim() || undefined;
      const enabledFilter = overrides?.enabledFilter ?? managedFilter;
      const response = await listDesktopSkills({
        q: searchText,
        enabled:
          enabledFilter === "all" ? undefined : enabledFilter === "true",
        limit: 1000,
        offset: 0,
      });
      setManagedItems(response.items);
    } catch (error) {
      message.error(props.t("技能页.反馈.加载失败.受管", { 错误: normalizeError(error) }));
    } finally {
      setManagedLoading(false);
    }
  }, [bridgeAvailable, managedFilter, managedSearchText, message, props.active, props.t]);

  const loadDiscovery = useCallback(async () => {
    if (!props.active || !bridgeAvailable) {
      return;
    }
    try {
      setDiscoveryLoading(true);
      const response = await discoverDesktopSkills({
        q: discoverySearchText.trim() || undefined,
      });
      setDiscoveryItems(response.items);
      setDiscoverySources(response.sources);
    } catch (error) {
      message.error(props.t("技能页.反馈.加载失败.发现", { 错误: normalizeError(error) }));
    } finally {
      setDiscoveryLoading(false);
    }
  }, [bridgeAvailable, discoverySearchText, message, props.active, props.t]);

  const loadMarketProviders = useCallback(async () => {
    if (!props.active || !bridgeAvailable) {
      return;
    }
    try {
      setMarketLoading(true);
      const providers = await listDesktopSkillsMarketProviders();
      setMarketProviders(providers);
      if (!providers.some((item) => item.id === marketProvider)) {
        setMarketProvider(providers.find((item) => item.id === "skills.sh")?.id || providers[0]?.id || "all");
      }
    } catch (error) {
      message.error(props.t("技能页.反馈.加载失败.市场来源", { 错误: normalizeError(error) }));
    } finally {
      setMarketLoading(false);
    }
  }, [bridgeAvailable, marketProvider, message, props.active, props.t]);

  const searchMarketItems = useCallback(async (overrides?: {
    searchText?: string;
    provider?: DesktopSkillsMarketProviderId;
  }) => {
    if (!bridgeAvailable) {
      return;
    }
    const searchText = (overrides?.searchText ?? marketSearchText).trim();
    const provider = overrides?.provider ?? marketProvider;
    if (!searchText) {
      message.info(props.t("技能页.反馈.市场搜索词必填"));
      return;
    }
    try {
      setMarketLoading(true);
      const response = await searchDesktopSkillsMarket({
        q: searchText,
        provider,
        limit: 20,
      });
      setMarketItems(response.items);
      setMarketProviders(response.providers);
    } catch (error) {
      message.error(props.t("技能页.反馈.加载失败.市场检索", { 错误: normalizeError(error) }));
    } finally {
      setMarketLoading(false);
    }
  }, [bridgeAvailable, marketProvider, marketSearchText, message, props.t]);

  useEffect(() => {
    if (!props.active || !bridgeAvailable) {
      return;
    }
    if (activeTab === "managed") {
      void loadManaged();
      return;
    }
    if (activeTab === "discovery") {
      void loadDiscovery();
      return;
    }
    if (activeTab === "market") {
      void loadMarketProviders();
    }
  }, [activeTab, bridgeAvailable, loadDiscovery, loadManaged, loadMarketProviders, props.active]);

  useEffect(() => {
    if (sourceSummaries.length === 0) {
      setSelectedSource("");
      return;
    }

    if (!selectedSource || !sourceSummaries.some((item) => item.source === selectedSource)) {
      setSelectedSource(sourceSummaries[0]?.source ?? "");
    }
  }, [selectedSource, sourceSummaries]);

  useEffect(() => {
    const validKeys = new Set(selectedSourceItems.map((item) => rowKeyForDiscovery(item)));
    setSelectedDiscoveryKeys((previous) => previous.filter((key) => validKeys.has(key)));
  }, [selectedSourceItems]);

  const refreshManagedDiscovery = useCallback(async () => {
    await Promise.all([loadManaged(), loadDiscovery()]);
  }, [loadDiscovery, loadManaged]);

  useEffect(() => {
    if (!props.active || !bridgeAvailable) {
      return undefined;
    }

    const handleInvalidated = () => {
      if (mutationRefreshTimerRef.current !== null) {
        window.clearTimeout(mutationRefreshTimerRef.current);
      }

      mutationRefreshTimerRef.current = window.setTimeout(() => {
        void refreshManagedDiscovery();
      }, 140);
    };

    window.addEventListener(DESKTOP_SKILLS_INVALIDATED_EVENT, handleInvalidated);
    return () => {
      if (mutationRefreshTimerRef.current !== null) {
        window.clearTimeout(mutationRefreshTimerRef.current);
        mutationRefreshTimerRef.current = null;
      }
      window.removeEventListener(DESKTOP_SKILLS_INVALIDATED_EVENT, handleInvalidated);
    };
  }, [bridgeAvailable, props.active, refreshManagedDiscovery]);

  const openEditSkillModal = useCallback((item: DesktopSkillItem) => {
    setEditingSkill(item);
    form.resetFields();
    syncSkillForm(item);
    setEditorOpen(true);
  }, [form, syncSkillForm]);

  const closeSkillModal = useCallback(() => {
    setEditorOpen(false);
    setEditingSkill(null);
    form.resetFields();
    syncSkillForm(null);
  }, [form, syncSkillForm]);

  const saveSkill = useCallback(async () => {
    if (!bridgeAvailable) {
      return;
    }
    try {
      const values = await form.validateFields();
      setSavingSkill(true);
      const payload = toSkillPayload(values);
      if (editingSkill) {
        const updated = await patchDesktopSkill(editingSkill.skillId, payload);
        if (!updated) {
          throw new Error("skill not found");
        }
        setManagedItems((previous) => previous.map((item) => (item.skillId === editingSkill.skillId ? updated : item)));
        message.success(props.t("技能页.反馈.保存成功.编辑"));
      } else {
        const response = await adoptDesktopSkill(payload);
        message.success(response.created ? props.t("技能页.反馈.保存成功.接入") : props.t("技能页.反馈.保存成功.已存在"));
      }
      closeSkillModal();
      await refreshManagedDiscovery();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }
      message.error(props.t("技能页.反馈.保存失败", { 错误: normalizeError(error) }));
    } finally {
      setSavingSkill(false);
    }
  }, [bridgeAvailable, closeSkillModal, editingSkill, form, message, props.t, refreshManagedDiscovery]);

  const toggleManagedSkill = useCallback(async (item: DesktopSkillItem, enabled: boolean) => {
    if (!bridgeAvailable) {
      return;
    }
    try {
      setTogglingSkillId(item.skillId);
      const updated = await setDesktopSkillEnabled(item.skillId, enabled);
      if (!updated) {
        throw new Error("skill not found");
      }
      setManagedItems((previous) => previous.map((row) => (row.skillId === item.skillId ? updated : row)));
      message.success(props.t("技能页.反馈.状态已更新"));
    } catch (error) {
      message.error(props.t("技能页.反馈.状态更新失败", { 错误: normalizeError(error) }));
    } finally {
      setTogglingSkillId(null);
    }
  }, [bridgeAvailable, message, props.t]);

  const removeManagedSkill = useCallback(async (item: DesktopSkillItem) => {
    if (!bridgeAvailable) {
      return;
    }
    const confirmed = await modal.confirm({
      title: props.t("技能页.按钮.删除"),
      content: (
        <Space direction="vertical" size={4}>
          <Text>{props.t("技能页.提示.确认删除")}</Text>
          <Text code>{item.skillId}</Text>
        </Space>
      ),
      okText: props.t("技能页.按钮.删除"),
      cancelText: props.t("技能页.按钮.取消"),
      okButtonProps: { danger: true },
    });
    if (!confirmed) {
      return;
    }
    try {
      setDeletingSkillId(item.skillId);
      await removeDesktopSkill(item.skillId);
      message.success(props.t("技能页.反馈.删除成功"));
      await refreshManagedDiscovery();
    } catch (error) {
      message.error(props.t("技能页.反馈.删除失败", { 错误: normalizeError(error) }));
    } finally {
      setDeletingSkillId(null);
    }
  }, [bridgeAvailable, message, modal, props.t, refreshManagedDiscovery]);

  const adoptDiscoveredSkill = useCallback(async (item: DesktopDiscoveredSkillItem) => {
    if (!bridgeAvailable) {
      return;
    }
    const rowKey = rowKeyForDiscovery(item);
    try {
      setCopyingDiscoveryKey(rowKey);
      const response = await adoptDesktopSkill({
        skillId: item.skillId,
        sourcePath: item.sourcePath,
        scope: "global",
        enabled: true,
      });
      message.success(response.created ? props.t("技能页.反馈.复制成功") : props.t("技能页.反馈.复制刷新成功"));
      await refreshManagedDiscovery();
    } catch (error) {
      message.error(props.t("技能页.反馈.复制失败", { 错误: normalizeError(error) }));
    } finally {
      setCopyingDiscoveryKey(null);
    }
  }, [bridgeAvailable, message, props.t, refreshManagedDiscovery]);

  const batchAdoptDiscovery = useCallback(async () => {
    if (!bridgeAvailable) {
      return;
    }

    if (selectedDiscoveryKeys.length === 0) {
      message.info(props.t("技能页.反馈.请先选择技能"));
      return;
    }

    const targets = selectedSourceItems.filter((item) => selectedDiscoveryKeys.includes(rowKeyForDiscovery(item)));
    if (targets.length === 0) {
      message.info(props.t("技能页.反馈.没有可复制技能"));
      return;
    }

    try {
      setBatchCopying(true);
      const results = await Promise.allSettled(
        targets.map((item) => adoptDesktopSkill({
          skillId: item.skillId,
          sourcePath: item.sourcePath,
          scope: "global",
          enabled: true,
        })),
      );
      const successCount = results.filter((entry) => entry.status === "fulfilled").length;
      const failedCount = targets.length - successCount;
      if (failedCount > 0) {
        message.warning(props.t("技能页.反馈.批量复制部分失败", { 成功数: successCount, 失败数: failedCount }));
      } else {
        message.success(props.t("技能页.反馈.批量复制成功", { 成功数: successCount }));
      }
      await refreshManagedDiscovery();
    } finally {
      setBatchCopying(false);
    }
  }, [bridgeAvailable, message, props.t, refreshManagedDiscovery, selectedDiscoveryKeys, selectedSourceItems]);

  const installFromMarket = useCallback(async (item: DesktopSkillsMarketItem) => {
    if (!bridgeAvailable) {
      return;
    }
    try {
      setInstallingMarketRef(item.installRef);
      const result = await installDesktopSkillMarket({
        provider: item.provider,
        installRef: item.installRef,
      });
      message.success(result.created ? props.t("技能页.反馈.市场安装成功") : props.t("技能页.反馈.市场安装已存在"));
      await refreshManagedDiscovery();
    } catch (error) {
      message.error(props.t("技能页.反馈.市场安装失败", { 错误: normalizeError(error) }));
    } finally {
      setInstallingMarketRef(null);
    }
  }, [bridgeAvailable, message, props.t, refreshManagedDiscovery]);

  const managedStatusCell = useCallback((row: DesktopSkillItem) => (
    <div className="skills-page-status-cell">
      <Switch
        size="small"
        checked={row.enabled}
        disabled={togglingSkillId === row.skillId}
        onChange={(checked) => {
          void toggleManagedSkill(row, checked);
        }}
        onClick={(_checked, event) => event?.stopPropagation()}
      />
    </div>
  ), [toggleManagedSkill, togglingSkillId]);

  const managedActionCell = useMemo(
    () => createManagedActionCell({
      t: props.t,
      deletingSkillId,
      onEdit: openEditSkillModal,
      onDelete: (row) => {
        void removeManagedSkill(row);
      },
    }),
    [deletingSkillId, openEditSkillModal, props.t, removeManagedSkill],
  );

  const managedColumns = useMemo(
    () => createManagedColumns({ t: props.t, renderStatus: managedStatusCell, renderActions: managedActionCell }),
    [managedActionCell, managedStatusCell, props.t],
  );

  const discoveryColumns = useMemo(
    () => createDiscoveryColumns({ t: props.t, copyingKey: copyingDiscoveryKey, onAdopt: (row) => void adoptDiscoveredSkill(row) }),
    [adoptDiscoveredSkill, copyingDiscoveryKey, props.t],
  );

  const marketColumns = useMemo(
    () => createMarketColumns({ t: props.t, installingRef: installingMarketRef, onInstall: (row) => void installFromMarket(row) }),
    [installFromMarket, installingMarketRef, props.t],
  );

  return (
    <div className="skills-page">
      {modalContextHolder}
      <div className="skills-page-main">
        {bridgeAvailable ? (
          <Tabs
            className="skills-page-tabs"
            activeKey={activeTab}
            destroyOnHidden={false}
            items={[
              {
                key: "managed",
                label: buildTabLabel(props.t("技能页.页签.受管技能"), managedItems.length),
                children: (
                  <ManagedSkillsPanel
                    t={props.t}
                    columns={managedColumns}
                    items={managedItems}
                    loading={managedLoading}
                    searchText={managedSearchText}
                    enabledFilter={managedFilter}
                    onSearchTextChange={setManagedSearchText}
                    onSearch={() => void loadManaged()}
                    onEnabledFilterChange={(value) => {
                      setManagedFilter(value);
                      void loadManaged({ enabledFilter: value });
                    }}
                    onRefresh={() => void loadManaged()}
                  />
                ),
              },
              {
                key: "discovery",
                label: buildTabLabel(props.t("技能页.页签.目录发现"), discoveryItems.length),
                children: (
                  <DiscoveryPanel
                    t={props.t}
                    columns={discoveryColumns}
                    items={selectedSourceItems}
                    loading={discoveryLoading}
                    searchText={discoverySearchText}
                    batchCopying={batchCopying}
                    selectedSource={selectedSource}
                    sourceSummaries={sourceSummaries}
                    selectedKeys={selectedDiscoveryKeys}
                    onSearchTextChange={setDiscoverySearchText}
                    onSearch={() => void loadDiscovery()}
                    onSelectedSourceChange={setSelectedSource}
                    onRefresh={() => void loadDiscovery()}
                    onBatchAdopt={() => void batchAdoptDiscovery()}
                    onSelectedKeysChange={setSelectedDiscoveryKeys}
                  />
                ),
              },
              {
                key: "market",
                label: buildTabLabel(props.t("技能页.页签.市场检索"), marketItems.length),
                children: (
                  <MarketPanel
                    t={props.t}
                    columns={marketColumns}
                    items={marketItems}
                    loading={marketLoading}
                    searchText={marketSearchText}
                    provider={marketProvider}
                    providers={providerOptions}
                    onSearchTextChange={setMarketSearchText}
                    onProviderChange={(value) => {
                      setMarketProvider(value);
                      if (marketSearchText.trim()) {
                        void searchMarketItems({
                          searchText: marketSearchText,
                          provider: value,
                        });
                      }
                    }}
                    onSearch={() => void searchMarketItems()}
                  />
                ),
              },
            ]}
            onChange={(key) => setActiveTab(key as TabKey)}
          />
        ) : (
          <SkillsBridgeUnavailableState t={props.t} />
        )}
      </div>
      <SkillEditorModal
        t={props.t}
        open={editorOpen}
        saving={savingSkill}
        editingSkill={editingSkill}
        form={form}
        onCancel={closeSkillModal}
        onSubmit={() => {
          void saveSkill();
        }}
      />
    </div>
  );
}

export default SkillsPage;