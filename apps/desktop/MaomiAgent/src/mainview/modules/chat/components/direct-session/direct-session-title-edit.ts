export function resolveSessionTitleRenameInput(currentTitle: string, draftTitle: string) {
  const normalizedTitle = draftTitle.trim();
  if (!normalizedTitle || normalizedTitle === currentTitle.trim()) {
    return undefined;
  }

  return normalizedTitle;
}
