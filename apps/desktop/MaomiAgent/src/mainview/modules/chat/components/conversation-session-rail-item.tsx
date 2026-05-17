import {
  CloseOutlined,
  LoadingOutlined,
} from "@ant-design/icons";

import type {
  DesktopConversationSessionItem,
  DesktopConversationSessionStatus,
} from "../../../../shared/desktop-conversation";
import type { LanguageCode } from "../../../config/titlebar";
import type { ChatCopy } from "../types";
import { resolveManagedSessionIndicator } from "./managed-session-status";

type Props = {
  item: DesktopConversationSessionItem;
  language: LanguageCode;
  copy: ChatCopy;
  removing?: boolean;
  onRemove: () => void;
};

function formatDateTime(value: string, language: LanguageCode) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language);
}

function formatRelativeTimestamp(value: string, language: LanguageCode) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return language === "en-US" ? "Just now" : "刚刚";
  }

  if (diff < hour) {
    const minutes = Math.max(1, Math.floor(diff / minute));
    return language === "en-US" ? `${minutes} min ago` : `${minutes} 分钟前`;
  }

  if (diff < day) {
    const hours = Math.max(1, Math.floor(diff / hour));
    return language === "en-US" ? `${hours} h ago` : `${hours} 小时前`;
  }

  if (diff < 7 * day) {
    const days = Math.max(1, Math.floor(diff / day));
    return language === "en-US" ? `${days} d ago` : `${days} 天前`;
  }

  return date.toLocaleDateString(language);
}

function resolveSessionTone(status: DesktopConversationSessionStatus) {
  if (status === "active") {
    return "running" as const;
  }

  if (status === "failed") {
    return "error" as const;
  }

  return "idle" as const;
}

function trimText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasPendingApprovalOrForm(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return false;
  }

  const phase = trimText(metadata.phase)?.toLowerCase();
  const stage = trimText(metadata.managedExecutionStage)?.toLowerCase();
  const blockedReason = trimText(metadata.blockedReason)?.toLowerCase();

  if (phase?.startsWith("awaiting_")) {
    return true;
  }

  if (stage === "ready") {
    return true;
  }

  if (!blockedReason) {
    return false;
  }

  return blockedReason.includes("approval")
    || blockedReason.includes("confirm")
    || blockedReason.includes("form")
    || blockedReason.includes("input");
}

function resolveStatusBadge(
  status: DesktopConversationSessionStatus,
  copy: ChatCopy,
  managedIndicator: ReturnType<typeof resolveManagedSessionIndicator>,
) {
  if (status === "archived") {
    return {
      label: copy.statusArchived,
      tone: "neutral" as const,
    };
  }

  if (status === "failed") {
    return {
      label: copy.statusFailed,
      tone: "warning" as const,
    };
  }

  if (managedIndicator) {
    return {
      label: managedIndicator.label,
      tone: managedIndicator.badgeTone,
    };
  }

  return null;
}

export function ConversationSessionRailItem(props: Props) {
  const managedIndicator = resolveManagedSessionIndicator(
    props.item.status,
    props.item.metadata,
    props.language,
  );
  const badge = resolveStatusBadge(props.item.status, props.copy, managedIndicator);
  const meta = formatRelativeTimestamp(props.item.updatedAt, props.language);
  const baseStatusTone = managedIndicator?.statusTone ?? resolveSessionTone(props.item.status);
  const requiresAttention = baseStatusTone === "warning" || hasPendingApprovalOrForm(props.item.metadata);
  const statusTone = props.item.status === "failed"
    ? "error"
    : (requiresAttention
      ? "warning"
      : (props.item.status === "active" || baseStatusTone === "running"
        ? "running"
        : "idle"));
  const statusLabel = managedIndicator?.label ?? props.copy.statusLabel(props.item.status);
  const isExecutionRunning = props.item.status === "active" || managedIndicator?.statusTone === "running";
  const removeDisabled = Boolean(props.removing || isExecutionRunning);

  return (
    <div className="chat-session-rail-item">
      <div className="chat-session-rail-item-copy">
        <div className="chat-session-rail-item-head">
          <span className="chat-session-rail-item-title">{props.item.title || props.item.sessionId}</span>
        </div>
        <div className="chat-session-rail-item-meta-row">
          <div className="chat-session-rail-item-meta" title={formatDateTime(props.item.updatedAt, props.language)}>
            {meta}
          </div>
          {badge ? (
            <div className="chat-session-rail-item-badges">
              <span className={`chat-session-rail-item-badge is-${badge.tone}`} title={badge.label}>
                {badge.label}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="chat-session-rail-item-side">
        <span
          className={`chat-session-rail-item-status-dot is-${statusTone}`}
          aria-label={statusLabel}
          title={statusLabel}
        />
        <span
          role="button"
          tabIndex={removeDisabled ? -1 : 0}
          className={`chat-session-rail-item-action chat-nav-item-close${removeDisabled ? " is-disabled" : ""}`}
          aria-label={props.copy.archiveSession}
          title={props.copy.archiveSession}
          onClick={(event) => {
            if (removeDisabled) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            props.onRemove();
          }}
          onKeyDown={(event) => {
            if (removeDisabled) {
              return;
            }
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            props.onRemove();
          }}
        >
          {props.removing ? <LoadingOutlined /> : <CloseOutlined />}
        </span>
      </div>
    </div>
  );
}