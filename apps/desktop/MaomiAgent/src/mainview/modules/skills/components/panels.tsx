import {
  CopyOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Input,
  Select,
  Space,
  Typography,
  type TableColumnsType,
  type TableProps,
} from "antd";
import type { Key } from "react";
import type { Translate } from "../../../i18n";
import type {
  DesktopDiscoveredSkillItem,
  DesktopSkillEffectiveRow,
  DesktopSkillItem,
  DesktopSkillsMarketItem,
  DesktopSkillsMarketProvider,
  DesktopSkillsMarketProviderId,
} from "../../../../shared/desktop-skills";
import { AppTableCard } from "../../../components/shared/AppTableCard";
import {
  buildMetric,
  marketProviderLabel,
  rowKeyForDiscovery,
  rowKeyForMarket,
  type SourceSummary,
} from "./helpers";

const { Text } = Typography;

export function ManagedSkillsPanel(props: {
  t: Translate;
  columns: TableColumnsType<DesktopSkillItem>;
  items: DesktopSkillItem[];
  loading: boolean;
  searchText: string;
  enabledFilter: "all" | "true" | "false";
  onSearchTextChange: (value: string) => void;
  onSearch: () => void;
  onEnabledFilterChange: (value: "all" | "true" | "false") => void;
  onRefresh: () => void;
}) {
  return (
    <AppTableCard
      className="skills-page-table-card"
      rowKey="skillId"
      columns={props.columns}
      items={props.items}
      loading={props.loading}
      loadingText={props.t("技能页.提示.加载中")}
      emptyDescription={props.t("技能页.空状态.受管")}
      scrollX={1240}
      toolbar={(
        <div className="skills-page-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={props.searchText}
            className="skills-page-search"
            placeholder={props.t("技能页.输入.搜索占位.受管")}
            onChange={(event) => props.onSearchTextChange(event.target.value)}
            onPressEnter={props.onSearch}
          />
          <Select
            value={props.enabledFilter}
            className="skills-page-select"
            options={[
              { value: "all", label: props.t("技能页.筛选.状态.全部") },
              { value: "true", label: props.t("技能页.筛选.状态.启用") },
              { value: "false", label: props.t("技能页.筛选.状态.停用") },
            ]}
            onChange={props.onEnabledFilterChange}
          />
          <Button icon={<ReloadOutlined />} loading={props.loading} onClick={props.onRefresh}>
            {props.t("技能页.按钮.刷新")}
          </Button>
        </div>
      )}
    />
  );
}

export function DiscoveryPanel(props: {
  t: Translate;
  columns: TableColumnsType<DesktopDiscoveredSkillItem>;
  items: DesktopDiscoveredSkillItem[];
  loading: boolean;
  searchText: string;
  batchCopying?: boolean;
  selectedSource: string;
  sourceSummaries: SourceSummary[];
  selectedKeys: string[];
  onSearchTextChange: (value: string) => void;
  onSearch: () => void;
  onSelectedSourceChange: (value: string) => void;
  onRefresh: () => void;
  onBatchAdopt: () => void;
  onSelectedKeysChange: (keys: string[]) => void;
}) {
  const totalManagedCount = props.sourceSummaries.reduce((count, item) => count + item.managedCount, 0);
  const totalCount = props.sourceSummaries.reduce((count, item) => count + item.count, 0);

  return (
    <div className="skills-page-panel skills-page-panel-discovery">
      <Card
        bordered
        className="skills-page-source-card"
        title={props.t("技能页.发现.来源目录", { 总数: props.sourceSummaries.length })}
      >
        <div className="skills-page-source-list">
          {props.sourceSummaries.length > 0 ? (
            props.sourceSummaries.map((item) => (
              <button
                key={item.source}
                type="button"
                className={`skills-source-item${props.selectedSource === item.source ? " is-active" : ""}`}
                data-selected={props.selectedSource === item.source ? "true" : "false"}
                onClick={() => props.onSelectedSourceChange(item.source)}
              >
                <span className="skills-source-item-head">
                  <span className="skills-source-item-label" title={item.label}>
                    {item.label}
                  </span>
                  <span className="skills-source-item-count">{item.count}</span>
                </span>
                <span className="skills-source-item-meta">
                  <Text type="secondary">
                    {props.t("技能页.发现.来源统计", { 已接入数: item.managedCount, 总数: item.count })}
                  </Text>
                </span>
                <span className="skills-source-item-path" title={item.existingPaths[0] || item.source}>
                  {item.existingPaths[0] || item.source}
                </span>
              </button>
            ))
          ) : (
            <div className="skills-page-source-empty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.t("技能页.空状态.来源")} />
            </div>
          )}
        </div>
        {props.sourceSummaries.length > 0 ? (
          <div className="skills-page-source-footer">
            <Text type="secondary">
              {props.t("技能页.发现.来源统计", { 已接入数: totalManagedCount, 总数: totalCount })}
            </Text>
          </div>
        ) : null}
      </Card>

      <AppTableCard
        className="skills-page-table-card skills-page-table-card-discovery"
        rowKey={rowKeyForDiscovery}
        columns={props.columns}
        items={props.items}
        loading={props.loading}
        loadingText={props.t("技能页.提示.加载中")}
        emptyDescription={props.t("技能页.空状态.发现")}
        scrollX={1240}
        toolbar={(
          <div className="skills-page-toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={props.searchText}
              className="skills-page-search"
              placeholder={props.t("技能页.输入.搜索占位.发现")}
              onChange={(event) => props.onSearchTextChange(event.target.value)}
              onPressEnter={props.onSearch}
            />
            <Button icon={<ReloadOutlined />} loading={props.loading} onClick={props.onRefresh}>
              {props.t("技能页.按钮.刷新")}
            </Button>
            <Button
              type="primary"
              icon={<CopyOutlined />}
              loading={props.batchCopying}
              disabled={props.selectedKeys.length === 0}
              onClick={props.onBatchAdopt}
            >
              {props.t("技能页.按钮.批量复制")}
            </Button>
          </div>
        )}
        tableProps={{
          rowSelection: {
            columnWidth: 40,
            type: "checkbox",
            selectedRowKeys: props.selectedKeys,
            onChange: (keys: Key[]) => props.onSelectedKeysChange(keys.map((key) => String(key))),
            preserveSelectedRowKeys: false,
          } satisfies NonNullable<TableProps<DesktopDiscoveredSkillItem>["rowSelection"]>,
        }}
      />
    </div>
  );
}

