type ResolveWorkspaceFileContainingDirectoryInput = {
  absolutePath: string;
  fallbackPath?: string;
};

export function resolveWorkspaceFileContainingDirectory(
  input: ResolveWorkspaceFileContainingDirectoryInput,
) {
  const absolutePath = input.absolutePath.trim();
  const fallbackPath = input.fallbackPath?.trim() || "";
  if (!absolutePath) {
    return fallbackPath;
  }

  const separatorIndex = Math.max(absolutePath.lastIndexOf("/"), absolutePath.lastIndexOf("\\"));
  if (separatorIndex < 0) {
    return fallbackPath || absolutePath;
  }
  if (separatorIndex === 2 && /^[A-Za-z]:/.test(absolutePath)) {
    return absolutePath.slice(0, separatorIndex + 1);
  }
  if (separatorIndex === 0) {
    return absolutePath.slice(0, 1);
  }

  return absolutePath.slice(0, separatorIndex);
}
