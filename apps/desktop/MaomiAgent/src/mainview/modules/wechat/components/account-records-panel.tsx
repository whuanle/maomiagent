import {
  ClearOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Empty,
  Popconfirm,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";

import type {
  WechatAccountConnectionStatus,
  WechatAccountView,
} from "../../../../shared/desktop-wechat";

const { Text } = Typography;

export type WechatAccountRecordsPanelProps = {
  accounts: WechatAccountView[];
  loading: boolean;
  accountActionKey: string;
  formatDateTime: (value?: string) => string;
  resolveAccountStatusColor: (status: WechatAccountConnectionStatus) => string;
  onClearAccountConversations: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
};

export function WechatAccountRecordsPanel(props: WechatAccountRecordsPanelProps) {
  const columns: TableColumnsType<WechatAccountView> = [
    {
      title: "账号",
      dataIndex: "accountId",
      key: "accountId",
      width: 260,
      render: (value: string, record) => (
        <div className="wechat-page-primary-cell">
          <div>{value}</div>
          <Text type="secondary">{record.userId || "未返回用户 ID"}</Text>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "connectionStatus",
      key: "connectionStatus",
      width: 120,
      align: "center",
      render: (value: WechatAccountConnectionStatus) => (
        <Tag color={props.resolveAccountStatusColor(value)}>{value}</Tag>
      ),
    },
    {
      title: "最近入站",
      dataIndex: "lastInboundAt",
      key: "lastInboundAt",
      width: 180,
      align: "center",
      render: (value?: string) => props.formatDateTime(value),
    },
    {
      title: "最近回发",
      dataIndex: "lastOutboundAt",
      key: "lastOutboundAt",
      width: 180,
      align: "center",
      render: (value?: string) => props.formatDateTime(value),
    },
    {
      title: "错误",
      dataIndex: "lastError",
      key: "lastError",
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
    {
      title: "操作",
      key: "action",
      width: 112,
      align: "center",
      fixed: "right",
      render: (_value, record) => {
        const clearing = props.accountActionKey === `${record.accountId}:clear`;
        const removing = props.accountActionKey === `${record.accountId}:remove`;

        return (
          <div className="wechat-page-record-actions">
            <Popconfirm
              title="清空这个账号下的对话？"
              okText="清空"
              cancelText="取消"
              onConfirm={() => props.onClearAccountConversations(record.accountId)}
            >
              <Tooltip title="清空消息">
                <Button
                  type="text"
                  size="small"
                  icon={<ClearOutlined aria-hidden="true" />}
                  aria-label="清空消息"
                  loading={clearing}
                  disabled={removing}
                />
              </Tooltip>
            </Popconfirm>

            <Popconfirm
              title="移除这个微信账号？"
              okText="移除"
              cancelText="取消"
              onConfirm={() => props.onRemoveAccount(record.accountId)}
            >
              <Tooltip title="移除账号">
                <Button
                  danger
                  type="text"
                  size="small"
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label="移除账号"
                  loading={removing}
                  disabled={clearing}
                />
              </Tooltip>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  return (
    <div className="wechat-page-panel wechat-page-records-panel">
      <div className="wechat-page-section-head">
        <div className="wechat-page-section-copy">
          <div className="wechat-page-panel-title">接入账号记录</div>
          <Text type="secondary">同一个微信号只能保留一个在线连接。</Text>
        </div>
      </div>

      <Divider className="wechat-page-content-divider" />

      <div className="wechat-page-records-shell">
        <Table<WechatAccountView>
          rowKey="accountId"
          size="middle"
          tableLayout="fixed"
          className="wechat-page-records-table"
          columns={columns}
          dataSource={props.accounts}
          pagination={false}
          loading={props.loading}
          scroll={{
            x: "max-content",
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没有接入微信账号"
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
