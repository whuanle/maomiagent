import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  Select,
  Tabs,
} from "antd";

import type {
  MemoryKind,
  MemoryScopeFilter,
  MemoryStatus,
} from "../../../lib/desktop-memory";
import type { MemoryTranslate } from "../i18n";
import {
  memoryKindOptions,
  memoryStatusOptions,
} from "../helpers";

type Props = {
  activeEntry: "records" | "understand" | "organize";
  scopeFilter: MemoryScopeFilter;
  workspaceIdInput: string;
  workspaceOptions: Array<{ label: string; value: string }>;
  kindFilter: "all" | MemoryKind;
  loading: boolean;
  organizeDays: string;
  queryText: string;
  refreshing: boolean;
  searchLoading: boolean;
  searchQuery: string;
  searchTopK: string;
  statusFilter: "all" | MemoryStatus;
  t: MemoryTranslate;
  onActiveEntryChange: (value: "records" | "understand" | "organize") => void;
  onCreate: () => void;
  onKindFilterChange: (value: "all" | MemoryKind) => void;
  onOrganizeDaysChange: (value: string) => void;
  onQueryTextChange: (value: string) => void;
  onRefresh: () => void;
  onRunOrganize: () => void;
  onRunSearch: () => void;
  onSearchQueryChange: (value: string) => void;
  onSearchTopKChange: (value: string) => void;
  onScopeFilterChange: (value: MemoryScopeFilter) => void;
  onStatusFilterChange: (value: "all" | MemoryStatus) => void;
  onWorkspaceIdInputChange: (value: string) => void;
};

export function MemoryToolbar(props: Props) {
  const {
    activeEntry,
    scopeFilter,
    workspaceIdInput,
    workspaceOptions,
    kindFilter,
    loading,
    organizeDays,
    queryText,
    refreshing,
    searchLoading,
    searchQuery,
    searchTopK,
    statusFilter,
    t,
    onActiveEntryChange,
    onCreate,
    onKindFilterChange,
    onOrganizeDaysChange,
    onQueryTextChange,
    onRefresh,
    onRunOrganize,
    onRunSearch,
    onSearchQueryChange,
    onSearchTopKChange,
    onScopeFilterChange,
    onStatusFilterChange,
    onWorkspaceIdInputChange,
  } = props;

  return (
    <div className="memory-page-toolbar">
      <Tabs
        className="memory-page-entry-tabs"
        activeKey={activeEntry}
        items={[
          { key: "records", label: t("记忆页.入口.记录列表") },
          { key: "understand", label: t("记忆页.更多工具.理解记忆") },
          { key: "organize", label: t("记忆页.更多工具.整理记忆") },
        ]}
        onChange={(value) => onActiveEntryChange(value as "records" | "understand" | "organize")}
      />

      <div className="memory-page-toolbar-controls">
        <Select
          className="memory-page-mode-select"
          value={scopeFilter}
          options={[
            { label: t("记忆页.筛选.scope.全部"), value: "all" },
            { label: t("记忆页.筛选.scope.全局"), value: "global" },
            { label: t("记忆页.筛选.scope.工作区"), value: "workspace" },
          ]}
          onChange={(value) => onScopeFilterChange(value as MemoryScopeFilter)}
        />

        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          disabled={scopeFilter !== "workspace" || workspaceOptions.length === 0}
          className="memory-page-workspace-select"
          value={workspaceIdInput || undefined}
          options={workspaceOptions}
          placeholder={t("记忆页.输入.workspaceId占位")}
          onChange={(value) => onWorkspaceIdInputChange(typeof value === "string" ? value : "")}
        />

        {activeEntry === "records" ? (
          <>
            <Input
              allowClear
              autoComplete="off"
              prefix={<SearchOutlined aria-hidden="true" />}
              className="memory-page-search"
              value={queryText}
              placeholder={t("记忆页.输入.搜索占位")}
              onChange={(event) => onQueryTextChange(event.target.value)}
            />

            <Select
              className="memory-page-filter"
              value={kindFilter}
              options={[
                { label: t("记忆页.筛选.kind.全部"), value: "all" },
                ...memoryKindOptions,
              ]}
              onChange={(value) => onKindFilterChange(value as "all" | MemoryKind)}
            />

            <Select
              className="memory-page-filter"
              value={statusFilter}
              options={[
                { label: t("记忆页.筛选.status.全部"), value: "all" },
                ...memoryStatusOptions,
              ]}
              onChange={(value) => onStatusFilterChange(value as "all" | MemoryStatus)}
            />

            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading || refreshing}
              onClick={onRefresh}
            >
              {t("记忆页.按钮.刷新")}
            </Button>

            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={onCreate}>
              {t("记忆页.按钮.手动添加")}
            </Button>
          </>
        ) : null}

        {activeEntry === "understand" ? (
          <>
            <Input
              allowClear
              autoComplete="off"
              prefix={<SearchOutlined aria-hidden="true" />}
              className="memory-page-search"
              value={searchQuery}
              placeholder={t("记忆页.更多工具.理解记忆.输入占位")}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />

            <Input
              className="memory-page-compact-input"
              value={searchTopK}
              onChange={(event) => onSearchTopKChange(event.target.value)}
            />

            <Button type="primary" loading={searchLoading} onClick={onRunSearch}>
              {t("记忆页.更多工具.理解记忆.按钮")}
            </Button>
          </>
        ) : null}

        {activeEntry === "organize" ? (
          <>
            <Input
              className="memory-page-compact-input"
              value={organizeDays}
              placeholder={t("记忆页.维护.字段.olderThanDays")}
              onChange={(event) => onOrganizeDaysChange(event.target.value)}
            />

            <Button type="primary" loading={loading} onClick={onRunOrganize}>
              {t("记忆页.更多工具.整理记忆.按钮")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}