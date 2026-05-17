type ShouldRenderToolTraceBodyInput = {
  command: string;
  cwd: string;
  previewPaths: readonly string[];
  preview?: string;
  canLoadFullOutput: boolean;
};

export function shouldRenderToolTraceBody(input: ShouldRenderToolTraceBodyInput) {
  return input.canLoadFullOutput
    || Boolean(input.cwd || input.command || input.previewPaths.length > 0 || input.preview);
}
