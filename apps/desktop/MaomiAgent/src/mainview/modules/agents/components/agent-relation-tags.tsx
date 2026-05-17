import { Tag, Tooltip } from "antd"
import type { AgentsTranslate as Translate } from "../agents-i18n"
import { formatAgentRelationGroupTitle, type AgentRelationGroup } from "./agent-relations"

type Props = {
  groups: AgentRelationGroup[]
  t: Translate
  maxVisible?: number
}

function classNameForKind(kind: AgentRelationGroup["kind"]) {
  if (kind === "primary") return "agents-table-relation-tag status-badge-primary"
  if (kind === "plugin") return "agents-table-relation-tag status-badge-success"
  return "agents-table-relation-tag status-badge-neutral"
}

export function AgentRelationTagList({ groups, maxVisible = Number.MAX_SAFE_INTEGER, t }: Props) {
  if (groups.length === 0) {
    return <span className="agents-table-relation-empty">-</span>
  }

  const visibleGroups = groups.slice(0, Math.max(0, maxVisible))
  const hiddenGroups = groups.slice(Math.max(0, maxVisible))

  return (
    <div className="agents-table-relation-list">
      {visibleGroups.map((group) => (
        <Tooltip key={group.key} title={formatAgentRelationGroupTitle(group, t)}>
          <Tag bordered={false} className={classNameForKind(group.kind)}>
            {group.label}
          </Tag>
        </Tooltip>
      ))}
      {hiddenGroups.length > 0 ? (
        <Tooltip
          title={hiddenGroups
            .map((group) => formatAgentRelationGroupTitle(group, t))
            .join(" / ")}
        >
          <Tag bordered={false} className="agents-table-relation-tag status-badge-neutral">
            +{hiddenGroups.length}
          </Tag>
        </Tooltip>
      ) : null}
    </div>
  )
}

export default AgentRelationTagList
