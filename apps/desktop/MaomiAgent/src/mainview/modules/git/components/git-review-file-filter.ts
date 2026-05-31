import type { DesktopGitHistoryDetailFile, DesktopGitReviewItem } from "../../../../shared/desktop-git";

const BINARY_REVIEW_FILE_SUFFIXES = [
  ".7z",
  ".ai",
  ".avif",
  ".avi",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".flac",
  ".gif",
  ".gz",
  ".heic",
  ".heif",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".psd",
  ".rar",
  ".sketch",
  ".so",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".ttf",
  ".war",
  ".wasm",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
] as const;

function normalizeCandidatePath(path: string) {
  return path.trim().replaceAll("\\", "/").toLowerCase();
}

export function isLikelyBinaryReviewPath(path: string) {
  const normalized = normalizeCandidatePath(path);
  if (!normalized) {
    return false;
  }

  return BINARY_REVIEW_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function isLikelyBinaryReviewItem(item: Pick<DesktopGitReviewItem, "path" | "patch" | "before" | "after">) {
  if (isLikelyBinaryReviewPath(item.path)) {
    return true;
  }

  return item.patch.includes("\u0000")
    || item.before.includes("\u0000")
    || item.after.includes("\u0000")
    || /Binary files .* differ/u.test(item.patch);
}

export function filterReviewableWorkspacePaths(paths: readonly string[]) {
  return paths.filter((path) => !isLikelyBinaryReviewPath(path));
}

export function filterReviewableHistoryFiles(files: readonly DesktopGitHistoryDetailFile[]) {
  return files.filter((file) => !isLikelyBinaryReviewPath(file.path));
}

export function filterReviewableGitItems(items: readonly DesktopGitReviewItem[]) {
  return items.filter((item) => !isLikelyBinaryReviewItem(item));
}
