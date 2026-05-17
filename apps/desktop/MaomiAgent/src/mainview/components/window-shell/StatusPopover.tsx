import { Button, Descriptions, Popover, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import type { LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";
import type { RuntimeStatus } from "../../types/status";

type Props = {
  status: RuntimeStatus;
  language: LanguageCode;
  t: Translate;
  trigger?: ReactNode;
};

function formatTimestamp(value: string | undefined, language: LanguageCode): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(language);
}

export function StatusPopover(props: Props) {
  const statusTone = props.status.healthy === null ? undefined : props.status.healthy ? "success" : "error";
  const statusLabel = props.status.healthy === null
    ? props.t("运行时.状态.检查中")
    : props.status.healthy
      ? props.t("运行时.状态.已连接")
      : props.t("运行时.状态.未连接");

  return (
    <Popover
      placement="bottomLeft"
      content={(
        <div className="runtime-status-popover">
          <div className="runtime-status-popover__header">
            <Typography.Text strong>{props.t("运行时.标题.运行时状态")}</Typography.Text>
            <Tag color={statusTone}>{statusLabel}</Tag>
          </div>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label={props.t("运行时.字段.入口")}>{props.status.entryUrl || "-"}</Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.运行时")}>{props.status.runtime?.runtimeName || "-"}</Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.版本")}>{props.status.runtime?.version || "-"}</Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.启动时间")}>
              {formatTimestamp(props.status.runtime?.startedAt, props.language)}
            </Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.当前Scope")}>{props.status.request?.requestId || "-"}</Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.已加载模块")}>
              {props.status.runtime?.moduleIds.join(", ") || "-"}
            </Descriptions.Item>
          </Descriptions>
          {props.status.error ? (
            <Typography.Paragraph className="runtime-status-popover__error" type="danger">
              {props.status.error}
            </Typography.Paragraph>
          ) : null}
        </div>
      )}
      trigger="click"
    >
      {props.trigger ?? (
        <Button type="text" className="window-titlebar-status-online">
          <span className="window-titlebar-status-dot" />
          {statusLabel}
        </Button>
      )}
    </Popover>
  );
}