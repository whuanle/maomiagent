export type DesktopAppUpdateAsset = {
  assetId: number;
  packageType: string;
  packageFormat: string;
  fileName: string;
  fileSize: number;
};

export type DesktopAppUpdateCheckResult = {
  configured: boolean;
  supported: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  currentVersionCode: number;
  currentChannel: string;
  message?: string;
  releaseId?: number;
  releaseVersion?: string;
  releaseVersionCode?: number;
  title?: string;
  releaseNotes?: string;
  isForceUpdate?: boolean;
  isPrerelease?: boolean;
  bundleAsset?: DesktopAppUpdateAsset;
  installerAsset?: DesktopAppUpdateAsset;
  updateInfoAsset?: DesktopAppUpdateAsset;
};

export type DesktopAppUpdateInstallInput = {
  releaseId: number;
  bundleAssetId: number;
  bundleFileSize: number;
  targetVersion: string;
  targetVersionCode: number;
  updateInfoAssetId?: number;
};

export type DesktopAppUpdateInstallResult = {
  scheduled: boolean;
  closeRequested: boolean;
  targetVersion: string;
  targetVersionCode: number;
  message: string;
};