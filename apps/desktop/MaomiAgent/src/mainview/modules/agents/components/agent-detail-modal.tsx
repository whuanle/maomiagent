import { Descriptions, Modal, Typography } from "antd"
import type { AgentsTranslate as Translate } from "../agents-i18n"
import { displayAgentUpdatedAt, formatAgentMode, sourceLabel, stringifyJson } from "../helpers"
import { AgentRelationTagList } from "./agent-relation-tags"
import type { AgentListItem } from "./agent-relations"

const { Text } = Typography

type AgentDetailModalProps = {
  open: boolean
  item: AgentListItem | null
  t: Translate
  onClose: () => void
}

function renderPreBlock(value: unknown) {
  if (!value) {
    return <Text type="secondary">-</Text>
  }

  return <pre className="agents-page-detail-pre">{typeof value === "string" ? value : stringifyJson(value)}</pre>
}

function renderPromptText(value: unknown) {
  if (!value || typeof value !== "string" || !value.trim()) {
    return <Text type="secondary">-</Text>
  }

  return <div className="agents-page-detail-prompt-text">{value}</div>
}

function formatRelationPeerText(
  items: Array<{ agentId: string; name: string }>,
) {
  return items.map((entry) => `${entry.name}(${entry.agentId})`).join("、")
}

function renderRelationPeerList(
  items: Array<{ agentId: string; name: string }>,
  label: string,
) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="agents-page-detail-relation-line">
      <Text type="secondary" className="agents-page-detail-relation-label">
        {label}
      </Text>
      <span className="agents-page-detail-relation-text">{formatRelationPeerText(items)}</span>
    </div>
  )
}

function renderSelectionPolicyText(item: AgentListItem, t: Translate) {
  if (item.mode === "subagent") {
    return <Text type="secondary">-</Text>
  }

  const key = item.subAgentPolicy?.mode === "allow_list"
    ? "智能体页.值.selectionPolicy.allow_list"
    : "智能体页.值.selectionPolicy.free"

  return t(key)
}

function renderAllowedAgentIds(item: AgentListItem) {
  const allowedAgentIds = item.subAgentPolicy?.mode === "allow_list"
    ? item.subAgentPolicy.allowedAgentIds ?? []
    : []

  if (allowedAgentIds.length === 0) {
    return <Text type="secondary">-</Text>
  }

  return allowedAgentIds.join("、")
}

export function AgentDetailModal(props: AgentDetailModalProps) {
  const { item, open, onClose, t } = props

  return (
    <Modal
      open={open}
      footer={null}
      maskClosable
      destroyOnHidden
      width="min(88vw, 920px)"
      title={t("智能体页.详情.标题")}
      className="agents-page-detail-modal"
      onCancel={onClose}
    >
      {item ? (
        <Descriptions bordered column={1} size="middle" className="agents-page-detail-descriptions">
          <Descriptions.Item label={t("智能体页.字段.agentId")}>
            <Text code>{item.agentId}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.name")}>
            {item.name}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.mode")}>
            {formatAgentMode(t, item.mode)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.source")}>
            {sourceLabel(t, item.source)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.version")}>
            {item.version}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.列.关联")}>
            <div className="agents-page-detail-relations">
              <AgentRelationTagList groups={item.relationInfo.groups} t={t} />
              {renderRelationPeerList(
                item.relationInfo.primaryAgents,
                t("智能体页.详情.主智能体"),
              )}
              {renderRelationPeerList(
                item.relationInfo.childAgents,
                t("智能体页.详情.子智能体"),
              )}
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.selectionPolicy")}>
            {renderSelectionPolicyText(item, t)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.allowedAgentIds")}>
            {renderAllowedAgentIds(item)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.列.更新时间")}>
            {displayAgentUpdatedAt(item)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.description")}>
            {item.description?.trim() ? item.description : <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.model")}>
            {item.model?.trim() ? item.model : <Text type="secondary">-</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.tools")}>
            {renderPreBlock(item.tools)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.permissionJson")}>
            {renderPreBlock(item.permission)}
          </Descriptions.Item>
          <Descriptions.Item label={t("智能体页.字段.prompt")}>
            {renderPromptText(item.prompt)}
          </Descriptions.Item>
        </Descriptions>
      ) : null}
    </Modal>
  )
}

export default AgentDetailModal
