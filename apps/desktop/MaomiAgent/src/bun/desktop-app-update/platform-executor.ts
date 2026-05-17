export type DesktopAppUpdatePlatformExecutor =
  | {
      supported: true;
    }
  | {
      supported: false;
      message: string;
    };

export const WINDOWS_ONLY_DESKTOP_APP_UPDATE_MESSAGE = "Desktop self-update currently supports Windows only.";

export function resolveDesktopAppUpdatePlatformExecutor(
  platform: string = process.platform,
): DesktopAppUpdatePlatformExecutor {
  if (platform === "win32") {
    return {
      supported: true,
    };
  }

  return {
    supported: false,
    message: WINDOWS_ONLY_DESKTOP_APP_UPDATE_MESSAGE,
  };
}