export type DesktopAppUpdateAsset = {
  assetId: number;
  packageType: string;
  packageFormat: string;
  fileName: string;
  fileSize: number;
  os?: string;
  arch?: string;
  fileHash?: string;
  downloadUrl?: string;
};

export type DesktopAppUpdateCheckResult = {
  configured: boolean;
  supported: boolean;
  installSupported: boolean;
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
  downloadAsset?: DesktopAppUpdateAsset;
};

export type DesktopAppUpdateInstallInput = {
  releaseId: number;
  bundleAssetId: number;
  bundleFileSize: number;
  bundleDownloadUrl: string;
  targetVersion: string;
  targetVersionCode: number;
  updateInfoAssetId?: number;
  updateInfoDownloadUrl?: string;
};

export type DesktopAppUpdateInstallResult = {
  scheduled: boolean;
  closeRequested: boolean;
  targetVersion: string;
  targetVersionCode: number;
  message: string;
};
