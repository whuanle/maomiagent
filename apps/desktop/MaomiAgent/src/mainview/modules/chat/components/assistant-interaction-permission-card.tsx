import { App, Button } from "antd";
import { useCallback, useState } from "react";

import type { ConversationInteractionEntry } from "#maomiagent/kernel/src/host/application";
import type { DesktopConversationPermissionRule } from "../../../../shared/desktop-conversation";

import type { LanguageCode } from "../../../config/titlebar";
import { hasDesktopConversationBridge } from "../../../lib/desktop-conversation";
import { useConversationWorkspaceSettings } from "./conversation-workspace-settings-storage";
import { ConversationApprovalRulesModal } from "./conversation-approval-rules-modal";

type Props = {
  interaction: ConversationInteractionEntry;
  language: LanguageCode;
  workspaceId?: string;
  replying: boolean;
  onApproveInteraction: (interactionId: string, decision: "approve_once" | "approve_always") => void;
  onRejectInteraction: (interactionId: string) => void;
};

function resolveResourceLabel(
  resource: NonNullable<ConversationInteractionEntry["request"] extends infer T
    ? T extends { resources?: infer R }
      ? R extends readonly (infer I)[]
        ? I
        : never
      : never
    : never>,
) {
  return resource.label || resource.path || resource.uri || resource.kind;
}

