import type { UiDesignerStageViewModel } from "./stage-view-model-resolver";

export function resolveStageActionLabel(
  status: UiDesignerStageViewModel["status"],
  pending = false,
) {
  if (pending) {
    return "继续填写";
  }

  return status === "empty" ? "开始设计" : "重新设计";
}

export function isStageActionVisible(stageViewModels: UiDesignerStageViewModel[], stageIndex: number) {
  if (stageIndex <= 0) {
    return true;
  }

  return stageViewModels.slice(0, stageIndex).every((item) => item.status === "complete");
}
