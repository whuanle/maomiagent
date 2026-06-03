export function shouldFocusPrefilledDraft(
  previousDraft: string,
  nextDraft: string,
  input: { composerFocused?: boolean } = {},
) {
  if (previousDraft === nextDraft) {
    return false;
  }

  if (input.composerFocused) {
    return false;
  }

  return !previousDraft.trim() && Boolean(nextDraft.trim());
}
