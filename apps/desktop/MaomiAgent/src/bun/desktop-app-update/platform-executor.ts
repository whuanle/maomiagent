export type DesktopAppUpdatePlatformExecutor =
  | {
      supported: true;
    }
  | {
      supported: false;
      message: string;
    };

export const PORTABLE_DESKTOP_APP_UPDATE_MESSAGE =
  "Portable desktop releases are download-only. Download the latest package from the release assets, or run npm update -g maomiagent if you installed via npm.";
export const WINDOWS_ONLY_DESKTOP_APP_UPDATE_MESSAGE = PORTABLE_DESKTOP_APP_UPDATE_MESSAGE;

export function resolveDesktopAppUpdatePlatformExecutor(
  platform: string = process.platform,
): DesktopAppUpdatePlatformExecutor {
  void platform;

  return {
    supported: false,
    message: PORTABLE_DESKTOP_APP_UPDATE_MESSAGE,
  };
}
