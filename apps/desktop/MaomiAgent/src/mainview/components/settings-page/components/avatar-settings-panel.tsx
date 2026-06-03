import { Alert, App, Button, Empty, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import type { Translate } from "../../../i18n";
import {
  DESKTOP_WORKSPACE_BRIDGE_READY_EVENT,
  hasDesktopWorkspaceBridge,
} from "../../../lib/desktop-workspace";
import { fetchActiveWorkspace } from "../../../lib/workspace";
import {
  type ConversationWorkspaceSettings,
  useConversationWorkspaceSettings,
} from "../../../modules/chat/components/conversation-workspace-settings-storage";

type Props = {
  active: boolean;
  language: LanguageCode;
  t: Translate;
};

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "未知错误";
}

function formatSettingsSaveErrorMessage(title: string, error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return `${title}: ${error.message}`;
  }

  return title;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable in the current runtime."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read image file."));
    };
    reader.readAsDataURL(file);
  });
}

function resolveAvatarFallback(role: "assistant" | "user", language: LanguageCode) {
  if (role === "assistant") {
    return "AI";
  }

  return language === "en-US" ? "You" : "我";
}

function resolveWorkspaceLabel(workspace: DesktopWorkspaceItem) {
  return workspace.name.trim() || workspace.workspaceId;
}

