import { Alert, App, Button, Empty, Slider, Switch, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DesktopConversationCapabilityDescriptor,
} from "../../../../shared/desktop-conversation";
import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import {
  hasDesktopConversationBridge,
  listDesktopConversationCapabilities,
} from "../../../lib/desktop-conversation";
import type { ChatSelectedSessionView } from "../types";
import {
  clampContextCompressionThresholdPercent,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN,
  type ConversationWorkspaceSettings,
  useConversationWorkspaceSettings,
} from "./conversation-workspace-settings-storage";
import { ConversationApprovalRulesModal } from "./conversation-approval-rules-modal";

type Props = {
  language: LanguageCode;
  selectedWorkspace?: DesktopWorkspaceItem;
  selectedSession?: ChatSelectedSessionView;
};

function formatSettingsSaveErrorMessage(
  title: string,
  error: unknown,
) {
  if (error instanceof Error && error.message.trim()) {
    return `${title}: ${error.message}`;
  }

  return title;
}

function resolveCopy(language: LanguageCode) {
  if (language === "en-US") {
    return {
      emptyWorkspace: "Select a workspace first.",
      defaultsSectionTitle: "Default settings",
      defaultsSectionMeta: "Saved in the current workspace.",
      replyStyleLabel: "AI reply style",
      replyStyleHint: "Chat replies are currently fixed to Programming mode.",
      replyStyleProgramming: "Programming",
      approvalLabel: "Auto approval",
      approvalHint: "Enabled by default. Turn this off to keep new approvals manual.",
      compressionLabel: "Context compression",
      compressionHint: "Saved as the default threshold for this workspace.",
      runtimeSectionTitle: "Runtime settings",
      runtimeSectionMeta: "Applied to new conversations in the current workspace.",
      thinkingLabel: "Enable thinking",
      thinkingHint: "Save the default reasoning preference for new conversations in this workspace.",
      managedExecutionLabel: "Managed execution",
      managedExecutionEnabledHint: "New conversations in this workspace start through the managed execution path.",
      managedExecutionDisabledHint: "New conversations in this workspace stay in the regular chat flow.",
      memoryLabel: "Enable memory MCP",
      memoryHint: "Save memory MCP as the workspace default and expose it to the conversation runtime.",
      sandboxLabel: "Enable sandbox mode",
      sandboxHint: "Save sandbox mode as the workspace default and expose it to the conversation runtime.",
      feishuLabel: "Enable Feishu capability",
      feishuReadyHint: "Feishu smart assistant is ready. Save it as the default workspace capability and expose it to the conversation runtime.",
      feishuUnavailableHint: "Feishu smart assistant is not ready yet. Configure it first in the Feishu module.",
      loadingHint: "Checking Feishu smart assistant configuration...",
      errorTitle: "Failed to load Feishu configuration",
      capabilityLoadErrorTitle: "Failed to load workspace capabilities",
      approvalConfigureLabel: "Configure rules",
      settingsSaveFailed: "Failed to save chat settings",
      settingsBridgeUnavailable: "Desktop chat settings are unavailable in the current runtime.",
      settingsWarningTitle: "Workspace settings were restored with defaults",
    };
  }

  return {
    emptyWorkspace: "请先选择工作区。",
    defaultsSectionTitle: "默认设置",
    defaultsSectionMeta: "保存在当前工作区。",
    replyStyleLabel: "AI 回复样式",
    replyStyleHint: "聊天回复当前固定为编程模式。",
    replyStyleProgramming: "编程模式",
    approvalLabel: "自动审批",
    approvalHint: "默认开启。关闭后，新请求会按手动审批偏好处理。",
    compressionLabel: "上下文压缩",
    compressionHint: "保存为当前工作区默认阈值。",
    runtimeSectionTitle: "运行设置",
    runtimeSectionMeta: "应用到当前工作区的新会话。",
    thinkingLabel: "启用 Thinking",
    thinkingHint: "将 Thinking 保存为当前工作区默认偏好，并同步到对话运行时偏好。",
    managedExecutionLabel: "全自动托管",
    managedExecutionEnabledHint: "当前工作区新建会话会优先按托管执行入口组织。",
    managedExecutionDisabledHint: "当前工作区新建会话保持普通对话入口。",
    memoryLabel: "启用记忆 MCP",
    memoryHint: "将记忆 MCP 保存为当前工作区默认偏好，并同步到对话运行时偏好。",
    sandboxLabel: "启用沙箱模式",
    sandboxHint: "将沙箱模式保存为当前工作区默认偏好，并同步到对话运行时偏好。",
    feishuLabel: "启用飞书能力",
    feishuReadyHint: "飞书智能助手已就绪，可将飞书能力保存为当前工作区默认偏好并同步到对话运行时偏好。",
    feishuUnavailableHint: "飞书智能助手尚未就绪，请先到飞书模块完成配置。",
    loadingHint: "正在检查飞书智能助手配置...",
    errorTitle: "读取飞书配置失败",
    capabilityLoadErrorTitle: "读取工作区能力失败",
    approvalConfigureLabel: "配置规则",
    settingsSaveFailed: "保存聊天设置失败",
    settingsBridgeUnavailable: "当前运行环境暂不支持聊天设置同步。",
    settingsWarningTitle: "工作区设置已回退为默认值",
  };
}

