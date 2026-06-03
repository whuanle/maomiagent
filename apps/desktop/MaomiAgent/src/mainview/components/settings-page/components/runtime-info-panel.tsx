import { Descriptions, Space, Tag, Typography } from "antd";
import type { LanguageCode } from "../../../config/titlebar";
import type { Translate } from "../../../i18n";
import type { RuntimeStatus } from "../../../types/status";

type Props = {
  t: Translate;
  language: LanguageCode;
  status: RuntimeStatus;
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

export function RuntimeInfoPanel(props: Props) {
  const statusTone = props.status.healthy === null ? undefined : props.status.healthy ? "success" : "error";
  const statusLabel = props.status.healthy === null
    ? props.t("运行时.状态.检查中")
    : props.status.healthy
      ? props.t("运行时.状态.运行中")
      : props.t("运行时.状态.未连接");

  return (
    <section className="settings-page-card settings-page-runtime-card">
      <header className="settings-page-card-header settings-page-runtime-header">
        <div className="settings-page-card-title-row">
          <h2>{props.t("设置页.标题.运行时消息")}</h2>
        </div>
        <Tag color={statusTone}>{statusLabel}</Tag>
      </header>

      <Descriptions column={2} size="small" colon={false} className="settings-page-runtime-descriptions">
        <Descriptions.Item label={props.t("运行时.字段.入口")}>{props.status.entryUrl || "-"}</Descriptions.Item>
        <Descriptions.Item label={props.t("运行时.字段.运行时")}>{props.status.runtime?.runtimeName || "-"}</Descriptions.Item>
        <Descriptions.Item label={props.t("运行时.字段.版本")}>{props.status.runtime?.version || "-"}</Descriptions.Item>
        <Descriptions.Item label={props.t("运行时.字段.当前Scope")}>{props.status.request?.requestId || "-"}</Descriptions.Item>
        <Descriptions.Item label={props.t("运行时.字段.启动时间")}>{formatTimestamp(props.status.runtime?.startedAt, props.language)}</Descriptions.Item>
        <Descriptions.Item label={props.t("运行时.字段.已加载模块")}>
          <Space size={[6, 6]} wrap>
            {props.status.runtime?.moduleIds?.length
              ? props.status.runtime.moduleIds.map((moduleId) => (
                  <Tag key={moduleId} bordered={false} className="settings-page-runtime-module-tag">
                    {moduleId}
                  </Tag>
                ))
              : <Typography.Text type="secondary">-</Typography.Text>}
          </Space>
        </Descriptions.Item>
      </Descriptions>
    </section>
  );
}