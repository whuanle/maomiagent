import { App as AntdApp, Button, Descriptions, Space, Tag, Typography } from "antd";
import { useState } from "react";

import type { Translate } from "../../../i18n";
import {
  canInstallDesktopAppUpdate,
  checkDesktopAppUpdate,
  installDesktopAppUpdate,
  resolveDesktopAppUpdateDownloadAsset,
} from "../../../lib/desktop-app-update";
import { openDesktopExternalUrl, runDesktopWindowAction } from "../../../lib/desktop-window";
import type { RuntimeStatus } from "../../../types/status";
import type { DesktopAppUpdateCheckResult } from "../../../../shared/desktop-updater";

type Props = {
  t: Translate;
  status: RuntimeStatus;
};

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveStatusColor(result: DesktopAppUpdateCheckResult | null): "default" | "success" | "warning" | "error" {
  if (!result) {
    return "default";
  }
  if (!result.supported || !result.configured) {
    return "default";
  }
  return result.hasUpdate ? "warning" : "success";
}

export function AppUpdatePanel(props: Props) {
  const { message } = AntdApp.useApp();
  const [result, setResult] = useState<DesktopAppUpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const installableResult = canInstallDesktopAppUpdate(result) ? result : null;
  const downloadAsset = resolveDesktopAppUpdateDownloadAsset(result);
  const canInstall = Boolean(installableResult) && !checking;
  const canDownload = Boolean(downloadAsset) && !checking && !installing;
  const displayedAsset = installableResult?.bundleAsset || downloadAsset || result?.bundleAsset || result?.installerAsset;

  async function handleCheck() {
    setChecking(true);
    try {
      const nextResult = await checkDesktopAppUpdate();
      setResult(nextResult);
      if (nextResult.hasUpdate) {
        message.success(props.t("设置页.更新.反馈.发现更新"));
      } else {
        message.success(nextResult.message || props.t("设置页.更新.状态.已是最新"));
      }
    } catch (error) {
      setResult(null);
      message.error(`${props.t("设置页.更新.反馈.检查失败")}: ${normalizeError(error)}`);
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    if (!installableResult) {
      return;
    }

    setInstalling(true);
    try {
      const installResult = await installDesktopAppUpdate({
        releaseId: installableResult.releaseId,
        bundleAssetId: installableResult.bundleAsset.assetId,
        bundleFileSize: installableResult.bundleAsset.fileSize,
        bundleDownloadUrl: installableResult.bundleAsset.downloadUrl || "",
        targetVersion: installableResult.releaseVersion,
        targetVersionCode: installableResult.releaseVersionCode,
        updateInfoAssetId: installableResult.updateInfoAsset?.assetId,
        updateInfoDownloadUrl: installableResult.updateInfoAsset?.downloadUrl,
      });
      message.success(installResult.message);
      if (installResult.closeRequested) {
        window.setTimeout(() => {
          void runDesktopWindowAction("close");
        }, 240);
      }
    } catch (error) {
      message.error(`${props.t("设置页.更新.反馈.安装失败")}: ${normalizeError(error)}`);
    } finally {
      setInstalling(false);
    }
  }

  async function handleDownload() {
    if (!downloadAsset?.downloadUrl) {
      return;
    }

    setInstalling(true);
    try {
      await openDesktopExternalUrl(downloadAsset.downloadUrl);
      message.success(props.t("设置页.更新.反馈.已打开下载链接"));
    } catch (error) {
      message.error(`${props.t("设置页.更新.反馈.打开下载失败")}: ${normalizeError(error)}`);
    } finally {
      setInstalling(false);
    }
  }

  const currentVersion = result?.currentVersion || props.status.runtime?.version || "-";
  const currentChannel = result?.currentChannel || "-";
  const statusText = result?.message || props.t("设置页.更新.状态.未检查");

  return (
    <section className="settings-page-card settings-page-update-card">
      <header className="settings-page-card-header settings-page-update-header">
        <div className="settings-page-card-title-row">
          <h2>{props.t("设置页.标题.应用更新")}</h2>
        </div>
        <Space size={8} wrap>
          {result?.isForceUpdate ? <Tag color="error">{props.t("设置页.更新.标签.强制")}</Tag> : null}
          {result?.isPrerelease ? <Tag color="gold">{props.t("设置页.更新.标签.预发布")}</Tag> : null}
          <Tag color={resolveStatusColor(result)}>{statusText}</Tag>
        </Space>
      </header>

      <Descriptions column={2} size="small" colon={false} className="settings-page-update-descriptions">
        <Descriptions.Item label={props.t("设置页.更新.字段.当前版本")}>{currentVersion}</Descriptions.Item>
        <Descriptions.Item label={props.t("设置页.更新.字段.当前通道")}>{currentChannel}</Descriptions.Item>
        <Descriptions.Item label={props.t("设置页.更新.字段.目标版本")}>{result?.releaseVersion || "-"}</Descriptions.Item>
        <Descriptions.Item label={props.t("设置页.更新.字段.安装包")}>
          {displayedAsset?.fileName || "-"}
        </Descriptions.Item>
        <Descriptions.Item label={props.t("设置页.更新.字段.说明")} span={2}>
          <Typography.Paragraph className="settings-page-update-notes">
            {result?.releaseNotes || "-"}
          </Typography.Paragraph>
        </Descriptions.Item>
      </Descriptions>

      <div className="settings-page-update-actions">
        <Button type="default" loading={checking} onClick={() => void handleCheck()}>
          {props.t("设置页.更新.按钮.检查更新")}
        </Button>
        <Button
          type="primary"
          loading={installing}
          disabled={!canInstall && !canDownload}
          onClick={() => void (canInstall ? handleInstall() : handleDownload())}
        >
          {canInstall ? props.t("设置页.更新.按钮.下载安装") : props.t("设置页.更新.按钮.下载更新")}
        </Button>
      </div>
    </section>
  );
}
