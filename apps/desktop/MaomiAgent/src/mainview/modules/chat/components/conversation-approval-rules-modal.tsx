import { Button, Empty, Modal, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { PermissionInteractionRequest } from "#maomiagent/kernel/core";

import {
  buildDesktopConversationPermissionRuleScope,
  type DesktopConversationPermissionRule,
} from "../../../../shared/desktop-conversation";
import type { LanguageCode } from "../../../config/titlebar";

type Props = {
  open: boolean;
  language: LanguageCode;
  rules: DesktopConversationPermissionRule[];
  saving?: boolean;
  request?: PermissionInteractionRequest;
  onCancel: () => void;
  onSubmit: (rules: DesktopConversationPermissionRule[]) => void;
};

function resolveCopy(language: LanguageCode) {
  if (language === "en-US") {
    return {
      title: "Configure auto approval",
      save: "Save rules",
      cancel: "Cancel",
      currentRequestTitle: "Current request",
      currentRequestHint: "Save this permission request as an always-allow rule for this workspace.",
      addCurrentRule: "Allow similar requests",
      currentRuleAdded: "Already saved",
      savedRulesTitle: "Saved rules",
      emptyRules: "No auto approval rules yet.",
      emptyRulesHint: "Open this from a permission request to save a rule directly from a blocked action.",
      permissionLabel: "Permission",
      resourcesLabel: "Resources",
      remove: "Remove",
      matchingHint: "Rules match the current permission signature exactly. Requests that do not match will still wait for approval.",
      alwaysAllow: "Always allow",
    };
  }

  return {
    title: "配置自动授权",
    save: "保存规则",
    cancel: "取消",
    currentRequestTitle: "当前请求",
    currentRequestHint: "把这条权限请求保存成当前工作区的总是允许规则。",
    addCurrentRule: "允许相同请求",
    currentRuleAdded: "已保存",
    savedRulesTitle: "已保存规则",
    emptyRules: "还没有自动授权规则。",
    emptyRulesHint: "从权限请求里打开这里，可以直接把被阻塞的操作保存成规则。",
    permissionLabel: "权限",
    resourcesLabel: "资源",
    remove: "移除",
    matchingHint: "规则按当前权限签名精确匹配。未命中的请求仍会停下来等待审批。",
    alwaysAllow: "总是允许",
  };
}

function resolveResourceSummary(request: PermissionInteractionRequest) {
  const labels = (request.resources ?? []).map((resource: NonNullable<PermissionInteractionRequest["resources"]>[number]) => (
    resource.label || resource.path || resource.uri || resource.command || resource.toolName || resource.kind
  )).filter(Boolean);

  return labels.join(" · ");
}

function buildRuleFromRequest(request: PermissionInteractionRequest): DesktopConversationPermissionRule {
  const resourceSummary = resolveResourceSummary(request);
  return {
    scope: buildDesktopConversationPermissionRuleScope(request),
    permission: request.permission,
    decision: "approve_always",
    ...(request.title?.trim() ? { title: request.title.trim() } : {}),
    ...(request.description?.trim() ? { note: request.description.trim() } : {}),
    ...(resourceSummary ? { resourceSummary } : {}),
  };
}

function hasMatchingRule(
  rules: DesktopConversationPermissionRule[],
  candidate: DesktopConversationPermissionRule,
) {
  return rules.some((rule) => (
    rule.scope === candidate.scope
    && rule.permission === candidate.permission
    && rule.decision === candidate.decision
  ));
}

function describeRule(rule: DesktopConversationPermissionRule) {
  return [rule.resourceSummary, rule.permission].filter(Boolean).join(" · ");
}

export function ConversationApprovalRulesModal(props: Props) {
  const copy = useMemo(() => resolveCopy(props.language), [props.language]);
  const [draftRules, setDraftRules] = useState<DesktopConversationPermissionRule[]>(props.rules);

  useEffect(() => {
    if (props.open) {
      setDraftRules(props.rules);
    }
  }, [props.open, props.rules]);

  const candidateRule = useMemo(() => {
    if (!props.request?.allowAlways) {
      return undefined;
    }

    return buildRuleFromRequest(props.request);
  }, [props.request]);
  const candidateExists = candidateRule ? hasMatchingRule(draftRules, candidateRule) : false;
  const dirty = JSON.stringify(draftRules) !== JSON.stringify(props.rules);

  return (
    <Modal
      open={props.open}
      title={copy.title}
      onCancel={props.onCancel}
      onOk={() => props.onSubmit(draftRules)}
      okText={copy.save}
      cancelText={copy.cancel}
      confirmLoading={props.saving}
      okButtonProps={{ disabled: props.saving || !dirty }}
      destroyOnHidden
      width={720}
      style={{ top: 72 }}
      styles={{
        body: {
          maxHeight: "60vh",
          overflow: "auto",
        },
      }}
    >
      <div className="chat-approval-rules-modal-body">
        <Typography.Paragraph className="chat-approval-rules-note">
          {copy.matchingHint}
        </Typography.Paragraph>

        {candidateRule ? (
          <section className="chat-approval-rules-section">
            <div className="chat-approval-rules-card">
              <div className="chat-approval-rules-card-head">
                <div>
                  <Typography.Text strong className="chat-approval-rules-card-title">
                    {copy.currentRequestTitle}
                  </Typography.Text>
                  <Typography.Paragraph className="chat-approval-rules-card-meta">
                    {copy.currentRequestHint}
                  </Typography.Paragraph>
                </div>
                <Button
                  size="small"
                  className="chat-approval-rules-inline-action"
                  disabled={candidateExists}
                  onClick={() => {
                    if (!candidateExists) {
                      setDraftRules((current) => [...current, candidateRule]);
                    }
                  }}
                >
                  {candidateExists ? copy.currentRuleAdded : copy.addCurrentRule}
                </Button>
              </div>
              <div className="chat-approval-rules-chip-row">
                <span className="chat-assistant-interaction-chip">{copy.alwaysAllow}</span>
                <span className="chat-assistant-interaction-chip">{candidateRule.permission}</span>
              </div>
              {candidateRule.resourceSummary ? (
                <Typography.Paragraph className="chat-approval-rules-card-meta">
                  {copy.resourcesLabel}: {candidateRule.resourceSummary}
                </Typography.Paragraph>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="chat-approval-rules-section">
          <Typography.Text strong className="chat-approval-rules-section-title">
            {copy.savedRulesTitle}
          </Typography.Text>
          {draftRules.length > 0 ? (
            <div className="chat-approval-rules-list">
              {draftRules.map((rule, index) => (
                <div key={`${rule.scope}-${rule.permission}-${index}`} className="chat-approval-rules-card">
                  <div className="chat-approval-rules-card-head">
                    <div>
                      <Typography.Text strong className="chat-approval-rules-card-title">
                        {rule.title || rule.permission}
                      </Typography.Text>
                      <Typography.Paragraph className="chat-approval-rules-card-meta">
                        {describeRule(rule)}
                      </Typography.Paragraph>
                    </div>
                    <Button
                      size="small"
                      type="text"
                      className="chat-approval-rules-inline-action"
                      onClick={() => {
                        setDraftRules((current) => current.filter((_, currentIndex) => currentIndex !== index));
                      }}
                    >
                      {copy.remove}
                    </Button>
                  </div>
                  <div className="chat-approval-rules-chip-row">
                    <span className="chat-assistant-interaction-chip">{copy.permissionLabel}: {rule.permission}</span>
                    <span className="chat-assistant-interaction-chip">{copy.alwaysAllow}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={copy.emptyRules}
            >
              <Typography.Paragraph className="chat-approval-rules-card-meta">
                {copy.emptyRulesHint}
              </Typography.Paragraph>
            </Empty>
          )}
        </section>
      </div>
    </Modal>
  );
}

export default ConversationApprovalRulesModal;