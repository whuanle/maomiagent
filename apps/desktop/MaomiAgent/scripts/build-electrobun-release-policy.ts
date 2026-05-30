export type DesktopReleaseTargetPlatform = {
  os: string;
  arch: string;
};

export type DesktopReleaseArtifactMode = "native-only" | "bundle-fallback";

export function resolveDesktopReleaseArtifactMode(
  targetPlatform: DesktopReleaseTargetPlatform,
): DesktopReleaseArtifactMode {
  return targetPlatform.os === "linux" ? "bundle-fallback" : "native-only";
}

export function formatDesktopReleaseTargetPlatform(
  targetPlatform: DesktopReleaseTargetPlatform,
): string {
  return `${targetPlatform.os}-${targetPlatform.arch}`;
}

export function buildDesktopNativePackagingFailureMessage(
  targetPlatform: DesktopReleaseTargetPlatform,
  errorMessage: string,
): string {
  const platformLabel = formatDesktopReleaseTargetPlatform(targetPlatform);
  const normalizedError = errorMessage.trim() || "unknown error";

  if (resolveDesktopReleaseArtifactMode(targetPlatform) === "bundle-fallback") {
    return `[release] Stable Electrobun packaging failed on ${platformLabel}, retrying with bundle-only export: ${normalizedError}`;
  }

  return `Native ${platformLabel} desktop release packaging failed. Bundle-only fallback is disabled for ${targetPlatform.os} releases because they must publish installer artifacts. Original error: ${normalizedError}`;
}
