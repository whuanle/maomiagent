import type {
  DesktopAiOneShotRequest,
  DesktopAiOneShotResponse,
} from "../../shared/desktop-ai";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopAiBridge = {
  executeDesktopAiOneShot: (
    input: DesktopAiOneShotRequest,
  ) => Promise<DesktopAiOneShotResponse>;
};

declare global {
  interface Window {
    maomiDesktopAi?: DesktopAiBridge;
  }
}

export const DESKTOP_AI_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopAiBridge(): DesktopAiBridge {
  const bridge = window.maomiDesktopAi;
  if (!bridge) {
    throw new Error("Desktop AI bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopAiBridge(): boolean {
  return Boolean(window.maomiDesktopAi);
}

export function executeDesktopAiOneShot(
  input: DesktopAiOneShotRequest,
): Promise<DesktopAiOneShotResponse> {
  return getDesktopAiBridge().executeDesktopAiOneShot(input);
}