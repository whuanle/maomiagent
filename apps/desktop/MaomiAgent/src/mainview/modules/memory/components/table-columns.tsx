import {
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import {
  Button,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";

import type { MemoryUnit } from "../../../lib/desktop-memory";
import type { MemoryTranslate } from "../i18n";
import {
  formatDateTime,
  formatTokenLabel,
  getMemorySubtitle,
  getMemoryTitle,
} from "../helpers";

type Input = {
  deletingUnitId: string | null;
  t: MemoryTranslate;
  onDelete: (row: MemoryUnit) => void;
  onEdit: (row: MemoryUnit) => void;
  onView?: (row: MemoryUnit) => void;
};

function getStatusClassName(status: MemoryUnit["status"]) {
  return `memory-page-status-tag memory-page-status-${status}`;
}

export function createMemoryColumns(input: Input): TableColumnsType<MemoryUnit> {
  const {
    deletingUnitId,
    t,
    onDelete,
    onEdit,
  } = input;

  return [
    {
      title: t("记忆页.列.内容"),
      dataIndex: "summary",
      key: "content",
      ellipsis: true,
      render: (_value, row) => {
        const subtitle = getMemorySubtitle(row);
        const scopeLabel = row.scope === "global"
          ? t("记忆页.值.scope.全局")
          : t("记忆页.值.scope.工作区");

        return (
          <div className="memory-page-row-main">
            <div className="memory-page-row-head">
              <span className="memory-page-row-title">{getMemoryTitle(row)}</span>
              <Tag bordered={false} className={`memory-page-inline-tag${row.scope === "global" ? " memory-page-inline-tag-global" : ""}`}>
                {scopeLabel}
              </Tag>
            </div>

            {subtitle ? (
              <div className="memory-page-row-copy">{subtitle}</div>
            ) : null}

            <div className="memory-page-row-meta">
              <span>{scopeLabel}</span>
              {row.workspaceId ? <span>{t("记忆页.文案.工作区前缀", { 工作区: row.workspaceId })}</span> : null}
            </div>
          </div>
        );
      },
    },
    {
      title: t("记忆页.列.scope"),
      dataIndex: "scope",
      key: "scope",
      width: 144,
      render: (value: MemoryUnit["scope"]) => (
        <Tag bordered={false} className={`memory-page-inline-tag${value === "global" ? " memory-page-inline-tag-global" : ""}`}>
          {value === "global" ? t("记忆页.值.scope.全局") : t("记忆页.值.scope.工作区")}
        </Tag>
      ),
    },
    {
      title: t("记忆页.列.kind"),
      dataIndex: "kind",
      key: "kind",
      width: 130,
      render: (value: MemoryUnit["kind"]) => (
        <Tag bordered={false} className="memory-page-inline-tag">
          {formatTokenLabel(value)}
        </Tag>
      ),
    },
    {
      title: t("记忆页.列.status"),
      dataIndex: "status",
      key: "status",
      width: 126,
      render: (value: MemoryUnit["status"]) => (
        <Tag bordered={false} className={getStatusClassName(value)}>
          {formatTokenLabel(value)}
        </Tag>
      ),
    },
    {
      title: t("记忆页.列.更新时间"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 188,
      render: (value: string) => (
        <div className="memory-page-date-cell">
          <span>{formatDateTime(value)}</span>
        </div>
      ),
    },
    {
      title: t("记忆页.列.操作"),
      key: "actions",
      width: 96,
      fixed: "right",
      render: (_value, row) => (
        <div className="memory-page-row-actions">
          <Tooltip title={t("记忆页.按钮.编辑")}>
            <Button
              type="text"
              aria-label={t("记忆页.按钮.编辑")}
              icon={<EditOutlined aria-hidden="true" />}
              onClick={(event) => {
                event.stopPropagation();
                onEdit(row);
              }}
            />
          </Tooltip>

          <Tooltip title={t("记忆页.按钮.删除")}>
            <Button
              danger
              type="text"
              aria-label={t("记忆页.按钮.删除")}
              icon={<DeleteOutlined aria-hidden="true" />}
              loading={deletingUnitId === row.unitId}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(row);
              }}
            />
          </Tooltip>
        </div>
      ),
    },
  ];
}
