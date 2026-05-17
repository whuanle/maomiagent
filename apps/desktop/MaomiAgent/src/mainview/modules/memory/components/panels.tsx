import {
  Card,
  Empty,
  Spin,
  Tag,
} from "antd";
import { useMemo } from "react";

import type {
  MemoryRuntimeContext,
  MemorySearchItem,
  MemoryUnit,
} from "../../../lib/desktop-memory";
import { AppTableCard } from "../../../components/shared/AppTableCard";
import type { MemoryTranslate } from "../i18n";
import {
  formatScore,
  formatTokenLabel,
  getMemorySubtitle,
  getMemoryTitle,
} from "../helpers";
import { createMemoryColumns } from "./table-columns";

type MemoryListPanelProps = {
  deletingUnitId: string | null;
  loading: boolean;
  refreshing: boolean;
  selectedUnitId: string;
  emptyDescription: string;
  t: MemoryTranslate;
  units: MemoryUnit[];
  onDelete: (row: MemoryUnit) => void;
  onEdit: (row: MemoryUnit) => void;
  onOpenDetail: (row: MemoryUnit) => void;
};

export function MemoryListPanel(props: MemoryListPanelProps) {
  const {
    deletingUnitId,
    loading,
    refreshing,
    selectedUnitId,
    emptyDescription,
    t,
    units,
    onDelete,
    onEdit,
    onOpenDetail,
  } = props;

  const columns = useMemo(
    () => createMemoryColumns({
      deletingUnitId,
      t,
      onDelete,
      onEdit,
    }),
    [deletingUnitId, onDelete, onEdit, t],
  );

  return (
    <AppTableCard
      className="memory-page-table-card"
      rowKey="unitId"
      columns={columns}
      items={units}
      loading={loading || refreshing}
      loadingText={t("记忆页.提示.加载中")}
      emptyDescription={emptyDescription}
      scrollX={1280}
      tableProps={{
        loading: loading || refreshing,
        className: "memory-page-table",
        rowClassName: (record) => (
          record.unitId === selectedUnitId ? "memory-page-row-active" : ""
        ),
        onRow: (record) => ({
          onClick: () => onOpenDetail(record),
        }),
      }}
    />
  );
}

type MemorySearchPanelProps = {
  runtimeContext: MemoryRuntimeContext;
  runtimeLoading: boolean;
  searchItems: MemorySearchItem[];
  searchLoading: boolean;
  t: MemoryTranslate;
};

export function MemorySearchPanel(props: MemorySearchPanelProps) {
  const {
    runtimeContext,
    runtimeLoading,
    searchItems,
    searchLoading,
    t,
  } = props;

  return (
    <div className="memory-page-single-stack">
      <Card variant="borderless" className="panel-card memory-page-section-card memory-page-single-card">
        <div className="memory-page-section-header">
          <div className="memory-page-section-title">{t("记忆页.更多工具.理解记忆")}</div>
        </div>

        <div className="memory-page-explainer">{t("记忆页.更多工具.理解记忆.说明")}</div>

        <div className="memory-page-runtime-section">
          <div className="memory-page-section-subtitle">{t("记忆页.更多工具.理解记忆.当前相关记忆")}</div>

          <div className="memory-page-scroll-area">
            {runtimeLoading ? (
              <div className="memory-page-loading-state">
                <Spin size="small" />
                <span>{t("记忆页.提示.加载中")}</span>
              </div>
            ) : runtimeContext.items.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("记忆页.空状态.无运行时上下文")}
              />
            ) : (
              <div className="memory-page-list-stack">
                {runtimeContext.items.map((item) => (
                  <div key={item.unitId} className="memory-page-runtime-item">
                    <div className="memory-page-search-item-head">
                      <div className="memory-page-search-item-title">{item.summary}</div>
                      <div className="memory-page-search-item-score">{formatScore(item.score)}</div>
                    </div>

                    <div className="memory-page-chip-row">
                      {item.kind ? (
                        <Tag bordered={false} className="memory-page-inline-tag">
                          {formatTokenLabel(item.kind)}
                        </Tag>
                      ) : null}
                      {item.tier ? (
                        <Tag bordered={false} className="memory-page-inline-tag">
                          {formatTokenLabel(item.tier)}
                        </Tag>
                      ) : null}
                      {item.sourceScope ? (
                        <Tag bordered={false} className="memory-page-inline-tag">
                          {formatTokenLabel(item.sourceScope)}
                        </Tag>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="memory-page-section-subtitle">{t("记忆页.检索.标题")}</div>

        <div className="memory-page-scroll-area">
          {searchLoading ? (
            <div className="memory-page-loading-state">
              <Spin size="small" />
              <span>{t("记忆页.提示.加载中")}</span>
            </div>
          ) : searchItems.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("记忆页.空状态.无检索结果")}
            />
          ) : (
            <div className="memory-page-list-stack">
              {searchItems.map((item) => {
                const subtitle = getMemorySubtitle(item);

                return (
                  <div key={item.unitId} className="memory-page-search-item">
                    <div className="memory-page-search-item-head">
                      <div className="memory-page-search-item-title">{getMemoryTitle(item)}</div>
                      <div className="memory-page-search-item-score">{formatScore(item.score)}</div>
                    </div>

                    {subtitle ? (
                      <div className="memory-page-search-item-copy">{subtitle}</div>
                    ) : null}

                    <div className="memory-page-chip-row">
                      <Tag bordered={false} className="memory-page-inline-tag">
                        {formatTokenLabel(item.sourceScope)}
                      </Tag>
                      <Tag bordered={false} className="memory-page-inline-tag">
                        {formatTokenLabel(item.kind)}
                      </Tag>
                      <Tag bordered={false} className="memory-page-inline-tag">
                        {formatTokenLabel(item.tier)}
                      </Tag>
                    </div>

                    <div className="memory-page-search-item-copy">{item.explain}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

type MemoryMaintenancePanelProps = {
  maintenanceLoading: boolean;
  maintenanceSummary: string;
  t: MemoryTranslate;
};

export function MemoryMaintenancePanel(props: MemoryMaintenancePanelProps) {
  const {
    maintenanceLoading,
    maintenanceSummary,
    t,
  } = props;

  return (
    <div className="memory-page-single-stack">
      <Card variant="borderless" className="panel-card memory-page-section-card memory-page-single-card">
        <div className="memory-page-section-header">
          <div className="memory-page-section-title">{t("记忆页.更多工具.整理记忆")}</div>
        </div>

        <div className="memory-page-explainer">{t("记忆页.更多工具.整理记忆.说明")}</div>

        <div className="memory-page-scroll-area">
          {maintenanceLoading ? (
            <div className="memory-page-loading-state">
              <Spin size="small" />
              <span>{t("记忆页.提示.加载中")}</span>
            </div>
          ) : maintenanceSummary ? (
            <div className="memory-page-summary-box">{maintenanceSummary}</div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("记忆页.更多工具.整理记忆.空状态")}
            />
          )}
        </div>
      </Card>
    </div>
  );
}