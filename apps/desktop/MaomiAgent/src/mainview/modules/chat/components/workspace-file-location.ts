type ResolveWorkspaceFileContainingDirectoryInput = {
  absolutePath: string;
  fallbackPath?: string;
};

function isWindowsDriveRoot(path: string) {
  return /^[A-Za-z]:[\\/]?$/.test(path);
}

function isAbsoluteWorkspacePath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path)
    || path.startsWith("\\\\")
    || path.startsWith("/");
}

function trimTrailingSeparators(path: string) {
  if (!path) {
    return "";
  }

  if (path === "/") {
    return path;
  }

  if (isWindowsDriveRoot(path)) {
    return path.replace(/\//g, "\\");
  }

  return path.replace(/[\\/]+$/g, "");
}

export function resolveWorkspaceAbsolutePath(input: {
  path: string;
  rootPath?: string;
}) {
  const path = input.path.trim();
  if (!path) {
    return "";
  }

  if (isAbsoluteWorkspacePath(path)) {
    return path;
  }

  const rootPath = trimTrailingSeparators(input.rootPath?.trim() ?? "");
  if (!rootPath) {
    return path;
  }

  if (path === ".") {
    return rootPath;
  }

  const separator = rootPath.includes("\\") ? "\\" : "/";
  const normalizedRelativePath = path
    .replace(/[\\/]+/g, separator)
    .replace(/^[\\/]+/g, "");

  if (!normalizedRelativePath) {
    return rootPath;
  }

  return `${rootPath}${rootPath.endsWith(separator) ? "" : separator}${normalizedRelativePath}`;
}

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
