export function shouldFocusPrefilledDraft(previousDraft: string, nextDraft: string) {
  if (previousDraft === nextDraft) {
    return false;
  }

  return !previousDraft.trim() && Boolean(nextDraft.trim());
}
