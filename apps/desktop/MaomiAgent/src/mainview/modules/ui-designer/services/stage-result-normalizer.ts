const ARTIFACT_TO_FILE = {
  scope: "scopeJson",
  stack: "stackJson",
  theme: "themeJson",
  patterns: "patternsJson",
  layouts: "layoutsJson",
  pages: "pagesJson",
  spec: "designSpecMarkdown",
  sources: "sourcesMarkdown",
} as const;

export type UiDesignerNormalizedStageResult = {
  stageKey: string;
  summary: string;
  detail: Record<string, unknown>;
  files: Record<string, string>;
  nextSuggestedStage?: string;
};

export function normalizeStageResult(input: {
  stageKey: string;
  summary: string;
  detail: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  nextSuggestedStage?: string;
}): UiDesignerNormalizedStageResult {
  const files: Record<string, string> = {};

  for (const [artifactKey, artifactValue] of Object.entries(input.artifacts)) {
    const targetFileKey = ARTIFACT_TO_FILE[artifactKey as keyof typeof ARTIFACT_TO_FILE];
    if (!targetFileKey) {
      throw new Error(`Unsupported stage artifact: ${artifactKey}`);
    }

    files[targetFileKey] = targetFileKey === "designSpecMarkdown" || targetFileKey === "sourcesMarkdown"
      ? String(artifactValue)
      : JSON.stringify(artifactValue, null, 2);
  }

  return {
    stageKey: input.stageKey,
    summary: input.summary,
    detail: input.detail,
    files,
    nextSuggestedStage: input.nextSuggestedStage,
  };
}