export function AssistantInteractionPermissionCard(props: Props) {
  const { message } = App.useApp();
  const [approvalRulesOpen, setApprovalRulesOpen] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const workspaceId = props.workspaceId?.trim() || "";
  const {
    settings: workspaceSettings,
    loading: loadingWorkspaceSettings,
    saving: savingWorkspaceSettings,
    error: workspaceSettingsError,
    saveSettings,
  } = useConversationWorkspaceSettings(workspaceId);

  if (props.interaction.request.kind !== "permission") {
    return null;
  }

  const isEn = props.language === "en-US";
  const request = props.interaction.request;
  const approvalRules = workspaceSettings.permissionRules ?? [];
  const canConfigureRules = request.allowAlways && Boolean(workspaceId) && hasDesktopConversationBridge();
  const primaryDecision = request.allowAlways && request.defaultDecision === "approve_always"
    ? "approve_always"
    : "approve_once";
  const primaryLabel = request.confirmLabel
    ?? (primaryDecision === "approve_always"
      ? (isEn ? "Always allow" : "总是允许")
      : (isEn ? "Allow once" : "允许一次"));
  const secondaryLabel = isEn ? "Always allow" : "总是允许";
  const configureLabel = isEn ? "Configure auto approval" : "配置自动授权";
  const rejectLabel = request.rejectLabel ?? (isEn ? "Reject" : "拒绝");
  const statusLabel = isEn ? "Waiting for approval" : "等待授权";
  const actionCopy = loadingWorkspaceSettings
    ? (isEn ? "Loading saved rules." : "正在加载已保存规则。")
    : workspaceSettingsError
      ? (isEn ? "Saved rules are unavailable right now." : "暂时无法读取已保存规则。")
      : canConfigureRules
        ? (isEn
          ? "No saved auto approval rule matched. Confirm this permission or save it as an always-allow rule."
          : "当前没有命中自动授权规则。你可以直接审批，或把这条请求保存成总是允许规则。")
        : (isEn
          ? "The run will continue after you confirm this permission."
          : "确认这条权限后，运行会继续。");

  const handleSaveApprovalRules = useCallback(async (rules: DesktopConversationPermissionRule[]) => {
    if (!workspaceId || !hasDesktopConversationBridge()) {
      void message.error(isEn ? "Auto approval configuration is unavailable." : "当前运行环境暂不支持自动授权配置。");
      return;
    }
    if (loadingWorkspaceSettings || workspaceSettingsError) {
      void message.error(
        loadingWorkspaceSettings
          ? (isEn ? "Saved rules are still loading." : "已保存规则仍在加载中。")
          : (isEn ? "Saved rules are unavailable right now." : "暂时无法读取已保存规则。"),
      );
      return;
    }

    setSavingRules(true);
    try {
      await saveSettings({
        permissionRules: rules,
      }, {
        syncExistingSessions: true,
      });
      setApprovalRulesOpen(false);
      props.onApproveInteraction(props.interaction.interactionId, "approve_always");
    } catch (error) {
      void message.error(
        error instanceof Error && error.message.trim()
          ? `${isEn ? "Failed to save auto approval rules" : "保存自动授权规则失败"}: ${error.message}`
          : (isEn ? "Failed to save auto approval rules" : "保存自动授权规则失败"),
      );
    } finally {
      setSavingRules(false);
    }
  }, [
    isEn,
    loadingWorkspaceSettings,
    message,
    props,
    saveSettings,
    workspaceId,
    workspaceSettingsError,
  ]);

  return (
    <div className="chat-assistant-interaction-card is-permission is-asked is-dock">
      <div className="chat-assistant-interaction-head">
        <div className="chat-assistant-interaction-head-main">
          <span className="chat-assistant-interaction-head-label">
            {isEn ? "Permission request" : "权限请求"}
          </span>
          <span className="chat-assistant-interaction-head-summary">
            {request.title || request.permission}
          </span>
        </div>
        <span className="chat-assistant-interaction-head-status is-running">
          {statusLabel}
        </span>
      </div>

      {request.description ? (
        <div className="chat-assistant-interaction-copy">
          {request.description}
        </div>
      ) : null}

      <div className="chat-assistant-interaction-badges">
        <span className="chat-assistant-interaction-badge is-warning">
          {isEn ? "Manual approval" : "手动审批"}
        </span>
        {request.allowAlways ? (
          <span className="chat-assistant-interaction-badge is-neutral">
            {isEn ? "Can persist" : "可持久允许"}
          </span>
        ) : null}
      </div>

      <div className="chat-assistant-interaction-section">
        <div className="chat-assistant-interaction-section-label">
          {isEn ? "Permission" : "权限"}
        </div>
        <div className="chat-assistant-interaction-chip-row">
          <span className="chat-assistant-interaction-chip">
            {request.permission}
          </span>
        </div>
      </div>

      {request.resources?.length ? (
        <div className="chat-assistant-interaction-section">
          <div className="chat-assistant-interaction-section-label">
            {isEn ? "Resources" : "资源"}
          </div>
          <div className="chat-assistant-interaction-chip-row">
            {request.resources.map((resource, index) => (
              <span
                key={`${resource.kind}-${resource.label || resource.path || resource.uri || index}`}
                className="chat-assistant-interaction-chip"
              >
                {resolveResourceLabel(resource)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="chat-assistant-interaction-actions">
        <Button
          type="primary"
          size="small"
          className="chat-assistant-interaction-action is-primary"
          loading={props.replying}
          disabled={props.replying}
          onClick={() => props.onApproveInteraction(props.interaction.interactionId, primaryDecision)}
        >
          {primaryLabel}
        </Button>
        {request.allowAlways && primaryDecision !== "approve_always" ? (
          <Button
            size="small"
            className="chat-assistant-interaction-action"
            disabled={props.replying}
            onClick={() => props.onApproveInteraction(props.interaction.interactionId, "approve_always")}
          >
            {secondaryLabel}
          </Button>
        ) : null}
        {canConfigureRules ? (
          <Button
            size="small"
            className="chat-assistant-interaction-action"
            disabled={props.replying || savingRules || savingWorkspaceSettings || loadingWorkspaceSettings || Boolean(workspaceSettingsError)}
            onClick={() => setApprovalRulesOpen(true)}
          >
            {configureLabel}
          </Button>
        ) : null}
        <Button
          danger
          size="small"
          type="text"
          className="chat-assistant-interaction-action is-danger"
          disabled={props.replying}
          onClick={() => props.onRejectInteraction(props.interaction.interactionId)}
        >
          {rejectLabel}
        </Button>
      </div>

      <div className="chat-assistant-interaction-note">
        {actionCopy}
      </div>

      {canConfigureRules ? (
        <ConversationApprovalRulesModal
          open={approvalRulesOpen}
          language={props.language}
          rules={approvalRules}
          saving={savingRules || savingWorkspaceSettings || loadingWorkspaceSettings}
          request={request}
          onCancel={() => setApprovalRulesOpen(false)}
          onSubmit={handleSaveApprovalRules}
        />
      ) : null}
    </div>
  );
}

export default AssistantInteractionPermissionCard;