function resolveCapabilityHint(item: DesktopConversationCapabilityDescriptor) {
  return [item.description, item.statusText].filter(Boolean).join(" ");
}

function resolveApprovalRulesHint(language: LanguageCode, count: number) {
  if (language === "en-US") {
    return count > 0
      ? `${count} saved auto approval rule${count === 1 ? "" : "s"}. Requests that do not match will still require a click.`
      : "No saved auto approval rules yet. Requests that do not match will still require a click.";
  }

  return count > 0
    ? `已保存 ${count} 条自动授权规则。未命中的请求仍然需要手动点击审批。`
    : "还没有自动授权规则。未命中的请求仍然需要手动点击审批。";
}

function resolveCapabilityEnabled(
  settings: ConversationWorkspaceSettings,
  capabilityId: string,
) {
  const storedPreference = settings.capabilityPreferences?.[capabilityId];
  if (typeof storedPreference === "boolean") {
    return storedPreference;
  }

  return false;
}

export function ConversationWorkspaceSettingsPanel(props: Props) {
  const { message } = App.useApp();
  const copy = useMemo(() => resolveCopy(props.language), [props.language]);
  const {
    settings: workspaceSettings,
    warnings: workspaceWarnings,
    loading: loadingWorkspaceSettings,
    saving: savingWorkspaceSettings,
    error: workspaceSettingsError,
    saveSettings: saveWorkspaceSettings,
  } = useConversationWorkspaceSettings(
    props.selectedWorkspace?.workspaceId,
  );
  const [contextCompressionThresholdPercent, setContextCompressionThresholdPercent] = useState(
    workspaceSettings.contextCompressionThresholdPercent,
  );
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<DesktopConversationCapabilityDescriptor[]>([]);
  const [capabilityLoadError, setCapabilityLoadError] = useState("");
  const [approvalRulesOpen, setApprovalRulesOpen] = useState(false);
  const savingSettings = savingWorkspaceSettings || loadingWorkspaceSettings;

  useEffect(() => {
    setContextCompressionThresholdPercent(workspaceSettings.contextCompressionThresholdPercent);
  }, [workspaceSettings.contextCompressionThresholdPercent]);

  useEffect(() => {
    let disposed = false;

    if (!props.selectedWorkspace?.workspaceId || !hasDesktopConversationBridge()) {
      setCapabilitiesLoading(false);
      setCapabilities([]);
      setCapabilityLoadError("");
      return undefined;
    }

    setCapabilitiesLoading(true);
    setCapabilityLoadError("");

    void listDesktopConversationCapabilities({
      workspaceId: props.selectedWorkspace.workspaceId,
      ...(props.selectedSession?.sessionId
        ? { sessionId: props.selectedSession.sessionId }
        : {}),
    })
      .then((response) => {
        if (disposed) {
          return;
        }

        setCapabilities(response.items);
      })
      .catch((error) => {
        if (disposed) {
          return;
        }

        setCapabilities([]);
        setCapabilityLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!disposed) {
          setCapabilitiesLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [props.selectedSession?.sessionId, props.selectedWorkspace?.workspaceId]);

  const persistWorkspaceSettings = useCallback(async (
    patch: Partial<ConversationWorkspaceSettings>,
  ) => {
    const workspaceId = props.selectedWorkspace?.workspaceId;
    if (!workspaceId) {
      return false;
    }

    if (!hasDesktopConversationBridge()) {
      void message.error(copy.settingsBridgeUnavailable);
      return false;
    }

    try {
      await saveWorkspaceSettings(patch, {
        syncExistingSessions: true,
      });
      return true;
    } catch (error) {
      void message.error(formatSettingsSaveErrorMessage(copy.settingsSaveFailed, error));
      return false;
    }
  }, [
    copy.settingsBridgeUnavailable,
    copy.settingsSaveFailed,
    message,
    props.selectedWorkspace?.workspaceId,
    saveWorkspaceSettings,
  ]);

  const handleContextCompressionThresholdPercentChange = useCallback((value: number) => {
    const nextValue = clampContextCompressionThresholdPercent(value);
    setContextCompressionThresholdPercent(nextValue);
    void persistWorkspaceSettings({
      contextCompressionThresholdPercent: nextValue,
    }).then((saved) => {
      if (!saved) {
        setContextCompressionThresholdPercent(workspaceSettings.contextCompressionThresholdPercent);
      }
    });
  }, [persistWorkspaceSettings, workspaceSettings.contextCompressionThresholdPercent]);

  const handleApprovalModeChange = useCallback((value: boolean) => {
    void persistWorkspaceSettings({
      approvalAutoEnabled: value,
    });
  }, [persistWorkspaceSettings]);

  const handleThinkingEnabledChange = useCallback((value: boolean) => {
    void persistWorkspaceSettings({
      thinkingEnabled: value,
    });
  }, [persistWorkspaceSettings]);

  const handleManagedExecutionChange = useCallback((value: boolean) => {
    void persistWorkspaceSettings({
      managedExecutionEnabled: value,
    });
  }, [persistWorkspaceSettings]);

  const handleMemoryEnabledChange = useCallback((value: boolean) => {
    void persistWorkspaceSettings({
      memoryEnabled: value,
      capabilityPreferences: {
        "memory.runtime": value,
      },
    });
  }, [persistWorkspaceSettings]);

  const handleSandboxEnabledChange = useCallback((value: boolean) => {
    void persistWorkspaceSettings({
      sandboxEnabled: value,
    });
  }, [persistWorkspaceSettings]);

  const handleFeishuEnabledChange = useCallback((value: boolean) => {
    void persistWorkspaceSettings({
      feishuSmartAssistantEnabled: value,
      capabilityPreferences: {
        "feishu.smartAssistant": value,
      },
    });
  }, [persistWorkspaceSettings]);

  const handleCapabilityToggleChange = useCallback((capabilityId: string, value: boolean) => {
    if (capabilityId === "memory.runtime") {
      handleMemoryEnabledChange(value);
      return;
    }

    if (capabilityId === "feishu.smartAssistant") {
      handleFeishuEnabledChange(value);
      return;
    }

    void persistWorkspaceSettings({
      capabilityPreferences: {
        [capabilityId]: value,
      },
    });
  }, [
    handleFeishuEnabledChange,
    handleMemoryEnabledChange,
    persistWorkspaceSettings,
  ]);

  const handleApprovalRulesSave = useCallback((rules: NonNullable<ConversationWorkspaceSettings["permissionRules"]>) => {
    void persistWorkspaceSettings({
      permissionRules: rules,
    }).then((saved) => {
      if (saved) {
        setApprovalRulesOpen(false);
      }
    });
  }, [persistWorkspaceSettings]);

  if (!props.selectedWorkspace) {
    return (
      <div className="chat-module-panel-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.emptyWorkspace} />
      </div>
    );
  }

  const managedExecutionEnabled = workspaceSettings.managedExecutionEnabled === true;
  const sandboxEnabled = workspaceSettings.sandboxEnabled === true;
  const approvalRuleCount = workspaceSettings.permissionRules?.filter((rule) => rule.decision === "approve_always").length ?? 0;
  const managedExecutionHint = managedExecutionEnabled
    ? copy.managedExecutionEnabledHint
    : copy.managedExecutionDisabledHint;
  const toggleCapabilities = capabilities.filter((item) => item.controlKind === "toggle");

  return (
    <div className="chat-session-settings-panel">
      <div className="chat-session-settings-panel-content">
        {workspaceWarnings.length > 0 ? (
          <Alert
            showIcon
            type="warning"
            message={copy.settingsWarningTitle}
            description={workspaceWarnings.join(" ")}
          />
        ) : null}

        {workspaceSettingsError ? (
          <Alert
            showIcon
            type="error"
            message={copy.settingsSaveFailed}
            description={workspaceSettingsError}
          />
        ) : null}

        <section className="chat-session-settings-section">
          <div className="chat-session-settings-section-head">
            <Typography.Title level={5} className="chat-session-settings-section-title">
              {copy.defaultsSectionTitle}
            </Typography.Title>
            <Typography.Paragraph className="chat-session-settings-section-meta">
              {copy.defaultsSectionMeta}
            </Typography.Paragraph>
          </div>

          <div className="chat-session-settings-field is-global-preference">
            <Typography.Text strong className="chat-session-settings-field-label">
              {copy.replyStyleLabel}
            </Typography.Text>
            <div className="chat-session-settings-field-control">
              <span className="chat-session-settings-mode-pill">
                {copy.replyStyleProgramming}
              </span>
            </div>
            <Typography.Paragraph className="chat-session-settings-hint">
              {copy.replyStyleHint}
            </Typography.Paragraph>
          </div>

          <div className="chat-session-settings-field is-global-preference">
            <Typography.Text strong className="chat-session-settings-field-label">
              {copy.approvalLabel}
            </Typography.Text>
            <div className="chat-session-settings-field-control">
              <Switch
                checked={workspaceSettings.approvalAutoEnabled}
                loading={savingSettings}
                onChange={handleApprovalModeChange}
                aria-label={copy.approvalLabel}
              />
              {!workspaceSettings.approvalAutoEnabled ? (
                <Button
                  size="small"
                  className="chat-session-settings-inline-action"
                  disabled={savingSettings}
                  onClick={() => setApprovalRulesOpen(true)}
                >
                  {copy.approvalConfigureLabel}
                </Button>
              ) : null}
            </div>
            <Typography.Paragraph className="chat-session-settings-hint">
              {copy.approvalHint}
            </Typography.Paragraph>
            {!workspaceSettings.approvalAutoEnabled ? (
              <Typography.Paragraph className="chat-session-settings-hint">
                {resolveApprovalRulesHint(props.language, approvalRuleCount)}
              </Typography.Paragraph>
            ) : null}
          </div>

          <div className="chat-session-settings-field is-global-preference">
            <Typography.Text strong className="chat-session-settings-field-label">
              {copy.compressionLabel}
            </Typography.Text>
            <div className="chat-session-settings-field-control">
              <Typography.Text type="secondary">
                {contextCompressionThresholdPercent}%
              </Typography.Text>
            </div>
            <Slider
              className="chat-session-settings-slider"
              min={CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN}
              max={CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX}
              step={5}
              disabled={savingSettings}
              value={contextCompressionThresholdPercent}
              onChange={(value) => {
                if (typeof value === "number") {
                  setContextCompressionThresholdPercent(clampContextCompressionThresholdPercent(value));
                }
              }}
              onChangeComplete={(value) => {
                if (typeof value === "number") {
                  handleContextCompressionThresholdPercentChange(value);
                }
              }}
              tooltip={{
                formatter: (value) => `${value ?? contextCompressionThresholdPercent}%`,
              }}
            />
            <Typography.Paragraph className="chat-session-settings-hint">
              {copy.compressionHint}
            </Typography.Paragraph>
          </div>
        </section>

        <section className="chat-session-settings-section">
          <div className="chat-session-settings-section-head">
            <Typography.Title level={5} className="chat-session-settings-section-title">
              {copy.runtimeSectionTitle}
            </Typography.Title>
            <Typography.Paragraph className="chat-session-settings-section-meta">
              {copy.runtimeSectionMeta}
            </Typography.Paragraph>
          </div>

          <div className="chat-session-settings-field">
            <Typography.Text strong className="chat-session-settings-field-label">
              {copy.thinkingLabel}
            </Typography.Text>
            <div className="chat-session-settings-field-control">
              <Switch
                checked={workspaceSettings.thinkingEnabled !== false}
                loading={savingSettings}
                onChange={handleThinkingEnabledChange}
                aria-label={copy.thinkingLabel}
              />
            </div>
            <Typography.Paragraph className="chat-session-settings-hint">
              {copy.thinkingHint}
            </Typography.Paragraph>
          </div>

          <div className="chat-session-settings-field">
            <Typography.Text strong className="chat-session-settings-field-label">
              {copy.managedExecutionLabel}
            </Typography.Text>
            <div className="chat-session-settings-field-control">
              <Switch
                checked={managedExecutionEnabled}
                loading={savingSettings}
                onChange={handleManagedExecutionChange}
                aria-label={copy.managedExecutionLabel}
              />
            </div>
            <Typography.Paragraph className="chat-session-settings-hint">
              {managedExecutionHint}
            </Typography.Paragraph>
          </div>

          <div className="chat-session-settings-field">
            <Typography.Text strong className="chat-session-settings-field-label">
              {copy.sandboxLabel}
            </Typography.Text>
            <div className="chat-session-settings-field-control">
              <Switch
                checked={sandboxEnabled}
                loading={savingSettings}
                onChange={handleSandboxEnabledChange}
                aria-label={copy.sandboxLabel}
              />
            </div>
            <Typography.Paragraph className="chat-session-settings-hint">
              {copy.sandboxHint}
            </Typography.Paragraph>
          </div>

          {toggleCapabilities.map((item) => (
            <div key={item.capabilityId} className="chat-session-settings-field">
              <Typography.Text strong className="chat-session-settings-field-label">
                {item.title}
              </Typography.Text>
              <div className="chat-session-settings-field-control">
                <Switch
                  checked={resolveCapabilityEnabled(workspaceSettings, item.capabilityId)}
                  loading={savingSettings}
                  disabled={savingSettings || capabilitiesLoading}
                  onChange={(value) => handleCapabilityToggleChange(item.capabilityId, value)}
                  aria-label={item.title}
                />
              </div>
              <Typography.Paragraph className="chat-session-settings-hint">
                {resolveCapabilityHint(item)}
              </Typography.Paragraph>
            </div>
          ))}

          {capabilityLoadError ? (
            <Alert
              showIcon
              type="error"
              message={copy.capabilityLoadErrorTitle}
              description={capabilityLoadError}
            />
          ) : null}
        </section>
      </div>
      <ConversationApprovalRulesModal
        open={approvalRulesOpen}
        language={props.language}
        rules={workspaceSettings.permissionRules ?? []}
        saving={savingSettings}
        onCancel={() => setApprovalRulesOpen(false)}
        onSubmit={handleApprovalRulesSave}
      />
    </div>
  );
}
