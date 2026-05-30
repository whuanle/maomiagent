import { Alert, Button, Descriptions, Modal, Space, Tag, Typography } from "antd"

import type {
  FeishuDocPermissionInspectView,
  FeishuDocPermissionProbeView,
} from "../../../../shared/desktop-feishu"
import type { FeishuTranslate as Translate } from "../types"

const { Text } = Typography

type Props = {
  open: boolean
  loading: boolean
  error: string
  result: FeishuDocPermissionInspectView | null
  t: Translate
  onClose: () => void
  onRetry: () => void
}

function renderProbe(label: string, probe: FeishuDocPermissionProbeView) {
  const color = probe.ok
    ? "green"
    : probe.category === "permission" || probe.category === "auth"
      ? "red"
      : "gold"

  return (
    <div className="feishu-doc-permission-inspect-item">
      <Space wrap size={[8, 8]}>
        <Text strong>{label}</Text>
        <Tag color={color}>{probe.ok ? "OK" : probe.category}</Tag>
        {probe.code != null ? <Text code>{String(probe.code)}</Text> : null}
      </Space>
      <Text type={probe.ok ? "secondary" : "danger"}>{probe.message}</Text>
    </div>
  )
}

export function FeishuDocPermissionInspectModal(props: Props) {
  const whiteboardRecovery = props.result?.latestPull?.whiteboardRecovery

  return (
    <Modal
      rootClassName="feishu-doc-permission-inspect-modal"
      open={props.open}
      title={props.t("飞书页.文档.权限检查.标题")}
      footer={[
        <Button key="retry" loading={props.loading} onClick={props.onRetry}>
          {props.t("飞书页.文档.权限检查.按钮.重新检查")}
        </Button>,
        <Button key="close" type="primary" onClick={props.onClose}>
          {props.t("危险操作.弹窗.取消")}
        </Button>,
      ]}
      onCancel={props.onClose}
      width={880}
      destroyOnClose
    >
      <div className="feishu-doc-permission-inspect-layout">
        {props.error ? (
          <Alert type="error" showIcon message={props.error} />
        ) : null}
        {props.result ? (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={props.t("飞书页.文档.权限检查.字段.授权状态")}>
                {props.result.identity.authStatus}
              </Descriptions.Item>
              <Descriptions.Item label={props.t("飞书页.文档.权限检查.字段.Token到期")}>
                {props.result.identity.accessTokenExpiresAt || "-"}
              </Descriptions.Item>
            </Descriptions>
            <Space wrap>
              {props.result.identity.keyScopes.map((item) => (
                <Tag key={item.scope} color={item.granted ? "green" : "default"}>
                  {item.scope}
                </Tag>
              ))}
            </Space>
            <div className="feishu-doc-permission-inspect-section">
              <Text strong>{props.t("飞书页.文档.权限检查.分组.文档探测")}</Text>
              <div className="feishu-doc-permission-inspect-list">
                {renderProbe("Wiki", props.result.document.wiki)}
                {renderProbe("Docx", props.result.document.docx)}
              </div>
            </div>
            <div className="feishu-doc-permission-inspect-section">
              <Space align="center" size={12}>
                <Text strong>{props.t("飞书页.文档.权限检查.分组.白板探测")}</Text>
                {whiteboardRecovery ? (
                  <Text code>{`${whiteboardRecovery.recoveredCount} / ${whiteboardRecovery.fallbackCount}`}</Text>
                ) : null}
              </Space>
              <div className="feishu-doc-permission-inspect-list">
                {props.result.whiteboards.map((item) => (
                  <div key={item.token} className="feishu-doc-permission-inspect-item">
                    <Text strong>{item.token}</Text>
                    {renderProbe(item.token, item.probeResult)}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
