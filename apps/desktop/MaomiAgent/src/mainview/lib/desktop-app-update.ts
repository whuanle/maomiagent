import type {
  DesktopAppUpdateCheckResult,
  DesktopAppUpdateInstallInput,
  DesktopAppUpdateInstallResult,
} from "../../shared/desktop-updater";

type DesktopAppUpdateBridge = {
  checkDesktopAppUpdate: () => Promise<DesktopAppUpdateCheckResult>;
  installDesktopAppUpdate: (input: DesktopAppUpdateInstallInput) => Promise<DesktopAppUpdateInstallResult>;
};

type InstallableDesktopAppUpdateResult = DesktopAppUpdateCheckResult & {
  releaseId: number;
  releaseVersion: string;
  releaseVersionCode: number;
  bundleAsset: NonNullable<DesktopAppUpdateCheckResult["bundleAsset"]>;
};

declare global {
  interface Window {
    maomiDesktopAppUpdate?: DesktopAppUpdateBridge;
  }
}

function getDesktopAppUpdateBridge(): DesktopAppUpdateBridge {
  const bridge = window.maomiDesktopAppUpdate;
  if (!bridge) {
    throw new Error("Desktop app update bridge is unavailable.");
  }

  return bridge;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function canInstallDesktopAppUpdate(
  result: DesktopAppUpdateCheckResult | null | undefined,
): result is InstallableDesktopAppUpdateResult {
  return Boolean(
    result?.hasUpdate
      && isPositiveInteger(result.releaseId)
      && result.releaseVersion
      && isPositiveInteger(result.releaseVersionCode)
      && result.bundleAsset
      && isPositiveInteger(result.bundleAsset.assetId)
      && isPositiveInteger(result.bundleAsset.fileSize),
  );
}

export async function checkDesktopAppUpdate(): Promise<DesktopAppUpdateCheckResult> {
  return getDesktopAppUpdateBridge().checkDesktopAppUpdate();
}

export async function installDesktopAppUpdate(
  input: DesktopAppUpdateInstallInput,
): Promise<DesktopAppUpdateInstallResult> {
  return getDesktopAppUpdateBridge().installDesktopAppUpdate(input);
}
