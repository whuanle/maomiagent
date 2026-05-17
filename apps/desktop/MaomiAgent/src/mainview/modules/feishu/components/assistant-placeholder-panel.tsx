import { Card, Tag, Typography } from "antd"

const { Paragraph, Text, Title } = Typography

export function FeishuAssistantPlaceholderPanel() {
  return (
    <Card className="panel-card feishu-assistant-card" bordered>
      <div className="feishu-assistant-shell">
        <div className="feishu-assistant-copy">
          <Tag bordered={false} color="blue">占位</Tag>
          <Title level={3} className="feishu-assistant-title">
            飞书智能助手
          </Title>
          <Paragraph className="feishu-assistant-description">
            菜单入口已预留，后续新功能直接落在这个页面。
          </Paragraph>
          <Text type="secondary" className="feishu-assistant-hint">
            当前先保留占位结构，不接入实际能力。
          </Text>
        </div>
      </div>
    </Card>
  )
}