export function MarketPanel(props: {
  t: Translate;
  columns: TableColumnsType<DesktopSkillsMarketItem>;
  items: DesktopSkillsMarketItem[];
  loading: boolean;
  searchText: string;
  provider: DesktopSkillsMarketProviderId;
  providers: DesktopSkillsMarketProvider[];
  onSearchTextChange: (value: string) => void;
  onProviderChange: (value: DesktopSkillsMarketProviderId) => void;
  onSearch: () => void;
}) {
  return (
    <AppTableCard
      className="skills-page-table-card"
      rowKey={rowKeyForMarket}
      columns={props.columns}
      items={props.items}
      loading={props.loading}
      loadingText={props.t("技能页.提示.加载中")}
      emptyDescription={props.t("技能页.空状态.市场")}
      scrollX={1240}
      toolbar={(
        <div className="skills-page-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={props.searchText}
            className="skills-page-search"
            placeholder={props.t("技能页.输入.搜索占位.市场")}
            onChange={(event) => props.onSearchTextChange(event.target.value)}
            onPressEnter={props.onSearch}
          />
          <Select
            value={props.provider}
            className="skills-page-select"
            options={props.providers.map((item) => ({
              value: item.id,
              label: marketProviderLabel(props.t, item.id, item.label),
            }))}
            onChange={props.onProviderChange}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            disabled={props.searchText.trim().length === 0}
            onClick={props.onSearch}
          >
            {props.t("技能页.按钮.市场搜索")}
          </Button>
        </div>
      )}
    />
  );
}

export function EffectivePanel(props: {
  t: Translate;
  columns: TableColumnsType<DesktopSkillEffectiveRow>;
  items: DesktopSkillEffectiveRow[];
  loading: boolean;
  searchText: string;
  decisionFilter: string;
  decisionOptions: Array<{ label: string; value: string }>;
  pathCount: number;
  onSearchTextChange: (value: string) => void;
  onSearch: () => void;
  onDecisionFilterChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <AppTableCard
      className="skills-page-table-card"
      rowKey="effectiveId"
      columns={props.columns}
      items={props.items}
      loading={props.loading}
      loadingText={props.t("技能页.提示.加载中")}
      emptyDescription={props.t("技能页.生效.空状态")}
      scrollX={1240}
      toolbar={(
        <div className="skills-page-toolbar skills-page-toolbar-wrap">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={props.searchText}
            className="skills-page-search"
            placeholder={props.t("技能页.输入.搜索占位.受管")}
            onChange={(event) => props.onSearchTextChange(event.target.value)}
            onPressEnter={props.onSearch}
          />
          <Select
            value={props.decisionFilter}
            className="skills-page-select"
            options={props.decisionOptions}
            onChange={props.onDecisionFilterChange}
          />
          <Button icon={<ReloadOutlined />} loading={props.loading} onClick={props.onRefresh}>
            {props.t("技能页.按钮.刷新")}
          </Button>
          <Space size={12} wrap className="skills-page-metrics">
            {buildMetric(props.t("技能页.生效.指标.注入路径"), props.pathCount)}
            {buildMetric(props.t("技能页.生效.指标.决策总数"), props.items.length)}
          </Space>
        </div>
      )}
    />
  );
}

export function SkillsBridgeUnavailableState(props: { t: Translate }) {
  return (
    <div className="skills-page-empty-state">
      <Text type="secondary">{props.t("技能页.提示.桌面桥接不可用")}</Text>
    </div>
  );
}