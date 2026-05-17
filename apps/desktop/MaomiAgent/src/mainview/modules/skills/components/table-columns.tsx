import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { Button, Space, Tag, Tooltip, Typography, type TableColumnsType } from "antd";
import type { ReactNode } from "react";
import type { Translate } from "../../../i18n";
import type {
  DesktopDiscoveredSkillItem,
  DesktopSkillEffectiveRow,
  DesktopSkillItem,
  DesktopSkillsMarketItem,
  DesktopSkillsMarketProviderId,
} from "../../../../shared/desktop-skills";
import {
  discoveryStateLabel,
  discoveryStateTagColor,
  effectiveDecisionMeta,
  effectiveInclusionMeta,
  formatDateTime,
  managedSkillDisplayName,
  managedStateMeta,
  marketProviderLabel,
  rowKeyForDiscovery,
  skillMarkdownMeta,
} from "./helpers";

const { Link, Text } = Typography;

export function createManagedColumns(input: {
  t: Translate;
  renderStatus: (row: DesktopSkillItem) => ReactNode;
  renderActions: (row: DesktopSkillItem) => ReactNode;
}): TableColumnsType<DesktopSkillItem> {
  return [
    {
      title: input.t("技能页.列.技能"),
      dataIndex: "skillId",
      width: 220,
      render: (_value, row) => (
        <Space direction="vertical" size={2} className="skills-page-stack-cell">
          <Text strong title={managedSkillDisplayName(row)}>{managedSkillDisplayName(row)}</Text>
          <Text type="secondary" title={row.skillId}>{row.skillId}</Text>
        </Space>
      ),
    },
    {
      title: input.t("技能页.字段.描述"),
      key: "summary",
      render: (_value, row) => (
        <Space direction="vertical" size={6} className="skills-page-stack-cell">
          {row.tags?.length ? (
            <Space size={[4, 4]} wrap>
              {row.tags.map((tag) => (
                <Tag key={tag} bordered={false} className="skills-page-inline-tag">{tag}</Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">-</Text>
          )}
          <Text type={row.description ? undefined : "secondary"} className="skills-page-clamp" title={row.description || "-"}>
            {row.description || "-"}
          </Text>
        </Space>
      ),
    },
    {
      title: input.t("技能页.列.托管路径"),
      key: "paths",
      render: (_value, row) => (
        <Space direction="vertical" size={2} className="skills-page-stack-cell">
          <Text className="skills-page-path" title={row.managedPath}>{row.managedPath}</Text>
          <Text type="secondary" className="skills-page-clamp" title={row.sourcePath || "-"}>
            {row.sourcePath || "-"}
          </Text>
        </Space>
      ),
    },
    {
      title: input.t("技能页.列.更新时间"),
      dataIndex: "updatedAt",
      width: 176,
      render: (value: string) => <Text type="secondary">{formatDateTime(value)}</Text>,
    },
    {
      title: input.t("技能页.列.状态"),
      key: "status",
      width: 88,
      align: "center",
      render: (_value, row) => input.renderStatus(row),
    },
    {
      title: input.t("技能页.列.操作"),
      key: "actions",
      width: 96,
      align: "center",
      render: (_value, row) => input.renderActions(row),
    },
  ];
}

export function createDiscoveryColumns(input: {
  t: Translate;
  copyingKey: string | null;
  onAdopt: (row: DesktopDiscoveredSkillItem) => void;
}): TableColumnsType<DesktopDiscoveredSkillItem> {
  return [
    {
      title: input.t("技能页.列.技能ID"),
      dataIndex: "skillId",
      width: 200,
      render: (value: string) => <Text strong title={value}>{value}</Text>,
    },
    {
      title: input.t("技能页.列.来源路径"),
      dataIndex: "sourcePath",
      render: (_value, row) => (
        <Space direction="vertical" size={4} className="skills-page-stack-cell">
          <Text className="skills-page-path" title={row.sourcePath}>{row.sourcePath}</Text>
          <Text type="secondary" className="skills-page-clamp" title={row.explain}>{row.explain}</Text>
        </Space>
      ),
    },
    {
      title: "SKILL.md",
      dataIndex: "hasSkillMarkdown",
      width: 96,
      render: (value: boolean) => {
        const meta = skillMarkdownMeta(input.t, value);
        return <Tag bordered={false} color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: input.t("技能页.发现.列.状态"),
      dataIndex: "state",
      width: 136,
      render: (_value, row) => (
        <Space direction="vertical" size={4} className="skills-page-stack-cell">
          <Tag bordered={false} color={discoveryStateTagColor(row.state)}>
            {discoveryStateLabel(input.t, row.state)}
          </Tag>
          {row.conflictType ? (
            <Text type="secondary">{input.t(`技能页.发现.值.conflict.${row.conflictType}` as never)}</Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: input.t("技能页.列.接入状态"),
      dataIndex: "managed",
      width: 136,
      render: (_value, row) => {
        const meta = managedStateMeta(input.t, row);
        return <Tag bordered={false} color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: input.t("技能页.列.操作"),
      key: "actions",
      width: 104,
      align: "center",
      render: (_value, row) => {
        const rowKey = rowKeyForDiscovery(row);
        return (
          <Button
            type="link"
            size="small"
            className="skills-page-action-link"
            loading={input.copyingKey === rowKey}
            onClick={(event) => {
              event.stopPropagation();
              input.onAdopt(row);
            }}
          >
            {input.t("技能页.按钮.接入")}
          </Button>
        );
      },
    },
  ];
}

export function createMarketColumns(input: {
  t: Translate;
  installingRef: string | null;
  onInstall: (row: DesktopSkillsMarketItem) => void;
}): TableColumnsType<DesktopSkillsMarketItem> {
  return [
    {
      title: input.t("技能页.市场.列.来源"),
      dataIndex: "provider",
      width: 110,
      render: (value: DesktopSkillsMarketProviderId) => (
        <Tag bordered={false}>{marketProviderLabel(input.t, value, value)}</Tag>
      ),
    },
    {
      title: input.t("技能页.市场.列.技能"),
      key: "skill",
      width: 300,
      render: (_value, row) => (
        <Space direction="vertical" size={4} className="skills-page-stack-cell">
          <Text strong className="skills-page-clamp" title={row.title}>{row.title}</Text>
          <Text type="secondary" className="skills-page-clamp" title={row.skillId}>{row.skillId}</Text>
          <Text code className="skills-page-install-ref" title={row.installRef}>{row.installRef}</Text>
        </Space>
      ),
    },
    {
      title: input.t("技能页.市场.列.仓库"),
      key: "repository",
      render: (_value, row) => (
        <Space direction="vertical" size={4} className="skills-page-stack-cell">
          {row.url ? (
            <Link href={row.url} target="_blank" className="skills-page-clamp">{row.repository || row.url}</Link>
          ) : (
            <Text className="skills-page-clamp">{row.repository || "-"}</Text>
          )}
          {row.url ? (
            <Text type="secondary" className="skills-page-clamp" title={row.url}>{row.url}</Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: input.t("技能页.市场.列.热度"),
      dataIndex: "installs",
      width: 96,
      render: (value?: number) => <Text type="secondary">{typeof value === "number" ? value.toLocaleString() : "-"}</Text>,
    },
    {
      title: input.t("技能页.列.操作"),
      key: "actions",
      width: 92,
      align: "center",
      render: (_value, row) => {
        if (row.provider === "skills.sh") {
          return (
            <Tooltip title={input.t("技能页.按钮.市场安装")}>
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                className="skills-page-inline-action"
                loading={input.installingRef === row.installRef}
                onClick={(event) => {
                  event.stopPropagation();
                  input.onInstall(row);
                }}
              />
            </Tooltip>
          );
        }
        if (row.url) {
          return (
            <Tooltip title={input.t("技能页.按钮.打开来源")}>
              <Button
                type="text"
                size="small"
                icon={<ExportOutlined />}
                className="skills-page-inline-action"
                href={row.url}
                target="_blank"
                onClick={(event) => event.stopPropagation()}
              />
            </Tooltip>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
  ];
}

export function createEffectiveColumns(input: { t: Translate }): TableColumnsType<DesktopSkillEffectiveRow> {
  return [
    {
      title: input.t("技能页.生效.列.技能"),
      key: "skill",
      width: 220,
      render: (_value, row) => (
        <Space direction="vertical" size={2} className="skills-page-stack-cell">
          <Text strong title={managedSkillDisplayName(row.item)}>{managedSkillDisplayName(row.item)}</Text>
          <Text type="secondary" title={row.winnerSkillId}>{row.winnerSkillId}</Text>
        </Space>
      ),
    },
    {
      title: input.t("技能页.生效.列.决策"),
      dataIndex: "decision",
      width: 160,
      render: (_value, row) => {
        const meta = effectiveDecisionMeta(input.t, row);
        return <Tag bordered={false} color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: input.t("技能页.生效.列.注入"),
      dataIndex: "included",
      width: 110,
      render: (value: boolean) => {
        const meta = effectiveInclusionMeta(input.t, value);
        return <Tag bordered={false} color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: input.t("技能页.生效.列.托管路径"),
      dataIndex: ["item", "managedPath"],
      render: (_value, row) => <Text className="skills-page-path" title={row.item.managedPath}>{row.item.managedPath}</Text>,
    },
    {
      title: input.t("技能页.生效.列.解释"),
      dataIndex: "explain",
      render: (value: string) => <Text className="skills-page-clamp" title={value}>{value}</Text>,
    },
  ];
}

export function createManagedActionCell(input: {
  t: Translate;
  deletingSkillId: string | null;
  onEdit: (row: DesktopSkillItem) => void;
  onDelete: (row: DesktopSkillItem) => void;
}) {
  return (row: DesktopSkillItem) => (
    <div className="skills-page-row-actions">
      <Tooltip title={input.t("技能页.按钮.编辑")}>
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          className="skills-page-inline-action"
          onClick={(event) => {
            event.stopPropagation();
            input.onEdit(row);
          }}
        />
      </Tooltip>
      <Tooltip title={input.t("技能页.按钮.删除")}>
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          className="skills-page-inline-action"
          loading={input.deletingSkillId === row.skillId}
          onClick={(event) => {
            event.stopPropagation();
            input.onDelete(row);
          }}
        />
      </Tooltip>
    </div>
  );
}