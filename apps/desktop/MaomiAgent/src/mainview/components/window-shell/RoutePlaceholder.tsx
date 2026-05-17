import { Card, Descriptions, Space, Tag, Typography } from "antd";
import { resolveRouteLabel, type AppRouteItem, type LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";
import type { RuntimeStatus } from "../../types/status";

type Props = {
  route: AppRouteItem;
  language: LanguageCode;
  t: Translate;
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

export function RoutePlaceholder(props: Props) {
  const connected = props.status.healthy === true;

  return (
    <section className="shell-route-page">
      <div className="shell-route-page__stack">
        <Card className="shell-route-page__hero" bordered={false}>
          <Space orientation="vertical" size={16} className="shell-route-page__hero-stack">
            <Space size={10} wrap>
              <Tag color="blue">{resolveRouteLabel(props.route, props.t)}</Tag>
              <Tag color={props.status.healthy === null ? undefined : connected ? "success" : "error"}>
                {props.status.healthy === null
                  ? props.t("运行时.状态.检查中")
                  : connected
                    ? props.t("运行时.状态.运行中")
                    : props.t("运行时.状态.未连接")}
              </Tag>
              <Tag>{props.t("外壳页.标签.桌面外壳")}</Tag>
            </Space>

            <div>
              <Typography.Title level={2}>{resolveRouteLabel(props.route, props.t)}</Typography.Title>
            </div>
          </Space>
        </Card>

        <Card title={props.t("外壳页.标题.当前外壳状态")} bordered={false}>
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label={props.t("运行时.字段.入口地址")}>{props.status.entryUrl || "-"}</Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.运行时名称")}>
              {props.status.runtime?.runtimeName || "-"}
            </Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.版本")}>{props.status.runtime?.version || "-"}</Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.当前请求Scope")}>
              {props.status.request?.requestId || "-"}
            </Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.启动时间")}>
              {formatTimestamp(props.status.runtime?.startedAt, props.language)}
            </Descriptions.Item>
            <Descriptions.Item label={props.t("运行时.字段.模块图")}>
              {props.status.runtime?.moduleIds.join(", ") || "-"}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
    </section>
  );
}