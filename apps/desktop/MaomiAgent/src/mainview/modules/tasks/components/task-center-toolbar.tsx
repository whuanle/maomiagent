import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";

import type { TasksTranslate as Translate } from "../i18n";
import type {
  TaskCenterCriticalFilter,
  TaskCenterPageTab,
  TaskCenterSystemFilter,
} from "../task-center-helpers";

type WorkspaceOption = {
  label: string;
  value: string;
};

type Props = {
  activeTab: TaskCenterPageTab;
  criticalFilter: TaskCenterCriticalFilter;
  loading: boolean;
  refreshing: boolean;
  searchText: string;
  systemFilter: TaskCenterSystemFilter;
  t: Translate;
  workspaceFilter?: string;
  workspaceOptions: WorkspaceOption[];
  onCriticalFilterChange: (value: TaskCenterCriticalFilter) => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSystemFilterChange: (value: TaskCenterSystemFilter) => void;
  onWorkspaceFilterChange: (value: string | undefined) => void;
};

export function TaskCenterToolbar(props: Props) {
  return (
    <div className="tasks-page-toolbar">
      <Input
        allowClear
        className="tasks-page-search"
        prefix={<SearchOutlined />}
        placeholder={props.t("任务页.输入.搜索占位")}
        value={props.searchText}
        onChange={(event) => props.onSearchChange(event.target.value)}
      />

      {props.activeTab === "critical" ? (
        <Select
          allowClear
          className="tasks-page-workspace-select"
          value={props.workspaceFilter}
          placeholder={props.t("任务页.筛选.工作区.全部")}
          options={props.workspaceOptions}
          onChange={(value) => props.onWorkspaceFilterChange(value)}
        />
      ) : null}

      {props.activeTab === "critical" ? (
        <Select
          className="tasks-page-status-select"
          value={props.criticalFilter}
          options={[
            { label: props.t("任务页.筛选.状态.全部"), value: "all" },
            { label: props.t("任务页.筛选.状态.进行中"), value: "running" },
            { label: props.t("任务页.筛选.状态.待处理"), value: "attention" },
            { label: props.t("任务页.筛选.状态.失败"), value: "failed" },
          ]}
          onChange={(value) => props.onCriticalFilterChange(value as TaskCenterCriticalFilter)}
        />
      ) : (
        <Select
          className="tasks-page-schedule-select"
          value={props.systemFilter}
          options={[
            { label: props.t("任务页.筛选.调度.全部"), value: "all" },
            { label: props.t("任务页.筛选.调度.生效中"), value: "active" },
            { label: props.t("任务页.筛选.调度.已暂停"), value: "paused" },
          ]}
          onChange={(value) => props.onSystemFilterChange(value as TaskCenterSystemFilter)}
        />
      )}

      <Button
        icon={<ReloadOutlined />}
        loading={props.loading || props.refreshing}
        onClick={props.onRefresh}
      >
        {props.t("任务页.按钮.刷新")}
      </Button>
    </div>
  );
}
