import { Button, Empty, Space, Spin, Typography } from "antd";
import type { WechatLoginSessionView } from "../../../../shared/desktop-wechat";

const { Text } = Typography;

type Props = {
  session: WechatLoginSessionView | null;
  formatDateTime: (value?: string) => string;
  onOpen: (session: WechatLoginSessionView) => void;
  openDisabled?: boolean;
  connectedAccountCount?: number;
  loading?: boolean;
};

const LOGIN_STATUS_LABELS: Record<WechatLoginSessionView["status"], string> = {
  pending: "准备中",
  wait: "等待扫码",
  scanned: "已扫码，待确认",
  confirmed: "已确认",
  expired: "已过期",
  failed: "失败",
};

export function WechatLoginPreview(props: Props) {
  const {
    session,
    formatDateTime,
    onOpen,
    openDisabled,
    connectedAccountCount,
    loading,
  } = props;

  if (!session) {
    if ((connectedAccountCount ?? 0) > 0) {
      return (
        <div className="wechat-login-preview">
          <div className="wechat-login-preview-meta">
            <Text strong>微信账号已接入</Text>
            <Text type="secondary">当前在线 {connectedAccountCount} 个微信账号。</Text>
            <Text type="secondary">后续消息会直接交给 MaomiAgent 处理，不需要重复扫码。</Text>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="wechat-login-preview wechat-login-preview-empty">
          <Space size={8}>
            <Spin size="small" />
            <Text type="secondary">正在读取微信接入状态...</Text>
          </Space>
        </div>
      );
    }

    return (
      <div className="wechat-login-preview wechat-login-preview-empty">
        <Empty description="先生成二维码，再扫码接入账号" />
      </div>
    );
  }

  if (session.status === "confirmed") {
    return (
      <div className="wechat-login-preview">
        <div className="wechat-login-preview-meta">
          <Text strong>{session.message}</Text>
          <Text type="secondary">状态：{LOGIN_STATUS_LABELS[session.status]}</Text>
          <Text type="secondary">账号已接入，不需要再次扫码。</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="wechat-login-preview">
      <div className="wechat-login-preview-meta">
        <Text strong>{session.message}</Text>
        <Text type="secondary">状态：{LOGIN_STATUS_LABELS[session.status]}</Text>
        <Text type="secondary">开始：{formatDateTime(session.startedAt)}</Text>
        <Text type="secondary">过期：{formatDateTime(session.expiresAt)}</Text>
        <Text type="secondary">二维码通过独立窗口打开，不在当前页面内嵌显示。</Text>
      </div>
      <div className="wechat-login-preview-actions">
        <Space wrap>
          <Button
            type="primary"
            disabled={!session.qrcodeUrl}
            loading={openDisabled}
            onClick={() => {
              onOpen(session);
            }}
          >
            打开扫码页
          </Button>
        </Space>
      </div>
    </div>
  );
}

export default WechatLoginPreview;