export function AvatarSettingsPanel(props: Props) {
  const { message } = App.useApp();
  const [workspaceBridgeReady, setWorkspaceBridgeReady] = useState(
    () => typeof window !== "undefined" && hasDesktopWorkspaceBridge(),
  );
  const [activeWorkspace, setActiveWorkspace] = useState<DesktopWorkspaceItem | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState("");
  const assistantAvatarInputRef = useRef<HTMLInputElement>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);
  const {
    settings: workspaceSettings,
    warnings: workspaceWarnings,
    loading: loadingWorkspaceSettings,
    saving: savingWorkspaceSettings,
    error: workspaceSettingsError,
    saveSettings: saveWorkspaceSettings,
  } = useConversationWorkspaceSettings(activeWorkspace?.workspaceId);
  const savingSettings = workspaceLoading || loadingWorkspaceSettings || savingWorkspaceSettings;

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncBridgeReady = () => {
      setWorkspaceBridgeReady(hasDesktopWorkspaceBridge());
    };

    syncBridgeReady();
    window.addEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeReady);
    return () => {
      window.removeEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeReady);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    if (!props.active || !workspaceBridgeReady) {
      setWorkspaceLoading(false);
      if (!workspaceBridgeReady) {
        setActiveWorkspace(null);
      }
      return undefined;
    }

    setWorkspaceLoading(true);
    setWorkspaceLoadError("");

    void fetchActiveWorkspace("desktop://settings")
      .then((response) => {
        if (disposed) {
          return;
        }

        setActiveWorkspace(response.item ?? response.active ?? null);
      })
      .catch((error) => {
        if (disposed) {
          return;
        }

        setActiveWorkspace(null);
        setWorkspaceLoadError(normalizeErrorMessage(error));
      })
      .finally(() => {
        if (!disposed) {
          setWorkspaceLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [props.active, workspaceBridgeReady]);

  const persistWorkspaceSettings = useCallback(async (
    patch: Partial<ConversationWorkspaceSettings>,
  ) => {
    if (!activeWorkspace?.workspaceId) {
      return false;
    }

    try {
      await saveWorkspaceSettings(patch, {
        syncExistingSessions: true,
      });
      return true;
    } catch (error) {
      void message.error(formatSettingsSaveErrorMessage(props.t("设置页.头像.保存失败"), error));
      return false;
    }
  }, [activeWorkspace?.workspaceId, message, props, saveWorkspaceSettings]);

  const handleAvatarFileChange = useCallback(async (
    role: "assistant" | "user",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      void message.error(props.t("设置页.头像.上传失败"));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl) {
        throw new Error("Failed to read image file.");
      }

      await persistWorkspaceSettings(
        role === "assistant"
          ? { assistantAvatarDataUrl: dataUrl }
          : { userAvatarDataUrl: dataUrl },
      );
    } catch (error) {
      void message.error(formatSettingsSaveErrorMessage(props.t("设置页.头像.上传失败"), error));
    }
  }, [message, persistWorkspaceSettings, props]);

  const handleAvatarClear = useCallback(async (role: "assistant" | "user") => {
    await persistWorkspaceSettings(
      role === "assistant"
        ? { assistantAvatarDataUrl: undefined }
        : { userAvatarDataUrl: undefined },
    );
  }, [persistWorkspaceSettings]);

  const workspaceLabel = useMemo(
    () => (activeWorkspace ? resolveWorkspaceLabel(activeWorkspace) : ""),
    [activeWorkspace],
  );

  return (
    <section className="settings-page-card settings-page-avatar-card">
      <header className="settings-page-card-header settings-page-avatar-header">
        <div className="settings-page-card-title-row">
          <h2>{props.t("设置页.标题.对话头像设置")}</h2>
        </div>
        {workspaceLabel ? (
          <Typography.Text type="secondary" className="settings-page-avatar-workspace">
            {props.t("设置页.头像.当前工作区", { 工作区: workspaceLabel })}
          </Typography.Text>
        ) : null}
      </header>

      <Typography.Paragraph className="settings-page-avatar-meta">
        {props.t("设置页.头像.说明")}
      </Typography.Paragraph>

      {workspaceWarnings.length > 0 ? (
        <Alert
          showIcon
          type="warning"
          message={props.t("设置页.头像.警告标题")}
          description={workspaceWarnings.join(" ")}
        />
      ) : null}

      {workspaceSettingsError ? (
        <Alert
          showIcon
          type="error"
          message={props.t("设置页.头像.保存失败")}
          description={workspaceSettingsError}
        />
      ) : null}

      {workspaceLoadError ? (
        <Alert
          showIcon
          type="error"
          message={props.t("设置页.头像.工作区读取失败")}
          description={workspaceLoadError}
        />
      ) : null}

      {!workspaceBridgeReady ? (
        <Alert
          showIcon
          type="warning"
          message={props.t("设置页.头像.工作区桥接不可用")}
        />
      ) : workspaceLoading && !activeWorkspace ? (
        <Typography.Paragraph className="settings-page-avatar-loading">
          {props.t("设置页.头像.工作区加载中")}
        </Typography.Paragraph>
      ) : !activeWorkspace ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={props.t("设置页.头像.无工作区")}
        />
      ) : (
        <>
          <input
            ref={assistantAvatarInputRef}
            className="settings-page-avatar-input"
            type="file"
            accept="image/*"
            aria-label={props.t("设置页.头像.AI标签")}
            onChange={(event) => {
              void handleAvatarFileChange("assistant", event);
            }}
          />

          <input
            ref={userAvatarInputRef}
            className="settings-page-avatar-input"
            type="file"
            accept="image/*"
            aria-label={props.t("设置页.头像.用户标签")}
            onChange={(event) => {
              void handleAvatarFileChange("user", event);
            }}
          />

          <div className="settings-page-avatar-fields">
            <div className="settings-page-avatar-field">
              <div className="settings-page-avatar-copy">
                <Typography.Text strong>
                  {props.t("设置页.头像.AI标签")}
                </Typography.Text>
                <Typography.Paragraph className="settings-page-avatar-hint">
                  {props.t("设置页.头像.提示")}
                </Typography.Paragraph>
              </div>

              <div className="settings-page-avatar-control">
                <span className="settings-page-avatar-preview" aria-hidden="true">
                  {workspaceSettings.assistantAvatarDataUrl ? (
                    <img className="settings-page-avatar-image" src={workspaceSettings.assistantAvatarDataUrl} alt="" />
                  ) : (
                    <span className="settings-page-avatar-fallback">AI</span>
                  )}
                </span>
                <Button
                  size="small"
                  disabled={savingSettings}
                  onClick={() => assistantAvatarInputRef.current?.click()}
                >
                  {props.t("设置页.头像.上传")}
                </Button>
                <Button
                  size="small"
                  disabled={savingSettings || !workspaceSettings.assistantAvatarDataUrl}
                  onClick={() => {
                    void handleAvatarClear("assistant");
                  }}
                >
                  {props.t("设置页.头像.清除")}
                </Button>
              </div>
            </div>

            <div className="settings-page-avatar-field">
              <div className="settings-page-avatar-copy">
                <Typography.Text strong>
                  {props.t("设置页.头像.用户标签")}
                </Typography.Text>
                <Typography.Paragraph className="settings-page-avatar-hint">
                  {props.t("设置页.头像.提示")}
                </Typography.Paragraph>
              </div>

              <div className="settings-page-avatar-control">
                <span className="settings-page-avatar-preview" aria-hidden="true">
                  {workspaceSettings.userAvatarDataUrl ? (
                    <img className="settings-page-avatar-image" src={workspaceSettings.userAvatarDataUrl} alt="" />
                  ) : (
                    <span className="settings-page-avatar-fallback">
                      {resolveAvatarFallback("user", props.language)}
                    </span>
                  )}
                </span>
                <Button
                  size="small"
                  disabled={savingSettings}
                  onClick={() => userAvatarInputRef.current?.click()}
                >
                  {props.t("设置页.头像.上传")}
                </Button>
                <Button
                  size="small"
                  disabled={savingSettings || !workspaceSettings.userAvatarDataUrl}
                  onClick={() => {
                    void handleAvatarClear("user");
                  }}
                >
                  {props.t("设置页.头像.清除")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
